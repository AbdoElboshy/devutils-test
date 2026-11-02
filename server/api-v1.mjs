/**
 * Phase 10 sub-track B — public /api/v1 gateway.
 * Mounted by index.mjs via mountApiV1(app, { service, usage }).
 * Reuses the existing api_keys table (Phase 6/8) and the transport-neutral
 * operations registry bundled to dist/operations.server.mjs by build:server-ops.
 *
 * Endpoints:
 *   GET  /api/v1/operations             — scope tools:read
 *   POST /api/v1/operations/:id/execute — scope tools:execute
 *
 * Errors are honest: 401 bad/revoked key, 403 wrong scope, 404 unknown op,
 * 413 oversize input, 429 rate limit or monthly quota, 500 executor failure.
 */
import { createHash } from "node:crypto";

let executeOperation = null;
let registry = null;
try {
  ({ executeOperation, operations: registry } = await import("../dist/operations.server.mjs"));
} catch {
  // dist bundle missing: endpoints answer 503 with an honest message.
}

import { upstreamStatus } from "./lib.mjs";

/* ---------- pure helpers (unit-tested in scripts/test-server.mjs) ---------- */

export const API_V1_SCOPES = ["tools:read", "tools:execute", "workflows:execute"];

/** Parse the Authorization header into a bearer secret, or null. */
export function parseBearer(header) {
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(du_live_[A-Za-z0-9_-]+)$/.exec(header.trim());
  return match ? match[1] : null;
}

export function hashApiKey(secret) {
  return createHash("sha256").update(String(secret)).digest("hex");
}

/** Resolve a key row into an auth verdict. Row shape from the api_keys table. */
export function authzKey(row, requiredScope) {
  if (!row) return { status: 401, error: "Unknown or malformed API key." };
  if (row.revoked_at) return { status: 401, error: "This API key has been revoked." };
  if (!Array.isArray(row.scopes) || !row.scopes.includes(requiredScope)) {
    return { status: 403, error: `This API key is missing the '${requiredScope}' scope.` };
  }
  return { status: 0, key: { id: row.id, userId: row.user_id, scopes: row.scopes } };
}

/** In-memory sliding-window rate limiter (per key): 30 requests / minute. */
const buckets = new Map(); // keyId -> timestamps
const WINDOW_MS = 60_000;
const WINDOW_MAX = 30;

export function allowRate(keyId, now = Date.now()) {
  const hits = (buckets.get(keyId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= WINDOW_MAX) {
    buckets.set(keyId, hits);
    return { ok: false, retryAfterMs: WINDOW_MS - (now - hits[0]) };
  }
  hits.push(now);
  buckets.set(keyId, hits);
  return { ok: true };
}

/** Monthly quota check against a plan limit. null/undefined = unlimited. */
export function checkMonthlyQuota(planLimit, usedThisMonth) {
  if (planLimit === null || planLimit === undefined) return { ok: true };
  const limit = Number(planLimit);
  if (!Number.isInteger(limit) || limit < 0) return { ok: true };
  const used = Number(usedThisMonth ?? 0);
  if (used >= limit) return { ok: false, limit, used, error: "Monthly API request quota exceeded for this plan." };
  return { ok: true };
}

/** Map AppError-like executor failures to public /api/v1 status codes. */
export function apiV1ErrorStatus(error) {
  const code = String(error?.code ?? error?.name ?? "");
  if (code === "NOT_FOUND") return 404;
  if (code === "LIMIT_EXCEEDED") return 413;
  if (code === "INVALID_INPUT" || code === "NETWORK_REQUIRED") return 400;
  const message = String(error?.message ?? "");
  if (/must be|required|invalid/i.test(message)) return 400;
  return 500;
}

/** Default monthly limits by plan (mirrors src/platform/features.ts). */
export const API_V1_PLAN_LIMITS = Object.freeze({ anonymous: 0, free: 1000, pro: 50000, team: 250000, enterprise: null });

/* ---------- in-memory usage counter (injectable for persistence later) ---------- */

export function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function createMemoryUsage() {
  const counts = new Map(); // `${userId}|${month}` -> number
  return {
    async read(userId) { return counts.get(`${userId}|${monthKey()}`) ?? 0; },
    async count(userId) { const k = `${userId}|${monthKey()}`; counts.set(k, (counts.get(k) ?? 0) + 1); },
  };
}

/* ---------- mount ---------- */

function corsHeaders(res) {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
  });
}

