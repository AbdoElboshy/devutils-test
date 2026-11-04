import { mountApiV1, createGatewayStats, normalizePlanId, planAllowsTeams, withinMemberLimit, canRemoveMember, canManageTeamWorkflows } from "./api-v1.mjs";
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
  validatePublishableSlug,
  mergeFeatureFlags,
  findBrokenTools,
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
const SUPABASE_ORIGIN = new URL(process.env.SUPABASE_URL).origin;
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
  res.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: ${SUPABASE_ORIGIN}; connect-src 'self' https://cloudflare-dns.com https://dns.google; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`);
  res.setHeader("Vary", "Origin");
  next();
});
app.use(compression());
app.use((req, res, next) => {
  // Strict (objects/arrays only) for every route, EXCEPT /api/v1: public
  // operation inputs may be top-level JSON primitives (strings, numbers,
  // booleans) — e.g. base64.encode takes a raw JSON string body.
  if (req.path === "/api/account/avatar") return next(); // raw image bytes, parsed by express.raw in the route
  express.json({ limit: "1mb", strict: !req.path.startsWith("/api/v1/") })(req, res, next);
});
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
  /* Log guarded details in every environment — the profile-save 500 was
     invisible for days because errors only printed outside production.
     error.code/message only: never tokens, bodies, or secrets. */
  console.error(`[DevUtils] request failed: ${error?.code ?? ""} ${error?.message ?? error}`);
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
app.get("/runtime-config.js", async (_req, res) => {
  let flags = {};
  try { flags = await effectiveFlags(); } catch { flags = {}; }
  const payload = { authMode: "server", accountsEnabled: true, flags };
  res.type("application/javascript").set("Cache-Control", "no-store")
    .send(`window.__DEVUTILS_CONFIG__=${JSON.stringify(payload)};`);
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

/* Avatar upload: raw image bytes -> Supabase Storage via service role only
   (no storage policies for anon/authenticated). One object per user. */
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
app.post("/api/account/avatar", express.raw({ type: AVATAR_TYPES, limit: "5mb" }), requireOrigin, requireCsrf, requireSession, accountLimit, async (req, res) => {
  const contentType = String(req.headers["content-type"] ?? "");
  if (!AVATAR_TYPES.includes(contentType)) return res.status(415).json({ error: "Unsupported image type. Use PNG, JPEG, WebP or GIF." });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "Empty upload." });
  try {
    const objectPath = `${req.devutils.user.id}/avatar`;
    const upload = await service.storage.from("avatars").upload(objectPath, req.body, { contentType, upsert: true });
    if (upload.error) return sendError(res, upload.error, "Avatar upload failed.");
    const { data } = service.storage.from("avatars").getPublicUrl(objectPath);
    const avatarUrl = `${data?.publicUrl ?? ""}?v=${Date.now()}`; // cache-bust: same object path, fresh URL
    if (!avatarUrl) return res.status(500).json({ error: "Could not resolve the avatar URL." });
    const update = await service.from("profiles").update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq("user_id", req.devutils.user.id);
    if (update.error) return sendError(res, update.error, "Could not attach the avatar to your profile.");
    await audit(req.devutils.user.id, "avatar_updated", {});
    res.json({ avatarUrl });
  } catch (error) {
    sendError(res, error, "Avatar upload failed.");
  }
});

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

/* p13: team-scoped workflows. Any member can read and copy a shared
   workflow into their personal space (via the existing personal upsert
   route); owners and admins manage the shared copy. */
app.get("/api/account/teams/:id/workflows", async (req, res) => {
  const teamId = String(req.params.id).slice(0, 64);
  try {
    const me = await service.from("team_members").select("role").eq("team_id", teamId).eq("user_id", req.devutils.user.id).maybeSingle();
    if (me.error) return sendError(res, me.error, "Team workflow lookup unavailable.");
    if (!me.data) return res.status(404).json({ error: "Unknown team." });
    const r = await service.from("team_workflows").select("id,name,description,steps,updated_at,updated_by").eq("team_id", teamId).order("updated_at", { ascending: false });
    if (r.error) return sendError(res, r.error, "Team workflow lookup unavailable.");
    res.json({ workflows: r.data ?? [] });
  } catch (error) { sendError(res, error, "Team workflow lookup unavailable."); }
});

