/**
 * Unit tests for the gateway's pure logic (server/lib.mjs).
 * Runs with plain Node — no database, network, or Supabase project required.
 *
 *   node scripts/test-server.mjs
 */
import assert from "node:assert/strict";
import {
  ANALYTICS_EVENTS,
  isAllowedOrigin,
  isActiveAdminRecord,
  isCsrfValid,
  toToolOverrideDbRow,
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
  validateCategoryOverride,
  validateCollectionInput,
  validateRegistryImport,
  validateServerConfig,
  validateToolOverride,
} from "../server/lib.mjs";

let pass = 0, fail = 0;
const ok = (name, fn) => { try { fn(); pass++; } catch (error) { fail++; console.error(`FAIL ${name}\n  ${error.message}`); } };

const goodEnv = {
  NODE_ENV: "production",
  APP_URL: "https://devutils.example.com",
  SUPABASE_URL: "https://proj.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SERVICE_ROLE_KEY: "service_role_y",
};

/* ---------------- configuration validation ---------------- */
ok("valid production config passes", () => assert.deepEqual(validateServerConfig(goodEnv, { production: true }), []));
ok("missing variables are reported by name", () => {
  const errors = validateServerConfig({ APP_URL: "https://x.test" }, { production: true });
  assert.ok(errors.some((e) => e.includes("SUPABASE_SERVICE_ROLE_KEY")));
  assert.ok(errors.some((e) => e.includes("SUPABASE_PUBLISHABLE_KEY")));
});
ok("http APP_URL rejected in production", () => {
  const errors = validateServerConfig({ ...goodEnv, APP_URL: "http://devutils.example.com" }, { production: true });
  assert.ok(errors.some((e) => e.includes("https://")));
});
ok("http APP_URL allowed outside production", () => {
  assert.deepEqual(validateServerConfig({ ...goodEnv, APP_URL: "http://localhost:3000" }, { production: false }), []);
});
ok("APP_URL with a path is rejected", () => {
  const errors = validateServerConfig({ ...goodEnv, APP_URL: "https://devutils.example.com/app" }, { production: true });
  assert.ok(errors.some((e) => e.includes("origin only")));
});
ok("service role equal to publishable key is rejected", () => {
  const errors = validateServerConfig({ ...goodEnv, SUPABASE_SERVICE_ROLE_KEY: goodEnv.SUPABASE_PUBLISHABLE_KEY }, { production: true });
  assert.ok(errors.some((e) => e.includes("must not equal")));
});
ok("invalid PORT is rejected", () => {
  assert.ok(validateServerConfig({ ...goodEnv, PORT: "not-a-port" }, { production: true }).length > 0);
});
ok("error messages never contain secret values", () => {
  const errors = validateServerConfig({ ...goodEnv, SUPABASE_SERVICE_ROLE_KEY: "" }, { production: true });
  assert.ok(!errors.join(" ").includes("service_role_y"));
});

/* ---------------- origin allowlist ---------------- */
ok("same-origin request allowed", () => assert.equal(isAllowedOrigin({ origin: "https://devutils.example.com", host: "devutils.example.com", appOrigin: "https://devutils.example.com" }), true));
ok("request without Origin allowed (same-site form)", () => assert.equal(isAllowedOrigin({ origin: undefined, host: "devutils.example.com", appOrigin: "https://devutils.example.com" }), true));
ok("matching Host but different origin allowed (IP/alt hostname)", () => assert.equal(isAllowedOrigin({ origin: "https://203.0.113.5", host: "203.0.113.5", appOrigin: "https://devutils.example.com" }), true));
ok("cross-site origin rejected", () => assert.equal(isAllowedOrigin({ origin: "https://evil.example", host: "devutils.example.com", appOrigin: "https://devutils.example.com" }), false));
ok("explicit extra origin allowed", () => assert.equal(isAllowedOrigin({ origin: "http://localhost:5173", host: "devutils.example.com", appOrigin: "https://devutils.example.com", extraOrigins: ["http://localhost:5173"] }), true));
ok("extra origins parsed from CSV", () => assert.deepEqual(parseExtraOrigins(" a , b ,, c "), ["a", "b", "c"]));

