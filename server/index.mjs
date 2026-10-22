import compression from "compression";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANALYTICS_EVENTS,
  ConfigError,
  isCsrfValid,
  mergeToolRegistry,
  parseExtraOrigins,
  safeCollectionItemInput,
  safeConfig,
  safeNextRoute,
  safePinnedToolIds,
  safeSteps,
  sanitizeAnalyticsEvent,
  tokenExpiry,
  upstreamStatus,
  validateCollectionInput,
  validateCategoryOverride,
  validateRegistryImport,
  validateServerConfig,
  validateToolOverride,
  isAllowedOrigin,
  activeAdminRole,
  hasMinRole,
  isActiveAdminRecord,
  toToolOverrideDbRow,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const production = process.env.NODE_ENV === "production";

/* ------------------------------------------------------------------ *
 * Startup configuration validation (fail loudly, never print secrets)
 * ------------------------------------------------------------------ */

const configErrors = validateServerConfig(process.env, { production });
if (configErrors.length) {
  console.error("DevUtils configuration error:");
  configErrors.forEach((message) => console.error(`  - ${message}`));
  console.error("Set the variables in /etc/devutils/devutils.env and restart DevUtils. No secret values were printed.");
  process.exit(1);
}
if (!existsSync(path.join(dist, "index.html"))) {
  console.error("DevUtils build is missing. Run: npm run build");
  process.exit(1);
}

const indexHtml = readFileSync(path.join(dist, "index.html"), "utf8");
const baseRegistry = JSON.parse(readFileSync(path.join(root, "registry.generated.json"), "utf8"));
const APP_URL = new URL(process.env.APP_URL);
const EXTRA_ORIGINS = parseExtraOrigins(process.env.ALLOWED_ORIGINS);
const PORT = Number(process.env.PORT ?? 3000);

const COOKIE_ACCESS = "du_access";
const COOKIE_REFRESH = "du_refresh";
const COOKIE_CSRF = "du_csrf";
const COOKIE_REMEMBER = "du_remember";

/**
 * Single Supabase client factory.
 *
 * Node 20 has no global WebSocket, and @supabase/supabase-js eagerly constructs
 * a Realtime client, so every client must be given the `ws` transport or the
 * process crashes at startup. Sessions are never persisted server-side: each
 * request supplies its own token.
 */
function supabase(key, options = {}) {
  return createClient(process.env.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: WebSocket },
    ...options,
  });
}

const authClient = supabase(process.env.SUPABASE_PUBLISHABLE_KEY);
const service = supabase(process.env.SUPABASE_SERVICE_ROLE_KEY);

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use((_req, res, next) => {
  const nonce = randomBytes(18).toString("base64");
  res.locals.cspNonce = nonce;
  res.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://cloudflare-dns.com https://dns.google; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`);
  res.setHeader("Vary", "Origin");
  next();
});
app.use(compression());
app.use(express.json({ limit: "1mb", strict: true }));
app.use(cookieParser());