app.put("/api/account/teams/:id/workflows/:wfId", async (req, res) => {
  const teamId = String(req.params.id).slice(0, 64);
  const wfId = String(req.params.wfId).slice(0, 200);
  const body = req.body ?? {};
  const name = String(body.name ?? "").trim().slice(0, 100);
  const steps = safeSteps(body.steps);
  if (!name) return res.status(400).json({ error: "Workflow name must be 1-100 characters." });
  if (!steps.length) return res.status(400).json({ error: "A workflow needs at least one step." });
  try {
    const me = await service.from("team_members").select("role").eq("team_id", teamId).eq("user_id", req.devutils.user.id).maybeSingle();
    if (me.error) return sendError(res, me.error, "Team workflow save failed.");
    if (!me.data) return res.status(404).json({ error: "Unknown team." });
    if (!canManageTeamWorkflows(me.data.role)) return res.status(403).json({ error: "Only team owners and admins can manage shared workflows." });
    const r = await service.from("team_workflows").upsert({ team_id: teamId, id: wfId, name, description: String(body.description ?? "").slice(0, 500), steps, updated_by: req.devutils.user.id, updated_at: new Date().toISOString() }, { onConflict: "team_id,id" }).select("id,name,updated_at");
    if (r.error) return sendError(res, r.error, "Team workflow save failed.");
    await audit(req.devutils.user.id, "workflow_created", { resource: "team_workflow", team_id: teamId, id: wfId });
    res.json(r.data?.[0] ?? { ok: true });
  } catch (error) { sendError(res, error, "Team workflow save failed."); }
});

app.delete("/api/account/teams/:id/workflows/:wfId", async (req, res) => {
  const teamId = String(req.params.id).slice(0, 64);
  const wfId = String(req.params.wfId).slice(0, 200);
  try {
    const me = await service.from("team_members").select("role").eq("team_id", teamId).eq("user_id", req.devutils.user.id).maybeSingle();
    if (me.error) return sendError(res, me.error, "Team workflow deletion failed.");
    if (!me.data) return res.status(404).json({ error: "Unknown team." });
    if (!canManageTeamWorkflows(me.data.role)) return res.status(403).json({ error: "Only team owners and admins can manage shared workflows." });
    const r = await service.from("team_workflows").delete().eq("team_id", teamId).eq("id", wfId);
    if (r.error) return sendError(res, r.error, "Team workflow deletion failed.");
    res.json({ ok: true });
  } catch (error) { sendError(res, error, "Team workflow deletion failed."); }
});

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
/* p12: team workspaces. Service-role access (teams tables are RLS-locked
   with no policies); authorization is enforced explicitly in each route.
   Members are added by user id (profiles has no email column) — operators
   find ids via GET /api/admin/users. */
async function planOfUser(userId) {
  const r = await service.from("profiles").select("plan_id").eq("user_id", userId).maybeSingle();
  if (r.error) throw r.error;
  return r.data?.plan_id ?? "free";
}