export function mountApiV1(app, { service, usage, planOf }) {
  const usageStore = usage ?? createMemoryUsage();
  const planLimitOf = planOf ?? (async () => "free");

  async function loadKey(secret) {
    const hash = hashApiKey(secret);
    const r = await service.from("api_keys").select("id,user_id,scopes,revoked_at").eq("key_hash", hash).maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  }

  async function authenticate(req, res, scope) {
    const secret = parseBearer(req.headers.authorization);
    if (!secret) {
      corsHeaders(res);
      res.status(401).json({ error: "Missing or malformed Authorization header. Use: Authorization: Bearer du_live_..." });
      return null;
    }
    let row;
    try {
      row = await loadKey(secret);
    } catch {
      corsHeaders(res);
      res.status(502).json({ error: "API key lookup unavailable." });
      return null;
    }
    const verdict = authzKey(row, scope);
    if (verdict.status !== 0) {
      corsHeaders(res);
      res.status(verdict.status).json({ error: verdict.error });
      return null;
    }
    return verdict.key;
  }

  app.options("/api/v1/operations", (_req, res) => { corsHeaders(res); res.status(204).end(); });
  app.options("/api/v1/operations/:id/execute", (_req, res) => { corsHeaders(res); res.status(204).end(); });
  app.options("/api/v1/usage", (_req, res) => { corsHeaders(res); res.status(204).end(); });

  app.get("/api/v1/operations", async (req, res) => {
    const key = await authenticate(req, res, "tools:read");
    if (!key) return;
    corsHeaders(res);
    if (!registry) return res.status(503).json({ error: "Operation registry unavailable. Run 'npm run build:server-ops' and restart." });
    const list = registry.list().map((op) => ({
      id: op.id, title: op.title, description: op.description,
      maximumInputBytes: op.maximumInputBytes ?? null, clientSide: Boolean(op.clientSide),
    }));
    res.json({ ok: true, operations: list, count: list.length });
  });

  app.get("/api/v1/usage", async (req, res) => {
    const key = await authenticate(req, res, "tools:read");
    if (!key) return;
    corsHeaders(res);
    try {
      const planId = await planLimitOf(key.userId);
      const limit = API_V1_PLAN_LIMITS[planId] ?? API_V1_PLAN_LIMITS.free;
      const used = await usageStore.read(key.userId);
      res.json({ ok: true, plan: planId, limit, remaining: limit === null ? null : Math.max(0, limit - used), used, month: monthKey() });
    } catch {
      res.status(502).json({ error: "Usage lookup unavailable." });
    }
  });

  app.post("/api/v1/operations/:id/execute", async (req, res) => {
    const key = await authenticate(req, res, "tools:execute");
    if (!key) return;
    corsHeaders(res);

    const rate = allowRate(key.id);
    if (!rate.ok) return res.status(429).set("Retry-After", String(Math.ceil(rate.retryAfterMs / 1000))).json({ error: "Rate limit exceeded: 30 requests per minute per key." });

    if (!executeOperation) return res.status(503).json({ error: "Executor unavailable. Run 'npm run build:server-ops' and restart." });

    try {
      const planId = await planLimitOf(key.userId);
      const limit = API_V1_PLAN_LIMITS[planId] ?? API_V1_PLAN_LIMITS.free;
      const used = await usageStore.read(key.userId);
      const quota = checkMonthlyQuota(limit, used);
      if (!quota.ok) return res.status(429).json({ error: quota.error, limit: quota.limit, used: quota.used });

      const result = await executeOperation({ operationId: String(req.params.id).slice(0, 200), input: req.body, config: undefined });
      await usageStore.count(key.userId);
      touchLastUsed(key.id, service);
      res.json(result);
    } catch (error) {
      const status = apiV1ErrorStatus(error);
      if (status >= 500) console.error("[DevUtils] /api/v1 execute failed:", error instanceof Error ? error.message : error);
      const message = status === 404 ? "Unknown operation."
        : status === 413 ? "Input exceeds this operation's size limit."
        : status === 400 ? (error?.message ?? "Invalid input.")
        : "Execution failed.";
      res.status(status).json({ error: message });
    }
  });
}

async function touchLastUsed(keyId, service) {
  try { await service.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyId); } catch { /* non-fatal */ }
}

export { upstreamStatus };