const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many authentication requests. Try again later." } });
const authReadLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many session checks. Try again later." } });
const csrfLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many CSRF token requests. Try again later." } });
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many login attempts. Try again later." } });
const accountLimit = rateLimit({ windowMs: 60 * 1000, limit: 180, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many account requests." } });
const analyticsLimit = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many analytics events." } });
const adminLimit = rateLimit({ windowMs: 60 * 1000, limit: 240, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many admin requests." } });

const cookieBase = { httpOnly: true, secure: production, sameSite: "lax", path: "/" };

function setSessionCookies(res, session, remember = true) {
  res.cookie(COOKIE_ACCESS, session.access_token, { ...cookieBase, ...(remember ? { maxAge: Math.max(60, session.expires_in ?? 3600) * 1000 } : {}) });
  res.cookie(COOKIE_REFRESH, session.refresh_token, { ...cookieBase, ...(remember ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {}) });
  res.cookie(COOKIE_REMEMBER, remember ? "1" : "0", { ...cookieBase, ...(remember ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {}) });
}
function clearSessionCookies(res) {
  res.clearCookie(COOKIE_ACCESS, cookieBase);
  res.clearCookie(COOKIE_REFRESH, cookieBase);
  res.clearCookie(COOKIE_REMEMBER, cookieBase);
}
function safeUser(user) {
  const plan = ["free", "pro", "team", "enterprise"].includes(user.app_metadata?.plan_id) ? user.app_metadata.plan_id : "free";
  return {
    id: user.id,
    email: user.email ?? null,
    emailVerified: Boolean(user.email_confirmed_at),
    displayName: user.user_metadata?.display_name ?? user.user_metadata?.name ?? null,
    avatarUrl: user.user_metadata?.avatar_url ?? null,
    planId: plan,
    createdAt: user.created_at,
  };
}
function requireOrigin(req, res, next) {
  const allowed = isAllowedOrigin({ origin: req.get("origin"), host: req.get("host"), appOrigin: APP_URL.origin, extraOrigins: EXTRA_ORIGINS });
  if (!allowed) return res.status(403).json({ error: "Origin rejected." });
  next();
}
function requireCsrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!isCsrfValid(req.cookies[COOKIE_CSRF], req.get("x-csrf-token"))) {
    return res.status(403).json({ error: "CSRF validation failed. Refresh the page and try again." });
  }
  next();
}
async function currentSession(req, res) {
  let access = req.cookies[COOKIE_ACCESS];
  const refresh = req.cookies[COOKIE_REFRESH];
  if (access) {
    const result = await authClient.auth.getUser(access);
    if (result.data?.user && !result.error) return { user: result.data.user, access, refresh };
  }
  if (!refresh) return null;
  const refreshed = await authClient.auth.refreshSession({ refresh_token: refresh });
  if (refreshed.error || !refreshed.data?.session || !refreshed.data?.user) {
    clearSessionCookies(res);
    return null;
  }
  setSessionCookies(res, refreshed.data.session, req.cookies[COOKIE_REMEMBER] === "1");
  return { user: refreshed.data.user, access: refreshed.data.session.access_token, refresh: refreshed.data.session.refresh_token };
}
async function requireSession(req, res, next) {
  try {
    const session = await currentSession(req, res);
    if (!session) return res.status(401).json({ error: "Authentication required." });
    req.devutils = session;
    next();
  } catch {
    clearSessionCookies(res);
    res.status(401).json({ error: "Session expired. Sign in again." });
  }
}
function userDb(access) {
  return supabase(process.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${access}` } },
  });
}
function sendError(res, error, fallback = "Request failed.") {
  if (!production) console.error(error instanceof Error ? error.message : error);
  res.status(upstreamStatus(error)).json({ error: fallback });
}

/* ------------------------------------------------------------------ *
 * Administrator authorization — enforced server-side only
 * ------------------------------------------------------------------ */

const adminCache = new Map();
async function adminRoleOf(userId) {
  const cached = adminCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.role ?? (cached.value ? "admin" : null);
  const { data, error } = await service.from("admin_users").select("user_id,role,revoked_at").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  const role = activeAdminRole(data);
  adminCache.set(userId, { role, expires: Date.now() + 30_000 });
  return role;
}
async function isAdmin(userId) {
  return (await adminRoleOf(userId)) !== null;
}
function requireRole(min = "moderator") {
  return async (req, res, next) => {
    try {
      const role = await adminRoleOf(req.devutils.user.id);
      if (!role || !hasMinRole(role, min)) return res.status(403).json({ error: "Administrator access required." });
      req.devutils.isAdmin = true;
      req.devutils.adminRole = role;
      next();
    } catch (error) {
      sendError(res, error, "Administrator check failed.");
    }
  };
}
async function requireAdmin(req, res, next) {
  await requireRole("admin")(req, res, next);
}
async function audit(userId, action, metadata = {}) {
  try {
    const { error } = await service.from("audit_logs").insert({ user_id: userId, action, metadata });
    if (error) {
      // Log only the action and database error code; never log tokens or metadata.
      console.error("[DevUtils] Audit write failed:", { action, code: error.code ?? "unknown" });
      return false;
    }
    return true;
  } catch (error) {
    console.error("[DevUtils] Audit write failed:", { action, code: error?.code ?? "unknown" });
    return false;
  }
}

async function recordAdminAuditOrRespond(res, userId, action, metadata = {}) {
  const recorded = await audit(userId, action, metadata);
  if (recorded) return true;
  // The preceding database mutation may already be committed. Be explicit so
  // callers do not assume it was rolled back or blindly retry the mutation.
  res.status(500).json({
    error: "The change was saved, but its audit event could not be recorded. Check the audit log before retrying.",
    saved: true,
    auditRecorded: false,
  });
  return false;
}

/* ------------------------------------------------------------------ *
 * Tools registry — one authoritative, merged source of truth
 * ------------------------------------------------------------------ */

const registryCache = { at: 0, published: null, admin: null };
async function loadOverrides() {
  const [tools, categories] = await Promise.all([
    service.from("tool_overrides").select("*"),
    service.from("category_overrides").select("*"),
  ]);
  if (tools.error) throw tools.error;
  if (categories.error) throw categories.error;
  return { tools: tools.data ?? [], categories: categories.data ?? [] };
}
async function registry({ includeUnpublished = false, maxAgeMs = 15_000 } = {}) {
  if (includeUnpublished && registryCache.admin && Date.now() - registryCache.at < maxAgeMs) return registryCache.admin;
  if (!includeUnpublished && registryCache.published && Date.now() - registryCache.at < maxAgeMs) return registryCache.published;
  const overrides = await loadOverrides();
  const published = mergeToolRegistry(baseRegistry.tools, overrides.tools, overrides.categories, { includeUnpublished: false });
  const admin = mergeToolRegistry(baseRegistry.tools, overrides.tools, overrides.categories, { includeUnpublished: true });
  registryCache.at = Date.now();
  registryCache.published = published;
  registryCache.admin = admin;
  return includeUnpublished ? admin : published;
}
function invalidateRegistry() { registryCache.at = 0; registryCache.published = null; registryCache.admin = null; }

/* ------------------------------------------------------------------ *
 * Public endpoints
 * ------------------------------------------------------------------ */

app.get("/api/health", async (_req, res) => {
  try {
    const check = await service.from("profiles").select("user_id", { count: "exact", head: true });
    if (check.error) return res.status(503).json({ status: "degraded" });
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "degraded" });
  }
});
app.get("/runtime-config.js", (_req, res) => {
  res.type("application/javascript").set("Cache-Control", "no-store")
    .send('window.__DEVUTILS_CONFIG__={"authMode":"server","accountsEnabled":true};');
});
app.get("/api/tools/registry", async (_req, res) => {
  try {
    const merged = await registry();
    res.set("Cache-Control", "public, max-age=60").json({ tools: merged.tools, generatedAt: new Date().toISOString() });
  } catch (error) {
    // Public tools must keep working even if the database is unavailable.
    res.set("Cache-Control", "no-store").status(200).json({ tools: baseRegistry.tools, degraded: true });
    if (!production) console.error(error instanceof Error ? error.message : error);
  }
});
app.get("/api/auth/csrf", csrfLimit, (_req, res) => {
  const token = randomBytes(32).toString("base64url");
  res.cookie(COOKIE_CSRF, token, { httpOnly: false, secure: production, sameSite: "strict", path: "/", maxAge: 2 * 60 * 60 * 1000 });
  res.json({ token });
});

/* ------------------------------------------------------------------ *
 * Authentication
 * ------------------------------------------------------------------ */

app.post("/api/auth/signup", authLimit, requireOrigin, requireCsrf, async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim().slice(0, 100);
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 10) {
      return res.status(400).json({ error: "Enter a valid name, email, and a password of at least 10 characters." });
    }
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: { data: { display_name: name }, emailRedirectTo: `${APP_URL.origin}/api/auth/confirm` },
    });
    if (error) {
      // Enumeration-safe: Supabase already returns an obfuscated user for existing accounts.
      return res.status(200).json({ verificationRequired: true, message: "Check your email to continue if signup is available for this address." });
    }
    if (data.session) setSessionCookies(res, data.session, true);
    await audit(data.user?.id ?? null, "logged_in", { event: "signup" }).catch(() => undefined);
    res.status(201).json({ user: data.user ? safeUser(data.user) : null, verificationRequired: !data.session, message: "Check your email to verify your account." });
  } catch (error) {
    sendError(res, error, "Signup could not be completed.");
  }
});

app.post("/api/auth/login", loginLimit, requireOrigin, requireCsrf, async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const remember = req.body?.remember !== false;
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) return res.status(401).json({ error: "Invalid email or password." });
    setSessionCookies(res, data.session, remember);
    await audit(data.user.id, "logged_in", {});
    res.json({ user: safeUser(data.user) });
  } catch (error) {
    sendError(res, error, "Login failed.");
  }
});

app.get("/api/auth/me", authReadLimit, async (req, res) => {
  const session = await currentSession(req, res).catch(() => null);
  res.json({ user: session ? safeUser(session.user) : null });
});

app.get("/api/auth/session", requireSession, (req, res) => {
  res.json({
    id: req.devutils.access.slice(-12),
    userId: req.devutils.user.id,
    createdAt: req.devutils.user.last_sign_in_at ?? null,
    expiresAt: tokenExpiry(req.devutils.access),
    isCurrent: true,
  });
});

app.post("/api/auth/logout", authLimit, requireOrigin, requireCsrf, requireSession, async (req, res) => {
  try {
    const scope = ["local", "global", "others"].includes(req.body?.scope) ? req.body.scope : "local";
    const scoped = supabase(process.env.SUPABASE_PUBLISHABLE_KEY);
    await scoped.auth.setSession({ access_token: req.devutils.access, refresh_token: req.devutils.refresh });
    await scoped.auth.signOut({ scope });
    if (scope !== "others") clearSessionCookies(res);
    res.json({ ok: true });
  } catch (error) {
    clearSessionCookies(res);
    sendError(res, error, "Logout failed.");
  }
});

app.post("/api/auth/forgot", authLimit, requireOrigin, requireCsrf, async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  try {
    await authClient.auth.resetPasswordForEmail(email, { redirectTo: `${APP_URL.origin}/api/auth/confirm` });
  } catch { /* enumeration-safe: identical response either way */ }
  res.json({ message: "If an account exists for that address, a reset email has been sent." });
});

app.post("/api/auth/resend", authLimit, requireOrigin, requireCsrf, async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  try {
    await authClient.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${APP_URL.origin}/api/auth/confirm` } });
  } catch { /* enumeration-safe */ }
  res.json({ message: "If verification is pending, a new email has been sent." });
});