app.get("/api/account/teams", async (req, res) => {
  try {
    const mine = await service.from("team_members").select("team_id,role").eq("user_id", req.devutils.user.id);
    if (mine.error) return sendError(res, mine.error, "Team lookup unavailable.");
    const ids = (mine.data ?? []).map((row) => row.team_id);
    if (!ids.length) return res.json({ teams: [] });
    const roles = Object.fromEntries((mine.data ?? []).map((row) => [row.team_id, row.role]));
    const t = await service.from("teams").select("id,name,created_at").in("id", ids).order("created_at", { ascending: false });
    if (t.error) return sendError(res, t.error, "Team lookup unavailable.");
    const counts = await service.from("team_members").select("team_id").in("team_id", ids);
    if (counts.error) return sendError(res, counts.error, "Team lookup unavailable.");
    const countById = {};
    (counts.data ?? []).forEach((row) => { countById[row.team_id] = (countById[row.team_id] ?? 0) + 1; });
    res.json({ teams: (t.data ?? []).map((row) => ({ ...row, role: roles[row.id], memberCount: countById[row.id] ?? 0 })) });
  } catch (error) { sendError(res, error, "Team lookup unavailable."); }
});

app.post("/api/account/teams", async (req, res) => {
  const name = String(req.body?.name ?? "").trim().slice(0, 100);
  if (!name) return res.status(400).json({ error: "Team name must be 1-100 characters." });
  try {
    const planId = await planOfUser(req.devutils.user.id);
    if (!planAllowsTeams(planId)) return res.status(403).json({ error: "Team workspaces require the team or enterprise plan." });
    const t = await service.from("teams").insert({ name, owner_user_id: req.devutils.user.id }).select("id,name,created_at").single();
    if (t.error) return sendError(res, t.error, "Team creation failed.");
    const m = await service.from("team_members").insert({ team_id: t.data.id, user_id: req.devutils.user.id, role: "owner" });
    if (m.error) { await service.from("teams").delete().eq("id", t.data.id); return sendError(res, m.error, "Team creation failed."); }
    await audit(req.devutils.user.id, "team_created", { team_id: t.data.id });
    res.json({ team: { ...t.data, role: "owner", memberCount: 1 } });
  } catch (error) { sendError(res, error, "Team creation failed."); }
});

/* p12b: member roster for the team management UI. Members-only;
   display names come from profiles (no emails in the roster, by design). */
app.get("/api/account/teams/:id/members", async (req, res) => {
  const teamId = String(req.params.id).slice(0, 64);
  try {
    const me = await service.from("team_members").select("role").eq("team_id", teamId).eq("user_id", req.devutils.user.id).maybeSingle();
    if (me.error) return sendError(res, me.error, "Member list unavailable.");
    if (!me.data) return res.status(404).json({ error: "Unknown team." });
    const rows = await service.from("team_members").select("user_id,role").eq("team_id", teamId);
    if (rows.error) return sendError(res, rows.error, "Member list unavailable.");
    const ids = (rows.data ?? []).map((row) => row.user_id);
    const names = ids.length
      ? await service.from("profiles").select("user_id,display_name").in("user_id", ids)
      : { data: [], error: null };
    if (names.error) return sendError(res, names.error, "Member list unavailable.");
    const nameById = Object.fromEntries((names.data ?? []).map((row) => [row.user_id, row.display_name]));
    res.json({ members: (rows.data ?? []).map((row) => ({ userId: row.user_id, role: row.role, displayName: nameById[row.user_id] ?? null })) });
  } catch (error) { sendError(res, error, "Member list unavailable."); }
});

app.post("/api/account/teams/:id/members", async (req, res) => {
  const teamId = String(req.params.id).slice(0, 64);
  const userId = String(req.body?.userId ?? "").trim();
  const role = ["admin", "member"].includes(req.body?.role) ? String(req.body.role) : "member";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return res.status(400).json({ error: "userId must be a user id (uuid). Find ids in the admin users list." });
  try {
    const me = await service.from("team_members").select("role").eq("team_id", teamId).eq("user_id", req.devutils.user.id).maybeSingle();
    if (me.error) return sendError(res, me.error, "Member add failed.");
    if (!me.data || !["owner", "admin"].includes(me.data.role)) return res.status(403).json({ error: "Only team owners and admins can add members." });
    const planId = await planOfUser(req.devutils.user.id);
    const count = await service.from("team_members").select("team_id", { count: "exact", head: true }).eq("team_id", teamId);
    if (count.error) throw count.error;
    if (!withinMemberLimit(planId, count.count ?? 0)) return res.status(429).json({ error: "This plan's team member limit has been reached." });
    const target = await service.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
    if (target.error) return sendError(res, target.error, "Member lookup unavailable.");
    if (!target.data) return res.status(404).json({ error: "Unknown user." });
    const ins = await service.from("team_members").insert({ team_id: teamId, user_id: userId, role });
    if (ins.error) return sendError(res, ins.error, ins.error.code === "23505" ? "This user is already a member." : "Member add failed.");
    await audit(req.devutils.user.id, "team_member_added", { team_id: teamId });
    res.json({ ok: true });
  } catch (error) { sendError(res, error, "Member add failed."); }
});

