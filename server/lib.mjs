/**
 * Pure, dependency-free helpers shared by the DevUtils gateway.
 *
 * Everything here is side-effect free so it can be unit tested without a
 * database, network, or running server (see scripts/test-server.mjs).
 */

/* ------------------------------------------------------------------ *
 * Configuration / origin validation
 * ------------------------------------------------------------------ */

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

const REQUIRED_ENV = ["APP_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

/** Returns the list of missing/invalid configuration problems (no secret values). */
export function validateServerConfig(env, { production = true } = {}) {
  const errors = [];
  for (const key of REQUIRED_ENV) {
    if (!String(env[key] ?? "").trim()) errors.push(`Missing required environment variable: ${key}`);
  }
  if (errors.length) return errors;

  let appUrl;
  try {
    appUrl = new URL(env.APP_URL);
  } catch {
    return [...errors, "APP_URL must be a valid absolute URL."];
  }
  if (appUrl.pathname !== "/" || appUrl.search || appUrl.hash) {
    errors.push("APP_URL must be an origin only, without a path, query, or fragment.");
  }
  if (production && appUrl.protocol !== "https:") errors.push("APP_URL must use https:// in production.");
  try {
    new URL(env.SUPABASE_URL);
  } catch {
    errors.push("SUPABASE_URL must be a valid absolute URL.");
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY === env.SUPABASE_PUBLISHABLE_KEY) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY must not equal the publishable key.");
  }
  if (env.PORT !== undefined && env.PORT !== "" && (!/^\d+$/.test(String(env.PORT)) || Number(env.PORT) < 1 || Number(env.PORT) > 65535)) {
    errors.push("PORT must be an integer from 1 to 65535.");
  }
  return errors;
}

/**
 * Decides whether a cross-site request may mutate state.
 *
 * The previous implementation compared Origin only with APP_URL, which made
 * login fail with 403 whenever the site was reached by IP address, an
 * alternate hostname, or through the Vite dev proxy. Requests without an
 * Origin header are same-site navigations/forms and are allowed; requests
 * with one must match the app origin, the request Host, or an explicitly
 * configured extra origin.
 */
export function isAllowedOrigin({ origin, host, appOrigin, extraOrigins = [] }) {
  if (!origin) return true;
  const allowed = new Set([appOrigin, ...extraOrigins]);
  if (allowed.has(origin)) return true;
  if (!host) return false;
  try {
    const url = new URL(origin);
    return url.host === host;
  } catch {
    return false;
  }
}

export function parseExtraOrigins(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Double-submit CSRF validation.
 *
 * Both the cookie and the header must be present and equal. Comparing two
 * absent values would otherwise succeed and bypass the check entirely.
 */
export function isCsrfValid(cookieToken, headerToken) {
  if (!cookieToken || !headerToken) return false;
  const a = Buffer.from(String(cookieToken));
  const b = Buffer.from(String(headerToken));
  return a.length === b.length && timingSafeEqualBytes(a, b);
}

function timingSafeEqualBytes(a, b) {
  // Local copy so lib.mjs stays dependency-free and importable in tests.
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ------------------------------------------------------------------ *
 * Error mapping — never leak upstream details to clients
 * ------------------------------------------------------------------ */

export function publicErrorMessage(error, fallback = "Request failed.") {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/auth|session|token|expired|invalid login/i.test(message)) return message;
  if (/rate limit|too many/i.test(message)) return "Too many requests. Please slow down and try again.";
  return fallback;
}

/** 502 for upstream/dependency failures, 500 otherwise, 400 for client input. */
export function upstreamStatus(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/fetch failed|network|econnrefused|etimedout|timeout|supabase|postgres|relation .* does not exist/i.test(message)) return 502;
  return 500;
}

/* ------------------------------------------------------------------ *
 * Persistence sanitisation (secrets never stored in presets/workflows)
 * ------------------------------------------------------------------ */