app.get("/api/auth/confirm", authLimit, async (req, res) => {
  const redirect = (next, errorCode) => {
    const target = `${APP_URL.origin}/?auth_next=${encodeURIComponent(safeNextRoute(next))}${errorCode ? `&auth_error=${encodeURIComponent(errorCode)}` : ""}`;
    res.redirect(target);
  };
  try {
    const tokenHash = String(req.query.token_hash ?? "");
    const type = String(req.query.type ?? "email");
    if (!tokenHash || !["email", "signup", "recovery", "email_change"].includes(type)) return redirect("/verify-email", "invalid");
    const { data, error } = await authClient.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error || !data.session) return redirect(type === "recovery" ? "/reset-password" : "/verify-email", "expired");
    setSessionCookies(res, data.session, true);
    redirect(type === "recovery" ? "/reset-password" : "/verify-email");
  } catch {
    redirect("/verify-email", "invalid");
  }
});

app.post("/api/auth/password", authLimit, requireOrigin, requireCsrf, requireSession, async (req, res) => {
  try {
    const password = String(req.body?.password ?? "");
    if (password.length < 10) return res.status(400).json({ error: "Password must contain at least 10 characters." });
    const scoped = supabase(process.env.SUPABASE_PUBLISHABLE_KEY);
    await scoped.auth.setSession({ access_token: req.devutils.access, refresh_token: req.devutils.refresh });
    const result = await scoped.auth.updateUser({ password });
    if (result.error) throw result.error;
    await audit(req.devutils.user.id, "password_changed", {});
    await scoped.auth.signOut({ scope: "global" });
    clearSessionCookies(res);
    res.json({ ok: true, reauthenticationRequired: true });
  } catch (error) {
    sendError(res, error, "Password update failed.");
  }
});

app.post("/api/auth/email", authLimit, requireOrigin, requireCsrf, requireSession, async (req, res) => {
  try {
    const scoped = supabase(process.env.SUPABASE_PUBLISHABLE_KEY);
    await scoped.auth.setSession({ access_token: req.devutils.access, refresh_token: req.devutils.refresh });
    const result = await scoped.auth.updateUser({ email: String(req.body?.email ?? "").trim().toLowerCase() });
    if (result.error) throw result.error;
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, "Email update failed.");
  }
});

app.post("/api/auth/metadata", authLimit, requireOrigin, requireCsrf, requireSession, async (req, res) => {
  try {
    const scoped = supabase(process.env.SUPABASE_PUBLISHABLE_KEY);
    await scoped.auth.setSession({ access_token: req.devutils.access, refresh_token: req.devutils.refresh });
    const result = await scoped.auth.updateUser({
      data: { display_name: String(req.body?.displayName ?? "").slice(0, 100), avatar_url: String(req.body?.avatarUrl ?? "").slice(0, 1000) || null },
    });
    if (result.error) throw result.error;
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, "Profile metadata update failed.");
  }
});

/* ------------------------------------------------------------------ *
 * Account data (user-scoped; RLS also enforced in PostgreSQL)
 * ------------------------------------------------------------------ */

app.use("/api/account", accountLimit, requireOrigin, requireCsrf, requireSession);

app.get("/api/account/profile", async (req, res) => {
  const result = await userDb(req.devutils.access).from("profiles")
    .select("user_id,display_name,avatar_url,timezone,locale,theme,preferences")
    .eq("user_id", req.devutils.user.id).maybeSingle();
  if (result.error) return sendError(res, result.error, "Profile unavailable.");
  res.json(result.data);
});
app.put("/api/account/profile", async (req, res) => {
  const body = req.body ?? {};
  const row = {
    user_id: req.devutils.user.id,
    display_name: String(body.displayName ?? "").slice(0, 100),
    avatar_url: String(body.avatarUrl ?? "").slice(0, 1000) || null,
    timezone: String(body.timezone ?? "UTC").slice(0, 100),
    locale: String(body.locale ?? "en").slice(0, 20),
    theme: ["light", "dark", "system"].includes(body.theme) ? body.theme : "system",
    preferences: typeof body.preferences === "object" && body.preferences ? body.preferences : {},
    updated_at: new Date().toISOString(),
  };
  const result = await userDb(req.devutils.access).from("profiles").upsert(row, { onConflict: "user_id" });
  if (result.error) return sendError(res, result.error, "Profile update failed.");
  await audit(req.devutils.user.id, "profile_updated", {});
  res.json(row);
});

app.get("/api/account/favorites", async (req, res) => {
  const r = await userDb(req.devutils.access).from("favorites").select("id,kind,target_id,created_at").order("created_at", { ascending: false });
  if (r.error) return sendError(res, r.error);
  res.json(r.data);
});
app.post("/api/account/favorites/toggle", async (req, res) => {
  const kind = String(req.body?.kind ?? "");
  const target = String(req.body?.targetId ?? "").slice(0, 200);
  if (!["tool", "toolkit", "workflow", "integration"].includes(kind) || !target) return res.status(400).json({ error: "Invalid favorite." });
  const db = userDb(req.devutils.access);
  const existing = await db.from("favorites").select("id").eq("kind", kind).eq("target_id", target).maybeSingle();
  const result = existing.data
    ? await db.from("favorites").delete().eq("id", existing.data.id)
    : await db.from("favorites").insert({ user_id: req.devutils.user.id, kind, target_id: target });
  if (result.error) return sendError(res, result.error);
  res.json({ ok: true });
});