app.delete("/api/account/teams/:id/members/:userId", async (req, res) => {
  const teamId = String(req.params.id).slice(0, 64);
  const userId = String(req.params.userId).slice(0, 64);
  try {
    const me = await service.from("team_members").select("role").eq("team_id", teamId).eq("user_id", req.devutils.user.id).maybeSingle();
    if (me.error) return sendError(res, me.error, "Member removal failed.");
    if (!me.data) return res.status(404).json({ error: "Unknown team." });
    const target = await service.from("team_members").select("role").eq("team_id", teamId).eq("user_id", userId).maybeSingle();
    if (target.error) return sendError(res, target.error, "Member removal failed.");
    if (!target.data) return res.status(404).json({ error: "This user is not a member." });
    const isSelf = userId === req.devutils.user.id;
    if (!isSelf && !canRemoveMember(me.data.role, target.data.role)) return res.status(403).json({ error: "Owners can remove anyone; admins can only remove members." });
    if (target.data.role === "owner") {
      const owners = await service.from("team_members").select("user_id", { count: "exact", head: true }).eq("team_id", teamId).eq("role", "owner");
      if (owners.error) throw owners.error;
      if ((owners.count ?? 0) <= 1) return res.status(400).json({ error: "A team must keep at least one owner. Delete the team instead." });
    }
    const del = await service.from("team_members").delete().eq("team_id", teamId).eq("user_id", userId);
    if (del.error) return sendError(res, del.error, "Member removal failed.");
    await audit(req.devutils.user.id, "team_member_removed", { team_id: teamId });
    res.json({ ok: true });
  } catch (error) { sendError(res, error, "Member removal failed."); }
});

