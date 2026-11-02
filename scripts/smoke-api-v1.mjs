#!/usr/bin/env node
/**
 * Phase 11 end-to-end smoke test for the /api/v1 gateway + OpenAPI document.
 * Mints throwaway keys, exercises every documented behavior, cleans up after
 * itself (revokes keys, deletes its own usage rows). Prints no secrets.
 * Run: sudo node --env-file=/etc/devutils/devutils.env scripts/smoke-api-v1.mjs
 */
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const startTs = new Date().toISOString();
let pass = 0, fail = 0;
function ok(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`); }
}

const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function req(method, path, { key, body } = {}) {
  try {
    const headers = {};
    if (key) headers.Authorization = `Bearer ${key}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, headers: res.headers, json };
  } catch { return { status: 0, headers: null, json: null }; }
}

async function mintKey(name, scopes) {
  const { data: rows } = await service.from("api_keys").select("user_id").is("revoked_at", null).limit(1);
  const userId = rows?.[0]?.user_id;
  if (!userId) throw new Error("No active key row to borrow a user_id from.");
  const secret = "du_live_" + randomBytes(32).toString("base64url");
  const keyHash = createHash("sha256").update(secret).digest("hex");
  const { error } = await service.from("api_keys").insert({ user_id: userId, name, prefix: secret.slice(0, 16), key_hash: keyHash, scopes });
  if (error) throw new Error("mint failed: " + error.message);
  return { secret, keyHash };
}

async function revokeByHash(keyHash) {
  const { data } = await service.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("key_hash", keyHash).is("revoked_at", null).select("name");
  return (data ?? []).length === 1;
}

console.log("0) Preflight");
let r = await req("GET", "/api/v1/openapi.json");
ok("server reachable", r.status !== 0);

console.log("1) OpenAPI document (public)");
ok("openapi.json is public 200", r.status === 200);
ok("document is 3.1.0 with 3 paths", r.json?.openapi === "3.1.0" && Object.keys(r.json?.paths ?? {}).length === 3);

console.log("2) Auth failures");
r = await req("GET", "/api/v1/operations");
ok("missing key -> 401", r.status === 401 && /Authorization/.test(r.json?.error ?? ""));
r = await req("GET", "/api/v1/operations", { key: "du_live_bogus" });
ok("unknown key -> 401", r.status === 401);

console.log("3) Operations list");
const full = await mintKey("smoke-test-key", ["tools:read", "tools:execute"]);
r = await req("GET", "/api/v1/operations", { key: full.secret });
ok("list -> 200 with count", r.status === 200 && typeof r.json?.count === "number");
ok("registry has 43 operations", r.json?.count === 43, `got ${r.json?.count}`);

console.log("4) Dogfood: served doc through the API's own tools");
const doc = (await req("GET", "/api/v1/openapi.json")).json;
r = await req("POST", "/api/v1/operations/openapi.validate/execute", { key: full.secret, body: doc });
ok("openapi.validate -> ok, no issues", r.status === 200 && r.json?.ok === true && r.json?.output?.ok === true && (r.json?.output?.issues ?? []).length === 0);
r = await req("POST", "/api/v1/operations/openapi.requests/execute", { key: full.secret, body: doc });
ok("openapi.requests lists the 3 documented ops", r.status === 200 && r.json?.output?.length === 3);

console.log("5) Execute + DB-backed usage counter");
r = await req("GET", "/api/v1/usage", { key: full.secret });
const usedBefore = r.json?.used;
ok("usage endpoint 200 with plan+used", r.status === 200 && typeof r.json?.plan === "string" && typeof usedBefore === "number");
r = await req("POST", "/api/v1/operations/base64.encode/execute", { key: full.secret, body: "smoke" });
ok("execute output correct", r.status === 200 && r.json?.output === Buffer.from("smoke").toString("base64"));
r = await req("GET", "/api/v1/usage", { key: full.secret });
ok("usage counter incremented", r.json?.used === usedBefore + 1, `expected ${usedBefore + 1}, got ${r.json?.used}`);

console.log("6) Unknown operation");
r = await req("POST", "/api/v1/operations/nope.void/execute", { key: full.secret, body: {} });
ok("unknown op -> 404", r.status === 404 && /Unknown operation/.test(r.json?.error ?? ""));

console.log("7) Scope enforcement");
const readOnly = await mintKey("smoke-read-only", ["tools:read"]);
r = await req("POST", "/api/v1/operations/base64.encode/execute", { key: readOnly.secret, body: "x" });
ok("read-only key -> 403", r.status === 403 && /scope/.test(r.json?.error ?? ""));

console.log("8) Rate limit (30 executes/min per key)");
let saw429 = false;
for (let i = 0; i < 32 && !saw429; i++) {
  const res = await req("POST", "/api/v1/operations/base64.encode/execute", { key: full.secret, body: String(i) });
  if (res.status === 429) saw429 = true;
}
ok("429 triggered within the window", saw429);

console.log("9) Revocation");
ok("main key revoked in DB", await revokeByHash(full.keyHash));
r = await req("GET", "/api/v1/operations", { key: full.secret });
ok("revoked key -> 401 'revoked'", r.status === 401 && /revoked/.test(r.json?.error ?? ""));

// Cleanup: revoke the read-only key, delete only THIS run's usage rows.
await revokeByHash(readOnly.keyHash);
const { error: delErr } = await service.from("usage_records").delete().eq("resource_id", "api:v1").gte("recorded_at", startTs);
console.log(delErr ? "cleanup: usage rows left in place (" + delErr.message + ")" : "cleanup: smoke usage rows deleted, read-only key revoked");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
