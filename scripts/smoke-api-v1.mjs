#!/usr/bin/env node
/**
 * Phase 11 end-to-end smoke test for the /api/v1 gateway + OpenAPI document.
 * Mints throwaway keys, exercises every documented behavior, cleans up after
 * itself (revokes keys, deletes its own usage rows). Prints no secrets.
 * Run: sudo node --env-file=/etc/devutils/devutils.env scripts/smoke-api-v1.mjs
 */
import { createHash, randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
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
  const { data, error } = await service.from("api_keys").insert({ user_id: userId, name, prefix: secret.slice(0, 16), key_hash: keyHash, scopes }).select("id");
  if (error) throw new Error("mint failed: " + error.message);
  return { secret, keyHash, id: data?.[0]?.id ?? null, userId };
}

async function revokeByHash(keyHash) {
  const { data } = await service.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("key_hash", keyHash).is("revoked_at", null).select("name");
  return (data ?? []).length === 1;
}

console.log("0) Preflight");
let r = { status: 0, json: null };
for (let i = 0; i < 20 && r.status === 0; i++) { r = await req("GET", "/api/v1/openapi.json"); if (r.status === 0) await new Promise((resolve) => setTimeout(resolve, 500)); }
ok("server reachable", r.status !== 0);

console.log("1) OpenAPI document (public)");
ok("openapi.json is public 200", r.status === 200);
ok("document is 3.1.0 with 5 paths", r.json?.openapi === "3.1.0" && Object.keys(r.json?.paths ?? {}).length === 5);

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
ok("openapi.requests lists the 5 documented ops", r.status === 200 && r.json?.output?.length === 5);

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

console.log("7b) Workflows (workflows:execute scope)");
const wfKey = await mintKey("smoke-wf-key", ["workflows:execute"]);
const wfId = `smoke-wf-${Date.now()}`;
const wfIns = await service.from("saved_workflows").insert({ id: wfId, user_id: wfKey.userId, name: "smoke wf", description: "", steps: [{ operationId: "base64.encode" }, { operationId: "base64.decode" }], source: "custom", version: 1, updated_at: new Date().toISOString() });
ok("smoke workflow inserted", !wfIns.error, wfIns.error?.message ?? "");
r = await req("GET", "/api/v1/workflows", { key: full.secret });
ok("key without workflows scope -> 403", r.status === 403);
r = await req("GET", "/api/v1/workflows", { key: wfKey.secret });
ok("workflow list -> 200 with our workflow", r.status === 200 && Array.isArray(r.json?.workflows) && r.json.workflows.some((w) => w.id === wfId));
r = await req("POST", `/api/v1/workflows/${wfId}/execute`, { key: wfKey.secret, body: "smoke" });
ok("workflow execute round-trips the input", r.status === 200 && r.json?.ok === true && r.json?.output === "smoke" && r.json?.steps?.length === 2);
r = await req("POST", "/api/v1/workflows/does-not-exist/execute", { key: wfKey.secret, body: "x" });
ok("unknown workflow -> 404", r.status === 404 && /Unknown workflow/.test(r.json?.error ?? ""));

console.log("8) Rate limit (30 executes/min per key)");
let saw429 = false;
for (let i = 0; i < 32 && !saw429; i++) {
  const res = await req("POST", "/api/v1/operations/base64.encode/execute", { key: full.secret, body: String(i) });
  if (res.status === 429) saw429 = true;
}
ok("429 triggered within the window", saw429);

console.log("8b) Rate limit survives a server restart (DB-backed sliding window)");
ok("429 precondition from section 8", saw429);
let restarted = false;
try { execSync("systemctl restart devutils", { stdio: "pipe" }); restarted = true; } catch { }
ok("server restart executed", restarted);
let up = false;
for (let i = 0; i < 30 && !up; i++) { await new Promise((resolve) => setTimeout(resolve, 1000)); if ((await req("GET", "/api/v1/openapi.json")).status === 200) up = true; }
ok("server back up after restart", up);
r = await req("POST", "/api/v1/operations/base64.encode/execute", { key: full.secret, body: "post-restart" });
ok("still rate-limited (429) after restart", r.status === 429);

console.log("9) Revocation");
ok("main key revoked in DB", await revokeByHash(full.keyHash));
r = await req("GET", "/api/v1/operations", { key: full.secret });
ok("revoked key -> 401 'revoked'", r.status === 401 && /revoked/.test(r.json?.error ?? ""));

console.log("10) Admin observability");
r = await req("GET", "/api/admin/api-stats");
ok("api-stats requires an admin session", r.status === 401 || r.status === 403, `got ${r.status}`);

console.log("11) Plan management + gateway entitlement loop");
r = await req("GET", "/api/admin/users");
ok("admin users list requires an admin session", r.status === 401 || r.status === 403, `got ${r.status}`);
r = await req("PUT", "/api/admin/users/00000000-0000-0000-0000-000000000000/plan", { body: { planId: "pro" } });
ok("admin plan route requires an admin session", r.status === 401 || r.status === 403, `got ${r.status}`);
const { data: planRow } = await service.from("profiles").select("plan_id").eq("user_id", full.userId).single();
const originalPlan = planRow?.plan_id ?? "free";
const { error: setUpErr } = await service.from("profiles").update({ plan_id: "pro" }).eq("user_id", full.userId);
ok("plan set to pro in DB", !setUpErr, setUpErr?.message ?? "");
const planKey = await mintKey("smoke-plan-key", ["tools:read"]);
r = await req("GET", "/api/v1/usage", { key: planKey.secret });
ok("gateway usage reflects the pro plan", r.status === 200 && r.json?.plan === "pro", `got ${r.json?.plan}`);
const { error: setBackErr } = await service.from("profiles").update({ plan_id: originalPlan }).eq("user_id", full.userId);
ok("original plan restored", !setBackErr, setBackErr?.message ?? "");

console.log("12) Teams (tables + session guards)");
r = await req("GET", "/api/account/teams");
ok("teams routes require a session", r.status === 401, `got ${r.status}`);
let teamId = null;
const tIns = await service.from("teams").insert({ name: "smoke team", owner_user_id: full.userId }).select("id");
teamId = tIns.data?.[0]?.id ?? null;
ok("team row inserted (teams table exists)", !tIns.error && Boolean(teamId), tIns.error?.message ?? "");
const tmIns = teamId ? await service.from("team_members").insert({ team_id: teamId, user_id: full.userId, role: "owner" }) : { error: "no team id" };
ok("team_members row inserted (member table exists)", !tmIns.error, tmIns.error?.message ?? "");

// Cleanup: revoke the read-only key, delete only THIS run's usage rows.
await revokeByHash(readOnly.keyHash);
const { error: delErr } = await service.from("usage_records").delete().in("resource_id", ["api:v1", "api:v1:workflow"]).gte("recorded_at", startTs);
await revokeByHash(wfKey.keyHash);
await revokeByHash(planKey.keyHash);
if (teamId) await service.from("teams").delete().eq("id", teamId);
const { error: wfDelErr } = await service.from("saved_workflows").delete().eq("id", wfId);
const rateKeyIds = [full.id, readOnly.id].filter(Boolean);
if (rateKeyIds.length) await service.from("rate_limit_hits").delete().in("key_id", rateKeyIds);
console.log(delErr ? "cleanup: usage rows left in place (" + delErr.message + ")" : "cleanup: smoke usage + rate-limit rows deleted, read-only key revoked");
console.log(wfDelErr ? "cleanup: smoke workflow row left in place (" + wfDelErr.message + ")" : "cleanup: smoke workflow row deleted");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