app.delete("/api/account/teams/:id", async (req, res) => {
  const teamId = String(req.params.id).slice(0, 64);
  try {
    const me = await service.from("team_members").select("role").eq("team_id", teamId).eq("user_id", req.devutils.user.id).maybeSingle();
    if (me.error) return sendError(res, me.error, "Team deletion failed.");
    if (!me.data) return res.status(404).json({ error: "Unknown team." });
    if (me.data.role !== "owner") return res.status(403).json({ error: "Only the team owner can delete the team." });
    const del = await service.from("teams").delete().eq("id", teamId);
    if (del.error) return sendError(res, del.error, "Team deletion failed.");
    await audit(req.devutils.user.id, "team_deleted", { team_id: teamId });
    res.json({ ok: true });
  } catch (error) { sendError(res, error, "Team deletion failed."); }
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

/* p12: gateway observability for admins/moderators. Per-process (advisory,
     resets on restart); shape pinned by unit tests in scripts/test-server.mjs. */
app.get("/api/admin/api-stats", (_req, res) => {
  try { res.json({ ok: true, stats: gatewayStats.snapshot() }); } catch (error) { sendError(res, error, "API stats unavailable."); }
});

/* p12: admin plan management. Plan of record is profiles.plan_id — the same
   column the gateway's planOf reads, so changes apply immediately. No payment
   provider is configured; no checkout exists by design. */


app.put("/api/admin/users/:id/plan", requireRole("admin"), async (req, res) => {
  const userId = String(req.params.id).slice(0, 64);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return res.status(400).json({ error: "Invalid user id." });
  const planId = normalizePlanId(req.body?.planId);
  if (!planId) return res.status(400).json({ error: "planId must be one of: free, pro, team, enterprise." });
  try {
    const r = await service.from("profiles").update({ plan_id: planId, updated_at: new Date().toISOString() }).eq("user_id", userId).select("user_id,plan_id").maybeSingle();
    if (r.error) return sendError(res, r.error, "Plan update failed.");
    if (!r.data) return res.status(404).json({ error: "Unknown user." });
    const { error: metaError } = await service.auth.admin.updateUserById(userId, { app_metadata: { plan_id: planId } });
    if (metaError) return sendError(res, metaError, "Plan metadata update failed.");
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "plan_changed", { user_id: userId, plan_id: planId }))) return;
    res.json({ ok: true, userId, planId });
  } catch (error) { sendError(res, error, "Plan update failed."); }
});

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
    /* WS C: publish-time broken-route validation. If this override would create
       a duplicate or unresolvable public route, roll it back so the public
       registry can never break. */
    const merged = await registry({ includeUnpublished: true, maxAgeMs: 0 });
    const broken = findBrokenTools(merged.allTools, baseRegistry.tools.map((tool) => tool.id));
    if (broken.length) {
      await service.from("tool_overrides").delete().eq("id", id);
      invalidateRegistry();
      return res.status(400).json({ errors: broken.map((entry) => `Tool ${entry.id}: ${entry.reason}`) });
    }
    const changed = previous ? (previous.visibility ?? "published") !== (row.visibility ?? "published") || previous.enabled !== row.enabled : true;
    /* WS C: version history - one row per saved change. Best-effort: the
       override is already committed; a history write failure is logged, not fatal. */
    const history = await service.from("tool_override_versions").insert({ tool_id: id, patch: row, change_kind: changed ? "visibility" : "update", changed_by: req.devutils.user.id });
    if (history.error) console.error("[DevUtils] Version history write failed:", { tool_id: id, code: history.error.code ?? "unknown" });
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
  const existing = await service.from("tool_overrides").select("*").eq("id", id).maybeSingle();
  if (existing.error) return sendError(res, existing.error, "Reset failed.");
  if (existing.data) {
    const history = await service.from("tool_override_versions").insert({ tool_id: id, patch: existing.data, change_kind: "reset", changed_by: req.devutils.user.id });
    if (history.error) console.error("[DevUtils] Version history write failed:", { tool_id: id, code: history.error.code ?? "unknown" });
  }
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
  const tables = ["profiles", "favorites", "saved_workflows", "saved_presets", "usage_records", "api_keys", "audit_logs", "tool_overrides", "category_overrides", "analytics_events", "admin_users", "feature_flags", "tool_override_versions"];
  for (const table of tables) {
    const r = await service.from(table).select("*", { count: "exact", head: true });
    checks[table] = r.error ? { ok: false, error: "unavailable" } : { ok: true, rows: r.count ?? 0 };
  }
  let brokenTools = [];
  try {
    const merged = await registry({ includeUnpublished: true, maxAgeMs: 0 });
    brokenTools = findBrokenTools(merged.allTools, baseRegistry.tools.map((tool) => tool.id));
  } catch {
    brokenTools = [{ id: "unknown", reason: "registry unavailable" }];
  }
  const ok = Object.values(checks).every((check) => check.ok) && brokenTools.length === 0;
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", checks, brokenTools, migrationRequired: !checks.tool_overrides.ok || !checks.admin_users.ok || !checks.analytics_events.ok });
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
    // GoTrue has no admin sign-out-by-user-id; revoke their sessions via SQL function (see migration 202610230001).
    const { error } = await service.rpc("revoke_user_sessions", { p_user_id: id });
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

/* ---------------- Phase 6 WS C/D: version history, flags ---------------- */