/* ---------------- CSRF double-submit ---------------- */
ok("matching cookie and header accepted", () => assert.equal(isCsrfValid("token123", "token123"), true));
ok("missing cookie rejected", () => assert.equal(isCsrfValid(undefined, "token123"), false));
ok("missing header rejected", () => assert.equal(isCsrfValid("token123", undefined), false));
ok("both missing rejected (no empty-buffer bypass)", () => assert.equal(isCsrfValid(undefined, undefined), false));
ok("both empty strings rejected", () => assert.equal(isCsrfValid("", ""), false));
ok("mismatched tokens rejected", () => assert.equal(isCsrfValid("token123", "token124"), false));
ok("different-length tokens rejected", () => assert.equal(isCsrfValid("short", "muchlongertoken"), false));

/* ---------------- redirect safety ---------------- */
ok("known local route allowed", () => assert.equal(safeNextRoute("/account"), "/account"));
ok("tool route allowed", () => assert.equal(safeNextRoute("/tools/aws-arn-parser"), "/tools/aws-arn-parser"));
ok("absolute external URL rejected", () => assert.equal(safeNextRoute("https://evil.example/x"), "/"));
ok("protocol-relative URL rejected", () => assert.equal(safeNextRoute("//evil.example"), "/"));
ok("unknown deep path rejected", () => assert.equal(safeNextRoute("/etc/passwd"), "/"));
ok("javascript scheme rejected", () => assert.equal(safeNextRoute("javascript:alert(1)"), "/"));

/* ---------------- tool override validation ---------------- */
const baseIds = ["json", "regex", "aws-arn-parser"];
const slugs = new Map([["json", "json"], ["regex", "regex"]]);
ok("valid override accepted", () => {
  const result = validateToolOverride({ name: "JSON Toolkit", description: "Format and validate JSON.", visibility: "published", order: 3 }, { baseIds, existingSlugs: slugs, id: "json" });
  assert.equal(result.ok, true);
  assert.equal(result.value.order, 3);
});
ok("unregistered implementation id rejected", () => {
  const result = validateToolOverride({ name: "Nope tool" }, { baseIds, existingSlugs: slugs, id: "not-a-real-tool" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("not a registered implementation")));
});
ok("duplicate slug rejected", () => {
  const result = validateToolOverride({ slug: "regex" }, { baseIds, existingSlugs: slugs, id: "json" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("already used")));
});
ok("invalid slug characters rejected", () => {
  const result = validateToolOverride({ slug: "Bad Slug!" }, { baseIds, existingSlugs: slugs, id: "json" });
  assert.equal(result.ok, false);
});
ok("archived + enabled contradiction rejected", () => {
  const result = validateToolOverride({ visibility: "archived", enabled: true }, { baseIds, existingSlugs: slugs, id: "json" });
  assert.equal(result.ok, false);
});
ok("self-referencing related tool rejected", () => {
  const result = validateToolOverride({ related: ["json", "regex"] }, { baseIds, existingSlugs: slugs, id: "json" });
  assert.equal(result.ok, false);
});
ok("invalid visibility rejected", () => {
  const result = validateToolOverride({ visibility: "secret" }, { baseIds, existingSlugs: slugs, id: "json" });
  assert.equal(result.ok, false);
});
ok("non-numeric order rejected", () => {
  const result = validateToolOverride({ order: "soon" }, { baseIds, existingSlugs: slugs, id: "json" });
  assert.equal(result.ok, false);
});
ok("executable code cannot be smuggled through config keys", () => {
  const result = validateToolOverride({ name: "X tool", description: "A valid description.", route: "javascript:alert(1)" }, { baseIds, existingSlugs: slugs, id: "json" });
  // route is not an accepted override field, so it must be dropped
  assert.equal(result.ok, true);
  assert.equal(result.value.route, undefined);
});