app.get("/api/account/recent", async (req, res) => {
  const r = await userDb(req.devutils.access).from("recent_tools").select("tool_id,opened_at").order("opened_at", { ascending: false }).limit(20);
  if (r.error) return sendError(res, r.error);
  res.json(r.data);
});
app.post("/api/account/recent", async (req, res) => {
  const toolId = String(req.body?.toolId ?? "").slice(0, 200);
  if (!toolId) return res.status(400).json({ error: "Tool ID required." });
  const r = await userDb(req.devutils.access).from("recent_tools")
    .upsert({ user_id: req.devutils.user.id, tool_id: toolId, opened_at: new Date().toISOString() }, { onConflict: "user_id,tool_id" });
  if (r.error) return sendError(res, r.error);
  res.json({ ok: true });
});
app.delete("/api/account/recent", async (req, res) => {
  const r = await userDb(req.devutils.access).from("recent_tools").delete().neq("tool_id", "");
  if (r.error) return sendError(res, r.error);
  res.json({ ok: true });
});

for (const resource of ["workflows", "presets"]) {
  const table = resource === "workflows" ? "saved_workflows" : "saved_presets";
  app.get(`/api/account/${resource}`, async (req, res) => {
    let q = userDb(req.devutils.access).from(table).select("*").order("updated_at", { ascending: false });
    if (resource === "presets" && req.query.toolId) q = q.eq("tool_id", String(req.query.toolId).slice(0, 200));
    const r = await q;
    if (r.error) return sendError(res, r.error);
    res.json(r.data);
  });
  app.put(`/api/account/${resource}/:id`, async (req, res) => {
    const body = req.body ?? {};
    const id = String(req.params.id).slice(0, 200);
    const row = resource === "workflows"
      ? { id, user_id: req.devutils.user.id, name: String(body.name ?? "").slice(0, 100), description: String(body.description ?? "").slice(0, 500), steps: safeSteps(body.steps), source: body.source === "template" ? "template" : "custom", version: 1, updated_at: new Date().toISOString() }
      : { id, user_id: req.devutils.user.id, tool_id: String(body.toolId ?? "").slice(0, 200), name: String(body.name ?? "").slice(0, 100), config: safeConfig(body.config), version: 1, updated_at: new Date().toISOString() };
    const r = await userDb(req.devutils.access).from(table).upsert(row, { onConflict: "user_id,id" });
    if (r.error) return sendError(res, r.error);
    await audit(req.devutils.user.id, resource === "workflows" ? "workflow_created" : "profile_updated", { resource, id });
    res.json(row);
  });
  app.delete(`/api/account/${resource}/:id`, async (req, res) => {
    const r = await userDb(req.devutils.access).from(table).delete().eq("id", String(req.params.id).slice(0, 200));
    if (r.error) return sendError(res, r.error);
    res.json({ ok: true });
  });
}

app.get("/api/account/usage", async (req, res) => {
  const r = await userDb(req.devutils.access).rpc("get_usage_summary");
  if (r.error) return sendError(res, r.error);
  res.json(Array.isArray(r.data) ? r.data[0] : r.data);
});
app.post("/api/account/usage", async (req, res) => {
  const metric = String(req.body?.metric ?? "");
  const resourceId = String(req.body?.resourceId ?? "").slice(0, 200) || null;
  if (!["tool_runs", "workflow_runs"].includes(metric)) return res.status(400).json({ error: "Unsupported metric." });
  const r = await userDb(req.devutils.access).rpc("record_usage", { p_metric: metric, p_quantity: 1, p_resource_id: resourceId });
  if (r.error) return sendError(res, r.error);
  res.json({ ok: true });
});
app.get("/api/account/audit", async (req, res) => {
  const r = await userDb(req.devutils.access).from("audit_logs").select("id,user_id,action,metadata,created_at").order("created_at", { ascending: false }).limit(20);
  if (r.error) return sendError(res, r.error);
  res.json(r.data);
});
app.get("/api/account/api-keys", async (req, res) => {
  const r = await userDb(req.devutils.access).from("api_keys").select("id,name,prefix,scopes,created_at,last_used_at,revoked_at").order("created_at", { ascending: false });
  if (r.error) return sendError(res, r.error);
  res.json(r.data);
});
app.post("/api/account/api-keys", async (req, res) => {
  const name = String(req.body?.name ?? "").trim().slice(0, 100);
  const scopes = [...new Set(Array.isArray(req.body?.scopes) ? req.body.scopes : [])].filter((scope) => ["tools:read", "tools:execute", "workflows:execute"].includes(scope));
  if (!name || !scopes.length) return res.status(400).json({ error: "Name and at least one scope are required." });
  const count = await service.from("api_keys").select("id", { count: "exact", head: true }).eq("user_id", req.devutils.user.id).is("revoked_at", null);
  if ((count.count ?? 0) >= 10) return res.status(429).json({ error: "Active API-key limit reached." });
  const recent = await service.from("audit_logs").select("id", { count: "exact", head: true })
    .eq("user_id", req.devutils.user.id).eq("action", "api_key_created")
    .gte("created_at", new Date(Date.now() - 3600000).toISOString());
  if ((recent.count ?? 0) >= 5) return res.status(429).json({ error: "API-key creation rate limit reached." });
  const secret = `du_live_${randomBytes(32).toString("base64url")}`;
  const hash = createHash("sha256").update(secret).digest("hex");
  const prefix = secret.slice(0, 16);
  const r = await service.from("api_keys").insert({ user_id: req.devutils.user.id, name, prefix, key_hash: hash, scopes })
    .select("id,name,prefix,scopes,created_at,last_used_at,revoked_at").single();
  if (r.error) return sendError(res, r.error, "API key creation failed.");
  await audit(req.devutils.user.id, "api_key_created", { key_id: r.data.id, prefix });
  res.status(201).json({ secret, metadata: { id: r.data.id, name: r.data.name, prefix, scopes, createdAt: r.data.created_at, lastUsedAt: null, revokedAt: null } });
});
app.delete("/api/account/api-keys/:id", async (req, res) => {
  const r = await service.from("api_keys").update({ revoked_at: new Date().toISOString() })
    .eq("id", String(req.params.id)).eq("user_id", req.devutils.user.id).is("revoked_at", null).select("id").maybeSingle();
  if (r.error || !r.data) return res.status(404).json({ error: "Key not found." });
  await audit(req.devutils.user.id, "api_key_revoked", { key_id: req.params.id });
  res.json({ ok: true });
});
app.delete("/api/account", async (req, res) => {
  const r = await service.auth.admin.deleteUser(req.devutils.user.id);
  if (r.error) return sendError(res, r.error, "Account deletion failed.");
  clearSessionCookies(res);
  res.json({ ok: true });
});
/* ------------------------------------------------------------------ *
 * Pinned tools + personal collections (Phase 5; same account guards,
 * user-scoped rows, RLS also enforced in PostgreSQL)
 * ------------------------------------------------------------------ */

