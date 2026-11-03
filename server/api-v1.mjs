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
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

/* Sliding-window rate limiter (per key): 30 requests / minute.
   DB-backed when a store is injected (restart-proof); the in-memory map
   remains the fallback when no store is injected or the store fails. */
export const RATE_WINDOW_MS = 60_000;
export const RATE_WINDOW_MAX = 30;
const buckets = new Map(); // keyId -> timestamps (fallback path only)

export function allowRate(keyId, now = Date.now()) {
  const hits = (buckets.get(keyId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_WINDOW_MAX) {
    buckets.set(keyId, hits);
    return { ok: false, retryAfterMs: RATE_WINDOW_MS - (now - hits[0]) };
  }
  hits.push(now);
  buckets.set(keyId, hits);
  return { ok: true };
}

/** Pure sliding-window verdict from counted hits. Unit-tested. */
export function decideRate(hitCount, oldestHitAtMs, now = Date.now()) {
  if (hitCount >= RATE_WINDOW_MAX) {
    const age = Number.isFinite(oldestHitAtMs) ? now - oldestHitAtMs : 0;
    return { ok: false, retryAfterMs: Math.min(RATE_WINDOW_MS, Math.max(1000, RATE_WINDOW_MS - age)) };
  }
  return { ok: true };
}

/** DB-backed sliding window with an injectable store:
      count(keyId, sinceIso)   -> hits inside the window
      oldest(keyId, sinceIso)  -> oldest in-window hit ISO ts, or null
      record(keyId, atIso)     -> persist a new hit
      prune(beforeIso)         -> optional cleanup of stale rows
    Fail-open: with no store, or on any store error, fall back to the
    in-memory limiter so a DB hiccup never becomes a gateway outage. */
export async function rateVerdict(store, keyId, now = Date.now()) {
  const id = String(keyId);
  if (!store) return allowRate(id, now);
  const sinceIso = new Date(now - RATE_WINDOW_MS).toISOString();
  try {
    const hitCount = Number(await store.count(id, sinceIso) ?? 0);
    const oldestIso = await store.oldest(id, sinceIso);
    const verdict = decideRate(hitCount, oldestIso ? Date.parse(oldestIso) : NaN, now);
    if (!verdict.ok) return verdict;
    await store.record(id, new Date(now).toISOString());
    maybeRatePrune(store, now);
    return verdict;
  } catch {
    return allowRate(id, now);
  }
}

let ratePruneAt = 0;
function maybeRatePrune(store, now) {
  if (now - ratePruneAt < RATE_WINDOW_MS) return;
  ratePruneAt = now;
  Promise.resolve(store.prune?.(new Date(now - 10 * RATE_WINDOW_MS).toISOString())).catch(() => {});
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

/** Normalize an admin-supplied plan id. Only the four plans profiles.plan_id
    can hold; "anonymous" is not a real account plan. Null on anything else. */
export function normalizePlanId(value) {
  if (typeof value !== "string") return null;
  const plan = value.trim().toLowerCase();
  return ["free", "pro", "team", "enterprise"].includes(plan) ? plan : null;
}

/** p12: team member limits by plan (mirrors src/platform/features.ts). */
export const TEAM_MEMBER_LIMITS = Object.freeze({ free: 0, pro: 0, team: 25, enterprise: null });

/** True when a plan may have team workspaces at all. */
export function planAllowsTeams(planId) {
  return planId === "team" || planId === "enterprise";
}

/** True when the NEXT member still fits. null limit = unlimited. */
export function withinMemberLimit(planId, memberCount) {
  const limit = TEAM_MEMBER_LIMITS[planId];
  if (limit === undefined) return false; // unknown plan: no teams
  if (limit === null) return true;      // null = unlimited (enterprise)
  return Number(memberCount ?? 0) < limit;
}

/** Removal hierarchy: owners remove anyone; admins remove members only.
    (Self-leave is handled by the route, not this pure rule.) */
export function canRemoveMember(actorRole, targetRole) {
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole === "member";
  return false;
}

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

/* ---------- p11 batch 0: throttle for the public OpenAPI document ---------- */

/** In-memory sliding window for GET /api/v1/openapi.json: 60/min per IP.
    Fail-open when no IP is available. Unit-tested. */
export const DOC_WINDOW_MS = 60_000;
export const DOC_WINDOW_MAX = 60;
const docBuckets = new Map(); // ip -> timestamps

export function allowDoc(ip, now = Date.now()) {
  if (typeof ip !== "string" || !ip) return { ok: true };
  const hits = (docBuckets.get(ip) ?? []).filter((t) => now - t < DOC_WINDOW_MS);
  if (hits.length >= DOC_WINDOW_MAX) {
    docBuckets.set(ip, hits);
    return { ok: false, retryAfterMs: DOC_WINDOW_MS - (now - hits[0]) };
  }
  hits.push(now);
  docBuckets.set(ip, hits);
  return { ok: true };
}

/* ---------- p12: saved-workflow helpers (unit-tested) ---------- */

/** Defensive step normalization for gateway execution: only steps with a
    plausible operationId survive, config must be a plain object, max 50. */
export function normalizeWorkflowSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps
    .filter((step) => step && typeof step === "object" && typeof step.operationId === "string" && step.operationId.length > 0 && step.operationId.length <= 200)
    .slice(0, 50)
    .map((step) => ({ operationId: step.operationId, config: step.config && typeof step.config === "object" && !Array.isArray(step.config) ? step.config : undefined }));
}

/** Public shape of a saved-workflow row (steps sanitized). */
export function publicWorkflow(row) {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    steps: normalizeWorkflowSteps(row.steps),
    source: String(row.source ?? "custom"),
    updatedAt: String(row.updated_at ?? ""),
  };
}