/* ---------------- category override validation ---------------- */
ok("valid category accepted", () => assert.equal(validateCategoryOverride({ name: "Cloud", order: 2 }, { id: "cloud" }).ok, true));
ok("invalid category id rejected", () => assert.equal(validateCategoryOverride({ name: "Cloud" }, { id: "Bad ID" }).ok, false));
ok("short category name rejected", () => assert.equal(validateCategoryOverride({ name: "C" }, { id: "cloud" }).ok, false));

/* ---------------- registry merge ---------------- */
const baseTools = [
  { id: "alpha", name: "Alpha", slug: "alpha", route: "/tools/alpha", category: "dev", description: "d", keywords: [], aliases: [], related: [], capabilities: [], clientSide: true, howItWorks: [] },
  { id: "beta", name: "Beta", slug: "beta", route: "/tools/beta", category: "dev", description: "d", keywords: [], aliases: [], related: [], capabilities: [], clientSide: true, howItWorks: [] },
  { id: "gamma", name: "Gamma", slug: "gamma", route: "/tools/gamma", category: "dev", description: "d", keywords: [], aliases: [], related: [], capabilities: [], clientSide: true, howItWorks: [] },
];
ok("draft tools hidden from public merge", () => {
  const merged = mergeToolRegistry(baseTools, [{ id: "beta", visibility: "draft" }], []);
  assert.deepEqual(merged.tools.map((t) => t.id), ["alpha", "gamma"]);
  assert.equal(merged.allTools.length, 3);
});
ok("archived tools hidden but preserved for history", () => {
  const merged = mergeToolRegistry(baseTools, [{ id: "gamma", visibility: "archived" }], []);
  assert.deepEqual(merged.tools.map((t) => t.id), ["alpha", "beta"]);
  assert.equal(merged.allTools.find((t) => t.id === "gamma").visibility, "archived");
});
ok("order override reorders published tools", () => {
  const merged = mergeToolRegistry(baseTools, [{ id: "gamma", order: 0 }, { id: "alpha", order: 5 }], []);
  assert.deepEqual(merged.tools.map((t) => t.id), ["gamma", "beta", "alpha"]);
});
ok("slug override rewrites the route", () => {
  const merged = mergeToolRegistry(baseTools, [{ id: "alpha", slug: "alpha-v2" }], []);
  assert.equal(merged.tools.find((t) => t.id === "alpha").route, "/tools/alpha-v2");
});
ok("unknown override ids cannot invent tools", () => {
  const merged = mergeToolRegistry(baseTools, [{ id: "ghost", name: "Ghost", visibility: "published" }], []);
  assert.equal(merged.tools.some((t) => t.id === "ghost"), false);
});
ok("includeUnpublished exposes drafts to admins", () => {
  const merged = mergeToolRegistry(baseTools, [{ id: "beta", visibility: "draft" }], [], { includeUnpublished: true });
  assert.equal(merged.tools.length, 3);
});
ok("enabled:false maps to draft visibility", () => {
  const merged = mergeToolRegistry(baseTools, [{ id: "alpha", enabled: false }], []);
  assert.equal(merged.tools.some((t) => t.id === "alpha"), false);
  assert.equal(merged.allTools.find((t) => t.id === "alpha").visibility, "draft");
});
ok("null override columns do not clobber base tool metadata", () => {
  const merged = mergeToolRegistry(baseTools, [{ id: "alpha", name: null, category: null, description: null }], []);
  const alpha = merged.allTools.find((t) => t.id === "alpha");
  assert.equal(alpha.name, "Alpha");
  assert.equal(alpha.category, "dev");
  assert.equal(alpha.description, "d");
});
ok("database long_description overlays the frontend longDescription field", () => {
  const merged = mergeToolRegistry([{ id: "alpha", slug: "alpha", name: "Alpha", longDescription: "old text" }], [{ id: "alpha", long_description: "updated text" }], []);
  assert.equal(merged.allTools[0].longDescription, "updated text");
});
ok("tool override DB mapper converts longDescription to long_description", () => {
  const row = toToolOverrideDbRow({ id: "alpha", longDescription: "Long text", name: "Alpha" }, "user-1", "2026-10-20T00:00:00.000Z");
  assert.equal(row.long_description, "Long text");
  assert.equal(Object.hasOwn(row, "longDescription"), false);
});