const SENSITIVE_KEY = /(?:password|passwd|secret|token|jwt|private.?key|api.?key|apikey|access.?key|certificate|pem|authorization|cookie|credential|dsn|connection.?string)/i;

export function safeConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  const out = {};
  for (const [key, value] of Object.entries(config)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (!["string", "number", "boolean"].includes(typeof value)) continue;
    if (String(value).length > 2000) continue;
    out[String(key).slice(0, 100)] = value;
  }
  return out;
}

export function safeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.slice(0, 30).map((step, index) => ({
    id: String(step?.id ?? `step-${index + 1}`).slice(0, 200),
    operationId: String(step?.operationId ?? "").slice(0, 200),
    label: String(step?.label ?? "").slice(0, 100),
    ...(step?.config ? { config: safeConfig(step.config) } : {}),
  })).filter((step) => step.operationId);
}

export function tokenExpiry(token) {
  try {
    const body = JSON.parse(Buffer.from(String(token).split(".")[1] ?? "", "base64url").toString("utf8"));
    return body.exp ? new Date(Number(body.exp) * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Tools Management — validation and merge (single source of truth)
 * ------------------------------------------------------------------ */

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const VISIBILITY = ["published", "draft", "archived"];
export const MAX_TAGS = 12;
export const MAX_KEYWORDS = 24;

const str = (value, max) => (typeof value === "string" ? value.slice(0, max) : undefined);
const strArray = (value, max, itemMax) =>
  Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim().slice(0, itemMax)))].slice(0, max)
    : [];

/**
 * Validates an administrator-supplied tool override.
 * Returns { ok: true, value } or { ok: false, errors: string[] }.
 * Only metadata is editable — never executable code.
 */
export function validateToolOverride(input, { baseIds = [], existingSlugs = new Map(), id } = {}) {
  const errors = [];
  const toolId = String(id ?? input?.id ?? "").trim();
  if (!toolId) errors.push("Tool id is required.");
  else if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(toolId)) errors.push("Tool id must be 2-64 characters of lowercase letters, digits, or hyphens.");
  else if (baseIds.length && !baseIds.includes(toolId)) errors.push(`Tool id "${toolId}" is not a registered implementation. New implementations must be added in code first.`);

  const value = {
    id: toolId,
    name: str(input?.name, 80),
    slug: str(input?.slug, 80),
    description: str(input?.description, 240),
    longDescription: str(input?.longDescription ?? input?.long_description, 1200),
    category: str(input?.category, 40),
    keywords: strArray(input?.keywords, MAX_KEYWORDS, 40),
    aliases: strArray(input?.aliases, MAX_KEYWORDS, 60),
    tags: strArray(input?.tags, MAX_TAGS, 30),
    related: strArray(input?.related, 8, 64),
    order: Number.isFinite(Number(input?.order)) ? Math.max(0, Math.min(9999, Math.trunc(Number(input?.order)))) : undefined,
    featured: typeof input?.featured === "boolean" ? input.featured : undefined,
    enabled: typeof input?.enabled === "boolean" ? input.enabled : undefined,
    visibility: VISIBILITY.includes(input?.visibility) ? input.visibility : undefined,
  };

  if (value.name !== undefined && value.name.trim().length < 2) errors.push("Name must be at least 2 characters.");
  if (value.description !== undefined && value.description.trim().length < 8) errors.push("Description must be at least 8 characters.");
  if (value.slug !== undefined) {
    if (!SLUG_PATTERN.test(value.slug)) errors.push("Slug must be lowercase letters, digits, and single hyphens (no leading/trailing hyphen).");
    const owner = existingSlugs.get(value.slug);
    if (owner && owner !== toolId) errors.push(`Slug "${value.slug}" is already used by tool "${owner}".`);
  }
  if (value.visibility !== undefined && value.visibility === "archived" && value.enabled === true) {
    errors.push("An archived tool cannot be enabled. Set visibility to published or draft.");
  }
  if (input?.visibility !== undefined && !VISIBILITY.includes(input.visibility)) errors.push(`Visibility must be one of: ${VISIBILITY.join(", ")}.`);
  if (input?.order !== undefined && !Number.isFinite(Number(input.order))) errors.push("Order must be a number.");
  if (value.related.some((related) => related === toolId)) errors.push("A tool cannot list itself as related.");

  const clean = Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)));
  return errors.length ? { ok: false, errors } : { ok: true, value: clean };
}