app.get("/api/account/pinned", async (req, res) => {
  const r = await userDb(req.devutils.access).from("pinned_tools").select("tool_id,sort_order,created_at").order("sort_order", { ascending: true });
  if (r.error) return sendError(res, r.error, "Pinned tools unavailable.");
  res.json(r.data);
});
app.post("/api/account/pinned/:id", async (req, res) => {
  const toolId = String(req.params.id).slice(0, 200);
  if (!toolId) return res.status(400).json({ error: "Tool ID required." });
  const db = userDb(req.devutils.access);
  const count = await db.from("pinned_tools").select("tool_id", { count: "exact", head: true });
  if (count.error) return sendError(res, count.error, "Pin failed.");
  if ((count.count ?? 0) >= 50) return res.status(429).json({ error: "Pinned tools limit reached." });
  const existing = await db.from("pinned_tools").select("tool_id").eq("tool_id", toolId).maybeSingle();
  if (existing.error) return sendError(res, existing.error, "Pin failed.");
  if (existing.data) return res.json({ ok: true });
  const r = await db.from("pinned_tools").insert({ user_id: req.devutils.user.id, tool_id: toolId, sort_order: count.count ?? 0 });
  if (r.error) return sendError(res, r.error, "Pin failed.");
  res.status(201).json({ ok: true });
});
app.delete("/api/account/pinned/:id", async (req, res) => {
  const r = await userDb(req.devutils.access).from("pinned_tools").delete().eq("tool_id", String(req.params.id).slice(0, 200));
  if (r.error) return sendError(res, r.error, "Unpin failed.");
  res.json({ ok: true });
});
app.put("/api/account/pinned", async (req, res) => {
  const toolIds = safePinnedToolIds(req.body?.toolIds);
  if (!toolIds.length) return res.status(400).json({ error: "At least one tool ID is required." });
  const db = userDb(req.devutils.access);
  const previous = await db.from("pinned_tools").select("tool_id,sort_order,created_at");
  if (previous.error) return sendError(res, previous.error, "Reorder failed.");
  const rows = previous.data ?? [];
  const byId = new Map(rows.map((row) => [row.tool_id, row]));
  const ordered = toolIds.map((toolId, index) => ({ tool_id: toolId, sort_order: index, created_at: byId.get(toolId)?.created_at ?? new Date().toISOString() }));
  const keep = rows.filter((row) => !toolIds.includes(row.tool_id)).map((row) => ({ tool_id: row.tool_id, sort_order: ordered.length + (row.sort_order ?? 0), created_at: row.created_at }));
  const removed = await db.from("pinned_tools").delete().neq("tool_id", "");
  if (removed.error) return sendError(res, removed.error, "Reorder failed.");
  const inserted = await db.from("pinned_tools").insert([...ordered, ...keep].map((row) => ({ user_id: req.devutils.user.id, ...row })));
  if (inserted.error) {
    // Best-effort restore so a mid-reorder failure never silently drops pins.
    await db.from("pinned_tools").insert(rows.map((row) => ({ user_id: req.devutils.user.id, tool_id: row.tool_id, sort_order: row.sort_order, created_at: row.created_at })));
    return sendError(res, inserted.error, "Reorder failed.");
  }
  res.json({ ok: true });
});