/* ---------------- import validation ---------------- */
ok("import rejects non-object payload", () => assert.equal(validateRegistryImport("nope", baseTools).ok, false));
ok("import rejects duplicate ids", () => {
  const result = validateRegistryImport({ tools: [{ id: "alpha", name: "One tool" }, { id: "alpha", name: "Two tool" }] }, baseTools);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("duplicate id")));
});
ok("import rejects unregistered ids", () => {
  assert.equal(validateRegistryImport({ tools: [{ id: "ghost", name: "Ghost tool" }] }, baseTools).ok, false);
});
ok("import rejects duplicate slugs", () => {
  const result = validateRegistryImport({ tools: [
    { id: "alpha", name: "Alpha tool", slug: "shared-slug" },
    { id: "beta", name: "Beta tool", slug: "shared-slug" },
  ] }, baseTools);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("already used")));
});
ok("import accepts valid entries", () => {
  const result = validateRegistryImport({ tools: [{ id: "alpha", name: "Alpha renamed", description: "A longer description.", order: 1 }] }, baseTools);
  assert.equal(result.ok, true);
  assert.equal(result.value.tools.length, 1);
  assert.deepEqual(result.value.categories, []);
});
ok("registry import validates and returns category overrides", () => {
  const result = validateRegistryImport({ tools: [], categories: [{ id: "development", name: "Developer Tools", order: 2 }] }, baseTools, [{ id: "development" }]);
  assert.equal(result.ok, true);
  assert.equal(result.value.categories.length, 1);
  assert.equal(result.value.categories[0].name, "Developer Tools");
});
ok("registry import rejects unregistered category overrides", () => {
  assert.equal(validateRegistryImport({ tools: [], categories: [{ id: "not-in-build", name: "New category" }] }, baseTools, [{ id: "development" }]).ok, false);
});
ok("registry import accepts exported snake_case long descriptions", () => {
  const result = validateRegistryImport({ tools: [{ id: "alpha", long_description: "Imported long description." }] }, baseTools);
  assert.equal(result.ok, true);
  assert.equal(result.value.tools[0].longDescription, "Imported long description.");
});
ok("import caps payload size", () => {
  const many = Array.from({ length: 501 }, (_, i) => ({ id: baseTools[i % 3].id }));
  assert.equal(validateRegistryImport({ tools: many }, baseTools).ok, false);
});

/* ---------------- persistence sanitisation ---------------- */
ok("sensitive preset keys stripped", () => {
  const clean = safeConfig({ theme: "dark", apiKey: "sk-live-123", password: "hunter2", jwt: "eyJ...", order: 5 });
  assert.deepEqual(Object.keys(clean).sort(), ["order", "theme"]);
});
ok("oversized values dropped", () => {
  assert.deepEqual(safeConfig({ blob: "x".repeat(5000) }), {});
});
ok("non-primitive values dropped", () => {
  assert.deepEqual(safeConfig({ nested: { a: 1 }, list: [1, 2] }), {});
});
ok("connection strings treated as sensitive", () => {
  assert.deepEqual(safeConfig({ databaseConnectionString: "postgres://u:p@h/db" }), {});
});
ok("workflow steps sanitised and capped", () => {
  const steps = safeSteps(Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, operationId: `op${i}`, label: "L", config: { token: "secret" } })));
  assert.equal(steps.length, 30);
  assert.deepEqual(steps[0].config, {});
});
ok("steps without an operation are dropped", () => {
  assert.deepEqual(safeSteps([{ id: "x", label: "no op" }]), []);
});