/* ---------- p12: gateway observability (per-process, advisory) ---------- */

/** Fresh stats object. since = creation time (honest: resets on restart). */
export function emptyGatewayStats(now = new Date()) {
  return { since: now.toISOString(), total: 0, byEndpoint: {}, byStatus: {}, errors: [] };
}

/** Record one finished /api/v1 response. errors keeps the last 20 (>=400). */
export function gatewayHit(stats, { endpoint, status, error }, now = new Date()) {
  stats.total++;
  stats.byEndpoint[endpoint] = (stats.byEndpoint[endpoint] ?? 0) + 1;
  stats.byStatus[status] = (stats.byStatus[status] ?? 0) + 1;
  if (status >= 400) {
    stats.errors.push({ at: now.toISOString(), endpoint, status, message: String(error ?? "").slice(0, 200) });
    if (stats.errors.length > 20) stats.errors.shift();
  }
  return stats;
}

/** Injectable store around the pure helpers. snapshot() returns a copy. */
export function createGatewayStats() {
  const stats = emptyGatewayStats();
  return {
    hit(fields) { return gatewayHit(stats, fields); },
    snapshot() {
      return { since: stats.since, total: stats.total, byEndpoint: { ...stats.byEndpoint }, byStatus: { ...stats.byStatus }, errors: [...stats.errors] };
    },
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

export function mountApiV1(app, { service, usage, planOf, rate, stats }) {
  const usageStore = usage ?? createMemoryUsage();
  const rateStore = rate ?? null;
  const planLimitOf = planOf ?? (async () => "free");

/* p12: observability — one hit per finished /api/v1 response, registered
     before all routes so it sees everything. Never breaks a response. */
  const statsStore = stats ?? null;
  if (statsStore) {
    app.use("/api/v1", (req, res, next) => {
      const start = Date.now();
      res.on("finish", () => {
        try {
          statsStore.hit({ endpoint: `${req.method} ${req.baseUrl}${req.path}`.slice(0, 200), status: res.statusCode, durationMs: Math.max(0, Date.now() - start) });
        } catch { /* stats must never fail a response */ }
      });
      next();
    });
  }

/* Public and unauthenticated: the OpenAPI document for this gateway.
     Loaded once at mount; the route answers 503 if the file is missing. */
  let openApiDoc = "";
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    openApiDoc = readFileSync(path.join(root, "docs", "api-v1.openapi.json"), "utf-8");
  } catch { openApiDoc = ""; }

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
  app.options("/api/v1/workflows", (_req, res) => { corsHeaders(res); res.status(204).end(); });
  app.options("/api/v1/workflows/:id/execute", (_req, res) => { corsHeaders(res); res.status(204).end(); });

  app.get("/api/v1/openapi.json", (req, res) => {
    corsHeaders(res);
    const doc = allowDoc(req.ip);
    if (!doc.ok) return res.status(429).set("Retry-After", String(Math.ceil(doc.retryAfterMs / 1000))).json({ error: "Too many requests for the OpenAPI document." });
    if (!openApiDoc) return res.status(503).json({ error: "OpenAPI document unavailable." });
    res.type("application/json").send(openApiDoc);
  });

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

  app.get("/api/v1/workflows", async (req, res) => {
    const key = await authenticate(req, res, "workflows:execute");
    if (!key) return;
    corsHeaders(res);
    try {
      const r = await service.from("saved_workflows").select("id,name,description,steps,source,updated_at").eq("user_id", key.userId).order("updated_at", { ascending: false });
      if (r.error) throw r.error;
      res.json({ ok: true, workflows: (r.data ?? []).map(publicWorkflow), count: (r.data ?? []).length });
    } catch {
      res.status(502).json({ error: "Workflow lookup unavailable." });
    }
  });

app.post("/api/v1/workflows/:id/execute", async (req, res) => {
    const key = await authenticate(req, res, "workflows:execute");
    if (!key) return;
    corsHeaders(res);

const rate = await rateVerdict(rateStore, key.id);
    if (!rate.ok) return res.status(429).set("Retry-After", String(Math.ceil(rate.retryAfterMs / 1000))).json({ error: "Rate limit exceeded: 30 requests per minute per key." });

if (!executeOperation) return res.status(503).json({ error: "Executor unavailable. Run 'npm run build:server-ops' and restart." });

try {
      const planId = await planLimitOf(key.userId);
      const limit = API_V1_PLAN_LIMITS[planId] ?? API_V1_PLAN_LIMITS.free;
      const used = await usageStore.read(key.userId);
      const quota = checkMonthlyQuota(limit, used);
      if (!quota.ok) return res.status(429).json({ error: quota.error, limit: quota.limit, used: quota.used });

const wf = await service.from("saved_workflows").select("id,steps").eq("id", String(req.params.id).slice(0, 200)).eq("user_id", key.userId).maybeSingle();
      if (wf.error) throw wf.error;
      if (!wf.data) return res.status(404).json({ error: "Unknown workflow." });
      const steps = normalizeWorkflowSteps(wf.data.steps);
      if (!steps.length) return res.status(400).json({ error: "Workflow has no valid steps." });

const startedAt = new Date().toISOString();
      const results = [];
      let value = req.body;
      for (let i = 0; i < steps.length; i++) {
        const t0 = Date.now();
        try {
          const stepResult = await executeOperation({ operationId: steps[i].operationId, input: value, config: steps[i].config });
          value = stepResult.output;
        } catch (error) {
          const status = apiV1ErrorStatus(error);
          if (status >= 500) console.error("[DevUtils] /api/v1 workflow step failed:", error instanceof Error ? error.message : error);
          const message = `Workflow failed at step ${i + 1} (${steps[i].operationId}): ${status === 404 ? "Unknown operation." : status === 413 ? "Step input exceeds the operation's size limit." : status === 400 ? (error?.message ?? "Invalid input.") : "Execution failed."}`;
          return res.status(status).json({ error: message });
        }
        results.push({ operationId: steps[i].operationId, output: value, durationMs: Math.max(0, Date.now() - t0) });
      }
      await usageStore.count(key.userId);
      try { await usageStore.countMetric?.(key.userId, "workflow_runs"); } catch { /* non-fatal */ }
      touchLastUsed(key.id, service);
      res.json({ ok: true, workflowId: wf.data.id, startedAt, completedAt: new Date().toISOString(), steps: results, output: value });
    } catch (error) {
      console.error("[DevUtils] /api/v1 workflow execute failed:", error instanceof Error ? error.message : error);
      res.status(502).json({ error: "Workflow execution unavailable." });
    }
  });

  app.post("/api/v1/operations/:id/execute", async (req, res) => {
    const key = await authenticate(req, res, "tools:execute");
    if (!key) return;
    corsHeaders(res);

    const rate = await rateVerdict(rateStore, key.id);
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