app.get("/api/account/collections", async (req, res) => {
  const r = await userDb(req.devutils.access).from("collections").select("id,name,description,created_at,updated_at").order("updated_at", { ascending: false });
  if (r.error) return sendError(res, r.error, "Collections unavailable.");
  res.json(r.data);
});
app.post("/api/account/collections", async (req, res) => {
  const db = userDb(req.devutils.access);
  const existing = await db.from("collections").select("name");
  if (existing.error) return sendError(res, existing.error, "Collections unavailable.");
  const result = validateCollectionInput(req.body, { existingNames: (existing.data ?? []).map((row) => row.name), requireName: true });
  if (!result.ok) return res.status(400).json({ errors: result.errors });
  const r = await db.from("collections").insert({ user_id: req.devutils.user.id, name: result.value.name, description: result.value.description })
    .select("id,name,description,created_at,updated_at").single();
  if (r.error) return sendError(res, r.error, "Collection creation failed.");
  res.status(201).json(r.data);
});
app.put("/api/account/collections/:id", async (req, res) => {
  const db = userDb(req.devutils.access);
  const current = await db.from("collections").select("id,name,description").eq("id", String(req.params.id)).maybeSingle();
  if (current.error || !current.data) return res.status(404).json({ error: "Collection not found." });
  const existing = await db.from("collections").select("name");
  if (existing.error) return sendError(res, existing.error, "Collections unavailable.");
  const result = validateCollectionInput(req.body, { existingNames: (existing.data ?? []).map((row) => row.name).filter((name) => name !== current.data.name), requireName: false });
  if (!result.ok) return res.status(400).json({ errors: result.errors });
  const r = await db.from("collections").update({
    name: result.value.name || current.data.name,
    description: req.body?.description !== undefined ? result.value.description : current.data.description,
    updated_at: new Date().toISOString(),
  }).eq("id", current.data.id).select("id,name,description,created_at,updated_at").single();
  if (r.error) return sendError(res, r.error, "Collection update failed.");
  res.json(r.data);
});
app.delete("/api/account/collections/:id", async (req, res) => {
  const r = await userDb(req.devutils.access).from("collections").delete().eq("id", String(req.params.id));
  if (r.error) return sendError(res, r.error, "Collection deletion failed.");
  res.json({ ok: true });
});
app.get("/api/account/collections/:id/items", async (req, res) => {
  const r = await userDb(req.devutils.access).from("collection_items").select("kind,target_id,sort_order,added_at").eq("collection_id", String(req.params.id)).order("sort_order", { ascending: true });
  if (r.error) return sendError(res, r.error, "Collection items unavailable.");
  res.json(r.data);
});
app.post("/api/account/collections/:id/items", async (req, res) => {
  const item = safeCollectionItemInput(req.body);
  if (!item) return res.status(400).json({ error: "Invalid collection item." });
  const db = userDb(req.devutils.access);
  const collection = await db.from("collections").select("id").eq("id", String(req.params.id)).maybeSingle();
  if (collection.error || !collection.data) return res.status(404).json({ error: "Collection not found." });
  const count = await db.from("collection_items").select("target_id", { count: "exact", head: true }).eq("collection_id", collection.data.id);
  if (count.error) return sendError(res, count.error, "Adding item failed.");
  if ((count.count ?? 0) >= 100) return res.status(429).json({ error: "Collection item limit reached." });
  const r = await db.from("collection_items").upsert({ collection_id: collection.data.id, user_id: req.devutils.user.id, kind: item.kind, target_id: item.targetId, sort_order: count.count ?? 0 }, { onConflict: "collection_id,target_id" })
    .select("kind,target_id,sort_order,added_at");
  if (r.error) return sendError(res, r.error, "Adding item failed.");
  res.status(201).json(r.data);
});
app.delete("/api/account/collections/:id/items/:targetId", async (req, res) => {
  const r = await userDb(req.devutils.access).from("collection_items").delete().eq("collection_id", String(req.params.id)).eq("target_id", String(req.params.targetId).slice(0, 200));
  if (r.error) return sendError(res, r.error, "Removing item failed.");
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Analytics — allowlisted event names only, never tool input
 * ------------------------------------------------------------------ */

app.post("/api/analytics/events", analyticsLimit, requireOrigin, requireCsrf, async (req, res) => {
  const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 20) : [req.body];
  const rows = events.map(sanitizeAnalyticsEvent).filter(Boolean);
  if (!rows.length) return res.status(400).json({ error: "Unsupported analytics event." });
  let userId = null;
  const session = await currentSession(req, res).catch(() => null);
  if (session) userId = session.user.id;
  const r = await service.from("analytics_events").insert(rows.map((row) => ({ ...row, actor_kind: userId ? "user" : "anonymous", user_id: userId })));
  if (r.error) return sendError(res, r.error, "Analytics unavailable.");
  res.json({ accepted: rows.length });
});

/* ------------------------------------------------------------------ *
 * Administration — Tools Management, categories, analytics, audit
 * ------------------------------------------------------------------ */

app.use("/api/admin", adminLimit, requireOrigin, requireCsrf, requireSession, requireRole("moderator"));

app.get("/api/admin/me", (req, res) => res.json({ role: req.devutils.adminRole, userId: req.devutils.user.id, email: req.devutils.user.email }));

app.get("/api/admin/registry", async (_req, res) => {
  try {
    const merged = await registry({ includeUnpublished: true, maxAgeMs: 0 });
    const overrides = await loadOverrides();
    res.json({
      tools: merged.allTools,
      categories: baseRegistry.categories.map((category, index) => ({ ...category, ...(overrides.categories.find((row) => row.id === category.id) ?? {}), order: overrides.categories.find((row) => row.id === category.id)?.order ?? index })),
      baseToolIds: baseRegistry.tools.map((tool) => tool.id),
      visibilityOptions: ["published", "draft", "archived"],
    });
  } catch (error) {
    sendError(res, error, "Registry unavailable.");
  }
});

app.put("/api/admin/tools/:id", requireRole("admin"), async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  try {
    const overrides = await loadOverrides();
    const existingSlugs = new Map(baseRegistry.tools.map((tool) => [tool.slug, tool.id]));
    overrides.tools.forEach((row) => { if (row.slug) existingSlugs.set(row.slug, row.id); });
    const result = validateToolOverride(req.body ?? {}, { baseIds: baseRegistry.tools.map((tool) => tool.id), existingSlugs, id });
    if (!result.ok) return res.status(400).json({ errors: result.errors });
    const previous = overrides.tools.find((row) => row.id === id);
    const row = toToolOverrideDbRow({
      id,
      ...result.value,
      keywords: result.value.keywords ?? null,
      aliases: result.value.aliases ?? null,
      tags: result.value.tags ?? null,
      related: result.value.related ?? null,
    }, req.devutils.user.id, new Date().toISOString());
    const r = await service.from("tool_overrides").upsert(row, { onConflict: "id" }).select().single();
    if (r.error) return sendError(res, r.error, "Tool update failed.");
    invalidateRegistry();
    const changed = previous ? (previous.visibility ?? "published") !== (row.visibility ?? "published") || previous.enabled !== row.enabled : true;
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, changed ? "tool_visibility_changed" : "tool_config_changed", { tool_id: id, visibility: row.visibility ?? "published" }))) return;
    res.json(r.data);
  } catch (error) {
    sendError(res, error, "Tool update failed.");
  }
});

app.post("/api/admin/tools/reorder", requireRole("admin"), async (req, res) => {
  const order = Array.isArray(req.body?.order) ? req.body.order.slice(0, 500) : [];
  const known = new Set(baseRegistry.tools.map((tool) => tool.id));
  const invalid = order.filter((entry) => !entry || typeof entry !== "object" || !known.has(String(entry.id)));
  const ids = order.map((entry) => String(entry.id));
  if (invalid.length || new Set(ids).size !== ids.length) {
    return res.status(400).json({ errors: ["Reorder payload must reference unique registered tool ids."] });
  }
  if (!order.length) return res.json({ ok: true, reordered: 0 });
  try {
    const updatedAt = new Date().toISOString();
    const rows = order.map((entry, index) => ({ id: String(entry.id), order: index, updated_by: req.devutils.user.id, updated_at: updatedAt }));
    const result = await service.from("tool_overrides").upsert(rows, { onConflict: "id" });
    if (result.error) return sendError(res, result.error, "Reorder failed.");
    invalidateRegistry();
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "tool_config_changed", { action: "reorder", count: order.length }))) return;
    res.json({ ok: true, reordered: order.length });
  } catch (error) {
    sendError(res, error, "Reorder failed.");
  }
});

app.delete("/api/admin/tools/:id", requireRole("admin"), async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const r = await service.from("tool_overrides").delete().eq("id", id);
  if (r.error) return sendError(res, r.error, "Reset failed.");
  invalidateRegistry();
  if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "tool_config_changed", { tool_id: id, action: "reset-to-default" }))) return;
  res.json({ ok: true });
});