/* ---------------- analytics allowlist ---------------- */
ok("allowlisted event accepted", () => {
  const event = sanitizeAnalyticsEvent({ name: "tool_opened", toolId: "json", categoryId: "development" });
  assert.equal(event.event_name, "tool_opened");
  assert.equal(event.tool_id, "json");
});
ok("unknown event rejected", () => assert.equal(sanitizeAnalyticsEvent({ name: "arbitrary_event" }), null));
ok("free-form payload fields dropped", () => {
  const event = sanitizeAnalyticsEvent({ name: "tool_completed", toolId: "json", payload: '{"secret":1}', inputValue: "paste" });
  assert.equal(event.payload, undefined);
  assert.equal(event.inputValue, undefined);
  assert.deepEqual(Object.keys(event).sort(), ["category_id", "event_name", "outcome", "tool_id"]);
});
ok("invalid outcome dropped", () => assert.equal(sanitizeAnalyticsEvent({ name: "auth_failure", outcome: "maybe" }).outcome, null));
ok("overlong identifiers truncated", () => assert.equal(sanitizeAnalyticsEvent({ name: "tool_opened", toolId: "x".repeat(500) }).tool_id.length, 64));
ok("allowlist matches documented events", () => assert.equal(ANALYTICS_EVENTS.includes("tool_downloaded"), true));

/* ---------------- administrator authorization record ---------------- */
ok("active administrator record accepted", () => assert.equal(isActiveAdminRecord({ role: "admin", revoked_at: null }), true));
ok("revoked administrator record rejected", () => assert.equal(isActiveAdminRecord({ role: "admin", revoked_at: "2026-10-19T12:00:00.000Z" }), false));
ok("non-admin role rejected", () => assert.equal(isActiveAdminRecord({ role: "moderator", revoked_at: null }), false));
ok("missing administrator record rejected", () => assert.equal(isActiveAdminRecord(null), false));

/* ---------------- error mapping ---------------- */
ok("upstream failures map to 502", () => assert.equal(upstreamStatus(new Error("fetch failed")), 502));
ok("postgres failures map to 502", () => assert.equal(upstreamStatus(new Error('relation "tool_overrides" does not exist')), 502));
ok("other failures map to 500", () => assert.equal(upstreamStatus(new Error("unexpected")), 500));

/* ---------------- token expiry ---------------- */
ok("JWT expiry decoded for display", () => {
  const body = Buffer.from(JSON.stringify({ exp: 1700000000 })).toString("base64url");
  assert.equal(tokenExpiry(`h.${body}.s`), new Date(1700000000 * 1000).toISOString());
});
ok("malformed token returns null", () => assert.equal(tokenExpiry("garbage"), null));

/* ---------------- Phase 5: pinned tools + collections ---------------- */
ok("pinned ids are trimmed, deduped, and capped", () => assert.deepEqual(safePinnedToolIds([" a ", "a", "b", "", null, "c"]), ["a", "b", "c"]));
ok("pinned ids capped at 50", () => assert.equal(safePinnedToolIds(Array.from({ length: 80 }, (_, i) => `t${i}`)).length, 50));
ok("non-array pinned input rejected", () => assert.deepEqual(safePinnedToolIds("json"), []));
ok("collection create requires a name", () => {
  const result = validateCollectionInput({}, { existingNames: [] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("required")));
});
ok("collection create rejects duplicate names", () => {
  const result = validateCollectionInput({ name: "Ops" }, { existingNames: ["Ops"] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("already exists")));
});
ok("collection update may keep its own name", () => assert.equal(validateCollectionInput({ name: "Ops" }, { existingNames: [], requireName: false }).ok, true));
ok("collection update rejects a taken name", () => assert.equal(validateCollectionInput({ name: "Ops" }, { existingNames: ["Ops"], requireName: false }).ok, false));
ok("collection description truncated to 200 characters", () => {
  const result = validateCollectionInput({ name: "Ops", description: "x".repeat(400) }, { existingNames: [] });
  assert.equal(result.ok, true);
  assert.equal(result.value.description.length, 200);
});
ok("valid collection item accepted", () => assert.deepEqual(safeCollectionItemInput({ kind: "tool", targetId: " json " }), { kind: "tool", targetId: "json" }));
ok("invalid collection item kind rejected", () => assert.equal(safeCollectionItemInput({ kind: "widget", targetId: "json" }), null));
ok("collection item without target rejected", () => assert.equal(safeCollectionItemInput({ kind: "tool", targetId: "" }), null));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