export function validateCategoryOverride(input, { id } = {}) {
  const errors = [];
  const categoryId = String(id ?? input?.id ?? "").trim();
  if (!categoryId) errors.push("Category id is required.");
  else if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(categoryId)) errors.push("Category id must be lowercase letters, digits, or hyphens.");

  const value = {
    id: categoryId,
    name: str(input?.name, 60),
    slug: str(input?.slug, 60),
    description: str(input?.description, 400),
    tagline: str(input?.tagline, 160),
    order: Number.isFinite(Number(input?.order)) ? Math.max(0, Math.min(999, Math.trunc(Number(input?.order)))) : undefined,
    enabled: typeof input?.enabled === "boolean" ? input.enabled : undefined,
  };
  if (value.name !== undefined && value.name.trim().length < 2) errors.push("Category name must be at least 2 characters.");
  if (value.slug !== undefined && !SLUG_PATTERN.test(value.slug)) errors.push("Category slug must be lowercase letters, digits, and single hyphens.");
  if (input?.order !== undefined && !Number.isFinite(Number(input.order))) errors.push("Order must be a number.");

  const clean = Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
  return errors.length ? { ok: false, errors } : { ok: true, value: clean };
}

/**
 * Merges code-registered base definitions with persisted administrator
 * overrides. Base definitions remain the implementation source of truth;
 * overrides may only change metadata, ordering, and visibility.
 */
export function mergeToolRegistry(baseTools, toolOverrides = [], categoryOverrides = [], { includeUnpublished = false } = {}) {
  const byId = new Map(toolOverrides.map((row) => [row.id, row]));
  const merged = baseTools.map((tool, index) => {
    const override = byId.get(tool.id) ?? {};
    // NULL/undefined DB columns mean "not set" — never let them clobber base metadata.
    const definedOverride = Object.fromEntries(Object.entries(override).filter(([, value]) => value !== null && value !== undefined));
    const visibility = override.visibility ?? (override.enabled === false ? "draft" : "published");
    return {
      ...tool,
      ...definedOverride,
      id: tool.id,
      longDescription: override.long_description ?? override.longDescription ?? tool.longDescription,
      route: override.slug && override.slug !== tool.slug ? `/tools/${override.slug}` : tool.route,
      slug: override.slug ?? tool.slug,
      visibility,
      enabled: visibility !== "archived" && override.enabled !== false,
      order: Number.isFinite(Number(override.order)) ? Number(override.order) : index,
      updatedAt: override.updated_at ?? override.updatedAt ?? null,
      updatedBy: override.updated_by ?? override.updatedBy ?? null,
    };
  });

  const catById = new Map(categoryOverrides.map((row) => [row.id, row]));
  const visible = merged.filter((tool) => includeUnpublished || tool.visibility === "published");
  visible.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  return { tools: visible, allTools: merged, categories: catById };
}