app.put("/api/admin/categories/:id", requireRole("admin"), async (req, res) => {
  const id = String(req.params.id).slice(0, 40);
  if (!baseRegistry.categories.some((category) => category.id === id)) {
    return res.status(400).json({ error: "Category is not registered in this build." });
  }
  const result = validateCategoryOverride(req.body ?? {}, { id });
  if (!result.ok) return res.status(400).json({ errors: result.errors });
  const r = await service.from("category_overrides").upsert({ id, ...result.value, updated_by: req.devutils.user.id, updated_at: new Date().toISOString() }, { onConflict: "id" }).select().single();
  if (r.error) return sendError(res, r.error, "Category update failed.");
  invalidateRegistry();
  if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "tool_config_changed", { category_id: id }))) return;
  res.json(r.data);
});

app.get("/api/admin/export", async (_req, res) => {
  try {
    const overrides = await loadOverrides();
    res.json({ version: 1, exportedAt: new Date().toISOString(), tools: overrides.tools, categories: overrides.categories });
  } catch (error) {
    sendError(res, error, "Export failed.");
  }
});

app.post("/api/admin/import", requireRole("admin"), async (req, res) => {
  const result = validateRegistryImport(req.body, baseRegistry.tools, baseRegistry.categories);
  if (!result.ok) return res.status(400).json({ errors: result.errors });
  const toolCount = result.value.tools.length;
  const categoryCount = result.value.categories.length;
  const totalCount = toolCount + categoryCount;
  if (req.body?.dryRun) return res.json({ ok: true, dryRun: true, wouldWrite: totalCount, tools: toolCount, categories: categoryCount });
  try {
    const updatedAt = new Date().toISOString();
    let toolsWritten = 0;
    let categoriesWritten = 0;
    if (toolCount) {
      const rows = result.value.tools.map((entry) => toToolOverrideDbRow(entry, req.devutils.user.id, updatedAt));
      const write = await service.from("tool_overrides").upsert(rows, { onConflict: "id" });
      if (write.error) return sendError(res, write.error, "Tool override import failed.");
      toolsWritten = toolCount;
    }
    if (categoryCount) {
      const rows = result.value.categories.map((entry) => ({ id: entry.id, ...entry, updated_by: req.devutils.user.id, updated_at: updatedAt }));
      const write = await service.from("category_overrides").upsert(rows, { onConflict: "id" });
      if (write.error) {
        if (toolsWritten) invalidateRegistry();
        return res.status(500).json({ error: "Tool overrides were imported, but category override import failed. The import is partial.", partial: true, toolsWritten, categoriesWritten });
      }
      categoriesWritten = categoryCount;
    }
    invalidateRegistry();
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "tool_config_changed", { action: "import", tools: toolsWritten, categories: categoriesWritten }))) return;
    res.json({ ok: true, written: totalCount, toolsWritten, categoriesWritten });
  } catch (error) {
    sendError(res, error, "Import failed.");
  }
});

app.get("/api/admin/analytics", async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days ?? 30)));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  try {
    const [events, users, tools, categories, workflowRuns] = await Promise.all([
      service.from("analytics_events").select("event_name,tool_id,category_id,outcome,occurred_at").gte("occurred_at", since).limit(20000),
      service.from("profiles").select("user_id,created_at,plan_id"),
      service.from("usage_records").select("metric,resource_id,quantity,recorded_at").gte("recorded_at", since).limit(20000),
      service.from("recent_tools").select("tool_id,opened_at").gte("opened_at", since).limit(20000),
      service.from("usage_records").select("quantity").eq("metric", "workflow_runs").gte("recorded_at", since),
    ]);
    const failedQuery = [events, users, tools, categories, workflowRuns].find((result) => result.error);
    if (failedQuery?.error) return sendError(res, failedQuery.error, "Analytics unavailable.");

    const byTool = new Map();
    const byCategory = new Map();
    const failures = { auth: 0, tool: 0 };
    for (const event of events.data ?? []) {
      if (event.tool_id) byTool.set(event.tool_id, (byTool.get(event.tool_id) ?? 0) + 1);
      if (event.category_id) byCategory.set(event.category_id, (byCategory.get(event.category_id) ?? 0) + 1);
      if (event.outcome === "failure") {
        if (event.event_name === "auth_failure") failures.auth += 1;
        else failures.tool += 1;
      }
    }
    for (const record of categories.data ?? []) byTool.set(record.tool_id, (byTool.get(record.tool_id) ?? 0) + 1);

    const registered = new Set(baseRegistry.tools.map((tool) => tool.id));
    const toolUsage = [...byTool.entries()]
      .filter(([id]) => registered.has(id))
      .map(([id, count]) => ({ toolId: id, name: baseRegistry.tools.find((tool) => tool.id === id)?.name ?? id, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      windowDays: days,
      since,
      available: {
        anonymousEvents: (events.data ?? []).some((event) => event.event_name !== "auth_success"),
        accountUsage: (tools.data ?? []).length > 0,
      },
      registeredUsers: (users.data ?? []).length,
      newUsersInWindow: (users.data ?? []).filter((user) => user.created_at >= since).length,
      workflowRuns: (workflowRuns.data ?? []).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
      authFailures: failures.auth,
      toolFailures: failures.tool,
      topTools: toolUsage.slice(0, 12),
      leastUsedTools: [...registered].filter((id) => !byTool.has(id)).slice(0, 12).map((id) => ({ toolId: id, name: baseRegistry.tools.find((tool) => tool.id === id)?.name ?? id, count: 0 })),
      byCategory: [...byCategory.entries()].map(([categoryId, count]) => ({ categoryId, count })).sort((a, b) => b.count - a.count),
      collectedAt: new Date().toISOString(),
    });
  } catch (error) {
    sendError(res, error, "Analytics unavailable.");
  }
});

app.get("/api/admin/audit", async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
  const r = await service.from("audit_logs").select("id,user_id,action,metadata,created_at").order("created_at", { ascending: false }).limit(limit);
  if (r.error) return sendError(res, r.error, "Audit log unavailable.");
  res.json(r.data);
});

app.get("/api/admin/health", async (_req, res) => {
  const checks = {};
  const tables = ["profiles", "favorites", "saved_workflows", "saved_presets", "usage_records", "api_keys", "audit_logs", "tool_overrides", "category_overrides", "analytics_events", "admin_users"];
  for (const table of tables) {
    const r = await service.from(table).select("*", { count: "exact", head: true });
    checks[table] = r.error ? { ok: false, error: "unavailable" } : { ok: true, rows: r.count ?? 0 };
  }
  const ok = Object.values(checks).every((check) => check.ok);
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", checks, migrationRequired: !checks.tool_overrides.ok || !checks.admin_users.ok || !checks.analytics_events.ok });
});

/* ------------------------------------------------------------------ *
 * Phase 6 — user management (WS B)
 * ------------------------------------------------------------------ */