const STATIC_FEATURE_FLAGS = Object.freeze({ new_search: true, accounts: true, pro: false, api: false, workflows: true, presets: true, teams: false, ai_explain: false, browser_extension: false, grafana_tools: true, zabbix_tools: true, prometheus_tools: true, loki_tools: true, observability_tools: true, cloud_tools: true });

let flagsCache = { at: 0, value: null };

async function dbFlags() {
  const r = await service.from("feature_flags").select("key,enabled,updated_at");
  if (r.error) throw r.error;
  return r.data ?? [];
}

async function effectiveFlags() {
  if (flagsCache.value && Date.now() - flagsCache.at < 15_000) return flagsCache.value;
  const value = mergeFeatureFlags(STATIC_FEATURE_FLAGS, await dbFlags());
  flagsCache = { at: Date.now(), value };
  return value;
}

app.get("/api/flags", async (_req, res) => {
  try {
    const flags = await effectiveFlags();
    res.type("application/json").set("Cache-Control", "public, max-age=60").json(flags);
  } catch {
    res.type("application/json").set("Cache-Control", "public, max-age=60").json({});
  }
});

app.get("/api/admin/tools/:id/history", requireRole("moderator"), async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const r = await service.from("tool_override_versions").select("id,patch,change_kind,changed_by,created_at").eq("tool_id", id).order("created_at", { ascending: false }).limit(50);
  if (r.error) return sendError(res, r.error, "History unavailable.");
  res.json(r.data);
});

app.post("/api/admin/tools/:id/restore", requireRole("admin"), async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const versionId = Number(req.body?.versionId);
  try {
    if (!Number.isInteger(versionId) || versionId < 1) return res.status(400).json({ error: "versionId must be a positive integer." });
    const v = await service.from("tool_override_versions").select("patch,tool_id").eq("id", versionId).eq("tool_id", id).maybeSingle();
    if (v.error) return sendError(res, v.error, "Restore failed.");
    if (!v.data) return res.status(404).json({ error: "Version not found for this tool." });
    const restored = toToolOverrideDbRow({ id, ...v.data.patch, visibility: v.data.patch.visibility ?? "draft" }, req.devutils.user.id, new Date().toISOString());
    const r = await service.from("tool_overrides").upsert(restored, { onConflict: "id" }).select().single();
    if (r.error) return sendError(res, r.error, "Restore failed.");
    invalidateRegistry();
    const merged = await registry({ includeUnpublished: true, maxAgeMs: 0 });
    const broken = findBrokenTools(merged.allTools, baseRegistry.tools.map((tool) => tool.id));
    if (broken.length) {
      await service.from("tool_overrides").delete().eq("id", id);
      invalidateRegistry();
      return res.status(400).json({ errors: broken.map((entry) => `Tool ${entry.id}: ${entry.reason}`) });
    }
    const history = await service.from("tool_override_versions").insert({ tool_id: id, patch: restored, change_kind: "restore", changed_by: req.devutils.user.id });
    if (history.error) console.error("[DevUtils] Version history write failed:", { tool_id: id, code: history.error.code ?? "unknown" });
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "tool_version_restored", { tool_id: id, version_id: versionId }))) return;
    res.json(r.data);
  } catch (error) {
    sendError(res, error, "Restore failed.");
  }
});

app.get("/api/admin/flags", requireRole("moderator"), async (_req, res) => {
  try {
    const rows = await dbFlags();
    const effective = mergeFeatureFlags(STATIC_FEATURE_FLAGS, rows);
    res.json(Object.keys(STATIC_FEATURE_FLAGS).map((key) => {
      const row = rows.find((entry) => entry.key === key);
      return { key, enabled: Boolean(effective[key]), defaultEnabled: Boolean(STATIC_FEATURE_FLAGS[key]), overridden: Boolean(row), updatedAt: row?.updated_at ?? null };
    }));
  } catch (error) {
    sendError(res, error, "Flags unavailable.");
  }
});