/** Validates an imported registry bundle before any write is attempted. */
export function validateRegistryImport(payload, baseTools, baseCategories = []) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, errors: ["Import payload must be a JSON object."] };
  }
  const tools = payload.tools;
  const categories = payload.categories ?? [];
  if (!Array.isArray(tools)) errors.push("Payload must contain a tools array.");
  if (!Array.isArray(categories)) errors.push("Payload categories must be an array.");
  if (errors.length) return { ok: false, errors };
  if (tools.length > 500) return { ok: false, errors: ["Import is limited to 500 tool entries."] };
  if (categories.length > 200) return { ok: false, errors: ["Import is limited to 200 category entries."] };

  const baseIds = baseTools.map((tool) => tool.id);
  const existingSlugs = new Map(baseTools.map((tool) => [tool.slug, tool.id]));
  const seenIds = new Set();
  const validTools = [];
  tools.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) { errors.push(`tools[${index}]: entry must be an object.`); return; }
    const id = String(entry.id ?? "").trim();
    if (seenIds.has(id)) { errors.push(`tools[${index}]: duplicate id "${id}".`); return; }
    seenIds.add(id);
    const result = validateToolOverride(entry, { baseIds, existingSlugs, id });
    if (result.ok) {
      validTools.push(result.value);
      if (result.value.slug) existingSlugs.set(String(result.value.slug), id);
    } else result.errors.forEach((message) => errors.push(`tools[${index}] (${id || "no id"}): ${message}`));
  });

  const baseCategoryIds = new Set(baseCategories.map((category) => String(category.id)));
  const seenCategoryIds = new Set();
  const validCategories = [];
  categories.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) { errors.push(`categories[${index}]: entry must be an object.`); return; }
    const id = String(entry.id ?? "").trim();
    if (seenCategoryIds.has(id)) { errors.push(`categories[${index}]: duplicate id "${id}".`); return; }
    seenCategoryIds.add(id);
    if (!baseCategoryIds.has(id)) { errors.push(`categories[${index}] (${id || "no id"}): category is not registered in this build.`); return; }
    const result = validateCategoryOverride(entry, { id });
    if (result.ok) validCategories.push(result.value);
    else result.errors.forEach((message) => errors.push(`categories[${index}] (${id || "no id"}): ${message}`));
  });

  return errors.length
    ? { ok: false, errors: errors.slice(0, 40) }
    : { ok: true, value: { tools: validTools, categories: validCategories } };
}

/** Converts validated camelCase tool fields to the database's snake_case columns. */
export function toToolOverrideDbRow(override, updatedBy, updatedAt) {
  const { longDescription, ...rest } = override;
  const row = { ...rest, updated_by: updatedBy, updated_at: updatedAt };
  if (longDescription !== undefined) row.long_description = longDescription;
  return row;
}

/** A cached administrator record is active only while its role is still
 * explicitly granted and its revocation timestamp is absent. */
export function isActiveAdminRecord(record) {
  return activeAdminRole(record) !== null;
}

/** Admin tiers, ordered: moderator < admin < super_admin. */
export const ADMIN_ROLE_RANK = { moderator: 1, admin: 2, super_admin: 3 };

/** Resolve the active role of an admin_users row, or null for none/revoked. */
export function activeAdminRole(record) {
  if (!record || record.revoked_at) return null;
  return ADMIN_ROLE_RANK[record.role] ? record.role : null;
}

/** True when `role` meets the `min` tier. Unknown tiers never pass. */
export function hasMinRole(role, min) {
  const r = ADMIN_ROLE_RANK[role] ?? 0;
  return r > 0 && r >= (ADMIN_ROLE_RANK[min] ?? 99);
}

/* ------------------------------------------------------------------ *
 * Analytics — privacy-safe allowlist only
 * ------------------------------------------------------------------ */

export const ANALYTICS_EVENTS = [
  "tool_opened",
  "tool_completed",
  "tool_copied",
  "tool_downloaded",
  "search_used",
  "category_visited",
  "auth_success",
  "auth_failure",
  "tool_config_changed",
  "tool_visibility_changed",
];

const ANALYTICS_LIMIT = new Set(ANALYTICS_EVENTS);

/**
 * Accepts only allowlisted event names and short identifiers.
 * Free-form payloads and tool input are rejected by design.
 */
export function sanitizeAnalyticsEvent(input) {
  if (!input || typeof input !== "object") return null;
  const name = String(input.name ?? "");
  if (!ANALYTICS_LIMIT.has(name)) return null;
  return {
    event_name: name,
    tool_id: str(input.toolId, 64) ?? null,
    category_id: str(input.categoryId, 40) ?? null,
    outcome: ["success", "failure"].includes(input.outcome) ? input.outcome : null,
  };
}