const AUTH_BAN_INDEFINITE = "876000h"; // 100 years: treated as an indefinite ban.

async function loadActiveAdminRoles() {
  const r = await service.from("admin_users").select("user_id,role,revoked_at");
  if (r.error) throw r.error;
  const map = new Map();
  for (const row of r.data ?? []) if (!row.revoked_at) map.set(row.user_id, row.role);
  return map;
}

app.get("/api/admin/users", requireRole("admin"), async (req, res) => {
  try {
    const query = String(req.query.query ?? "").trim().toLowerCase().slice(0, 100);
    const status = String(req.query.status ?? "all"); // all | active | suspended
    const page = Math.max(1, Math.min(50, Number(req.query.page ?? 1) || 1));
    const pageSize = Math.max(10, Math.min(100, Number(req.query.pageSize ?? 25) || 25));
    const roles = await loadActiveAdminRoles();
    // Bounded fan-out: at most 5 pages x 100 users covers current platform scale.
    const all = [];
    let total = 0;
    for (let p = 1; p <= 5; p += 1) {
      const { data, error } = await service.auth.admin.listUsers({ page: p, perPage: 100 });
      if (error) return sendError(res, error, "User listing unavailable.");
      const users = data?.users ?? [];
      total = data?.total ?? all.length;
      all.push(...users);
      if (users.length < 100) break;
    }
    let users = all.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      bannedUntil: u.banned_until ?? null,
      suspended: Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
      role: roles.get(u.id) ?? null,
    }));
    if (query) users = users.filter((u) => (u.email ?? "").toLowerCase().includes(query) || u.id.toLowerCase().includes(query));
    if (status === "suspended") users = users.filter((u) => u.suspended);
    if (status === "active") users = users.filter((u) => !u.suspended);
    const filtered = users.length;
    const start = (page - 1) * pageSize;
    res.json({ users: users.slice(start, start + pageSize), total: filtered, authTotal: total, page, pageSize });
  } catch (error) {
    sendError(res, error, "User listing unavailable.");
  }
});

app.post("/api/admin/users/:id/suspend", requireRole("admin"), async (req, res) => {
  const id = String(req.params.id);
  try {
    if (id === req.devutils.user.id) return res.status(400).json({ error: "You cannot suspend your own account." });
    const targetRole = await adminRoleOf(id);
    if (targetRole === "super_admin" && req.devutils.adminRole !== "super_admin") {
      return res.status(403).json({ error: "Only a super-administrator can suspend another administrator." });
    }
    const { error } = await service.auth.admin.updateUserById(id, { ban_duration: AUTH_BAN_INDEFINITE });
    if (error) return sendError(res, error, "Suspension failed.");
    adminCache.delete(id);
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "user_suspended", { target_user_id: id }))) return;
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, "Suspension failed.");
  }
});

app.post("/api/admin/users/:id/reactivate", requireRole("admin"), async (req, res) => {
  const id = String(req.params.id);
  try {
    if (id === req.devutils.user.id) return res.status(400).json({ error: "You cannot reactivate your own account." });
    const { error } = await service.auth.admin.updateUserById(id, { ban_duration: "none" });
    if (error) return sendError(res, error, "Reactivation failed.");
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "user_reactivated", { target_user_id: id }))) return;
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, "Reactivation failed.");
  }
});

app.post("/api/admin/users/:id/revoke-access", requireRole("admin"), async (req, res) => {
  const id = String(req.params.id);
  try {
    if (id === req.devutils.user.id) return res.status(400).json({ error: "You cannot revoke your own access." });
    const targetRole = await adminRoleOf(id);
    if (targetRole === "super_admin" && req.devutils.adminRole !== "super_admin") {
      return res.status(403).json({ error: "Only a super-administrator can revoke another administrator's access." });
    }
    const { error } = await service.auth.admin.signOut(id);
    if (error) return sendError(res, error, "Access revocation failed.");
    adminCache.delete(id);
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "user_access_revoked", { target_user_id: id }))) return;
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, "Access revocation failed.");
  }
});

app.put("/api/admin/users/:id/role", requireRole("super_admin"), async (req, res) => {
  const id = String(req.params.id);
  const role = String(req.body?.role ?? "");
  try {
    if (id === req.devutils.user.id) return res.status(400).json({ error: "You cannot change your own role." });
    if (!["moderator", "admin", "super_admin"].includes(role)) return res.status(400).json({ error: "role must be moderator, admin, or super_admin." });
    const { error } = await service.rpc("set_admin_role", { p_user_id: id, p_role: role, p_set_by: req.devutils.user.id });
    if (error) return sendError(res, error, "Role assignment failed.");
    adminCache.delete(id);
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "admin_role_assigned", { target_user_id: id, role }))) return;
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, "Role assignment failed.");
  }
});

app.delete("/api/admin/users/:id/role", requireRole("super_admin"), async (req, res) => {
  const id = String(req.params.id);
  try {
    if (id === req.devutils.user.id) return res.status(400).json({ error: "You cannot revoke your own role." });
    const { error } = await service.rpc("revoke_admin", { p_user_id: id });
    if (error) return sendError(res, error, "Role revocation failed.");
    adminCache.delete(id);
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "admin_role_revoked", { target_user_id: id }))) return;
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, "Role revocation failed.");
  }
});

app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));
app.use(express.static(dist, { index: false, maxAge: production ? "1h" : 0, etag: true }));

app.use((req, res, next) => {
  if (req.method !== "GET" || !req.accepts("html")) return next();

  const nonce = res.locals.cspNonce;
  const runtime =
    `<script nonce="${nonce}">window.__DEVUTILS_CONFIG__={"authMode":"server","accountsEnabled":true,"analyticsEvents":${JSON.stringify(ANALYTICS_EVENTS)}};</script>`;


const html = indexHtml
  .replace(
    '<script type="module" crossorigin>',
    `<script type="module" crossorigin nonce="${nonce}">`
  )
  .replace("</head>", `${runtime}</head>`);

  res
    .type("html")
    .set("Cache-Control", "no-cache")
    .send(html);
});


app.use((error, _req, res, _next) => {
  if (error instanceof ConfigError) return res.status(500).json({ error: "Server configuration error." });
  const status = error?.type === "entity.too.large" ? 413 : error instanceof SyntaxError ? 400 : 500;
  if (!production) console.error(error instanceof Error ? error.message : error);
  res.status(status).json({
    error: status === 413 ? "Request body is too large." : status === 400 ? "Request body is not valid JSON." : "Internal server error.",
  });
});

app.listen(PORT, "127.0.0.1", () => console.log(`DevUtils listening on http://127.0.0.1:${PORT}`));