app.put("/api/admin/flags/:key", requireRole("admin"), async (req, res) => {
  const key = String(req.params.key).slice(0, 64);
  const enabled = Boolean(req.body?.enabled);
  try {
    if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(key)) return res.status(400).json({ error: "Invalid flag key." });
    if (!Object.prototype.hasOwnProperty.call(STATIC_FEATURE_FLAGS, key)) return res.status(400).json({ error: "Unknown feature flag." });
    const r = await service.from("feature_flags").upsert({ key, enabled, updated_by: req.devutils.user.id, updated_at: new Date().toISOString() }, { onConflict: "key" }).select().single();
    if (r.error) return sendError(res, r.error, "Flag update failed.");
    flagsCache = { at: 0, value: null };
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "feature_flag_changed", { flag: key, enabled }))) return;
    res.json(r.data);
  } catch (error) {
    sendError(res, error, "Flag update failed.");
  }
});

const gatewayStats = createGatewayStats();
mountApiV1(app, {
  service,
  stats: gatewayStats,
  /* DB-backed monthly usage counter (sub-track B batch 2). Writes to
     usage_records (metric "api_requests") — the same rows the account
     Usage page summarizes — so gateway traffic is restart-proof and
     visible in the UI. Best-effort: a failed counter write must not
     fail the API request that earned it. */
  usage: {
    async read(userId) {
      const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
      const r = await service.from("usage_records").select("quantity").eq("user_id", userId).eq("metric", "api_requests").gte("recorded_at", since);
      if (r.error) throw r.error;
      return (r.data ?? []).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
    },
    async count(userId) {
      const r = await service.from("usage_records").insert({ user_id: userId, metric: "api_requests", quantity: 1, resource_id: "api:v1" });
      if (r.error) console.error("[DevUtils] /api/v1 usage write failed:", r.error.code ?? r.error.message);
    },
    /* Optional metric writer so gateway workflow runs also show up as
       "Workflow runs" on the account Usage page. Best-effort. */
    async countMetric(userId, metric) {
      const safeMetric = ["workflow_runs", "api_requests"].includes(metric) ? metric : "api_requests";
      const r = await service.from("usage_records").insert({ user_id: userId, metric: safeMetric, quantity: 1, resource_id: "api:v1:workflow" });
      if (r.error) console.error("[DevUtils] /api/v1 metric write failed:", r.error.code ?? r.error.message);
    },
  },
  /* DB-backed sliding-window rate limiter for /api/v1 execute (p11).
     One row per accepted execute; rows older than the 60s window are pruned
     opportunistically (at most once a minute). Fail-open: on any DB error
     the gateway falls back to the in-memory limiter, never to a hard outage. */
  rate: {
    async count(keyId, sinceIso) {
      const r = await service.from("rate_limit_hits").select("hit_at", { count: "exact", head: true }).eq("key_id", keyId).gte("hit_at", sinceIso);
      if (r.error) throw r.error;
      return r.count ?? 0;
    },
    async oldest(keyId, sinceIso) {
      const r = await service.from("rate_limit_hits").select("hit_at").eq("key_id", keyId).gte("hit_at", sinceIso).order("hit_at", { ascending: true }).limit(1);
      if (r.error) throw r.error;
      return r.data?.[0]?.hit_at ?? null;
    },
    async record(keyId, atIso) {
      const r = await service.from("rate_limit_hits").insert({ key_id: keyId, hit_at: atIso });
      if (r.error) throw r.error;
    },
    async prune(beforeIso) {
      const r = await service.from("rate_limit_hits").delete().lt("hit_at", beforeIso);
      if (r.error) throw r.error;
    },
  },
  planOf: async (userId) => {
    const r = await service.from("profiles").select("plan_id").eq("user_id", userId).maybeSingle();
    if (r.error) { console.error("[DevUtils] /api/v1 plan lookup failed:", r.error.code ?? r.error.message); return "free"; }
    return r.data?.plan_id ?? "free";
  },
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