/* ------------------------------------------------------------------ *
 * Redirect safety
 * ------------------------------------------------------------------ */

const SAFE_LOCAL_ROUTES = new Set([
  "/", "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email",
  "/account", "/tools", "/categories", "/workflows", "/about", "/admin",
]);

/** Allows only known local routes — prevents open-redirect via ?auth_next=. */
export function safeNextRoute(value, fallback = "/") {
  const next = String(value ?? "").trim();
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (SAFE_LOCAL_ROUTES.has(next)) return next;
  if (/^\/(tools|categories|account)\/[a-z0-9-]{1,80}$/.test(next)) return next;
  return fallback;
}

/* ------------------------------------------------------------------ *
 * Phase 5 — pinned tools + personal collections
 * ------------------------------------------------------------------ */

const FAVORITE_KINDS = ["tool", "toolkit", "workflow", "integration"];

/** Normalizes a pinned-tool reorder payload: strings only, trimmed, deduped, capped. */
export function safePinnedToolIds(value, { max = 50 } = {}) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const item of value.slice(0, max)) {
    const id = String(item ?? "").trim().slice(0, 200);
    if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
  }
  return ids;
}

/** Validates collection create/update payloads. Names are unique per user. */
export function validateCollectionInput(body, { existingNames = [], requireName = true } = {}) {
  const errors = [];
  const name = String(body?.name ?? "").trim().slice(0, 60);
  const description = String(body?.description ?? "").trim().slice(0, 200);
  if (requireName || body?.name !== undefined) {
    if (!name) errors.push("Collection name is required.");
    else if (existingNames.includes(name)) errors.push("A collection with that name already exists.");
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: { name, description } };
}

/** Validates a collection-item payload; returns null when invalid. */
export function safeCollectionItemInput(body) {
  const kind = FAVORITE_KINDS.includes(body?.kind) ? body.kind : null;
  const targetId = String(body?.targetId ?? "").trim().slice(0, 200);
  if (!kind || !targetId) return null;
  return { kind, targetId };
}

/* ---------------- Phase 6 WS C/D: publish validation, flags, broken-tool scan ---------------- */

export function validatePublishableSlug(slug, { id, existingSlugs = new Map() } = {}) {
  const errors = [];
  const value = String(slug ?? "").trim();
  if (!value) return { ok: true, value: null, errors };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) errors.push("Slug must be lowercase words separated by single hyphens.");
  if (value.length < 2 || value.length > 80) errors.push("Slug must be between 2 and 80 characters.");
  const owner = existingSlugs.get(value);
  if (owner && owner !== id) errors.push("Slug is already used by another tool.");
  if (errors.length) return { ok: false, value: null, errors };
  return { ok: true, value, errors };
}

export function mergeFeatureFlags(defaults, rows) {
  const out = { ...defaults };
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row && typeof row.key === "string" && Object.prototype.hasOwnProperty.call(out, row.key)) {
      out[row.key] = Boolean(row.enabled);
    }
  }
  return out;
}

export function findBrokenTools(tools, baseToolIds = []) {
  const base = new Set(baseToolIds);
  const byRoute = new Map();
  const broken = [];
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (!tool || typeof tool !== "object") continue;
    if (tool.visibility !== "published") continue;
    if (base.size && !base.has(tool.id)) { broken.push({ id: String(tool.id), reason: "not present in the base registry" }); continue; }
    const route = String(tool.route ?? tool.slug ?? tool.id);
    const previous = byRoute.get(route);
    if (previous) { broken.push({ id: String(tool.id), reason: `route ${route} duplicates tool ${previous}` }); continue; }
    if (!/^\/[a-z0-9-]+$/.test(route)) { broken.push({ id: String(tool.id), reason: `route ${route} is not a valid tool route` }); continue; }
    byRoute.set(route, String(tool.id));
  }
  return broken;
}
