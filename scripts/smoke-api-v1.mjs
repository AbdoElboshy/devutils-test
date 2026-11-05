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

/* Session helpers: cookie jar + CSRF double-submit, mirroring the browser. */
function jarCookie(jar) {
  return Object.entries(jar).map(([name, value]) => `${name}=${value}`).join("; ");
}
function absorbCookies(jar, res) {
  const lines = typeof res.headers?.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const line of lines) {
    const pair = line.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1);
  }
}
async function sreq(method, path, { jar, origin: originHeader, csrf, body } = {}) {
  try {
    const headers = {};
    const cookie = jarCookie(jar);
    if (cookie) headers.Cookie = cookie;
    if (originHeader) headers.Origin = originHeader;
    if (csrf) headers["x-csrf-token"] = csrf;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    absorbCookies(jar, res);
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, headers: res.headers, json };
  } catch { return { status: 0, headers: null, json: null }; }
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

console.log("13) Session + CSRF (real login through the app's own routes)");
const jar = {};
const origin = new URL(BASE).origin;
const stamp = startTs.replace(/[^0-9]/g, "");
let r2 = await sreq("GET", "/api/auth/csrf", { jar });
ok("csrf token minted (double-submit pair)", r2.status === 200 && typeof r2.json?.token === "string" && Boolean(jar.du_csrf));
const csrf = r2.json?.token ?? "";
const smokeEmail = `smoke-${stamp}@example.invalid`;
const memberEmail = `smoke-m-${stamp}@example.invalid`;
const smokePassword = "du_smoke_" + randomBytes(18).toString("base64url");
const mkMain = await service.auth.admin.createUser({ email: smokeEmail, password: smokePassword, email_confirm: true });
const mkMember = await service.auth.admin.createUser({ email: memberEmail, password: smokePassword, email_confirm: true });
const smokeUserId = mkMain.data?.user?.id ?? null;
const memberId = mkMember.data?.user?.id ?? null;
ok("throwaway owner + member users created (auth admin API)", Boolean(smokeUserId && memberId), mkMain.error?.message ?? mkMember.error?.message ?? "");
const { error: profOwnerErr } = await service.from("profiles").upsert({ user_id: smokeUserId, plan_id: "team" }, { onConflict: "user_id" });
const { error: profMemberErr } = await service.from("profiles").upsert({ user_id: memberId }, { onConflict: "user_id" });
ok("profiles rows ready (owner on the team plan)", !profOwnerErr && !profMemberErr, profOwnerErr?.message ?? profMemberErr?.message ?? "");
r2 = await sreq("POST", "/api/auth/login", { jar, origin, csrf, body: { email: smokeEmail, password: smokePassword } });
ok("login -> 200 and session cookies set", r2.status === 200 && Boolean(jar.du_access), `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("GET", "/api/auth/me", { jar });
ok("session is live: /api/auth/me returns the throwaway user", r2.status === 200 && r2.json?.user?.id === smokeUserId);

console.log("14) Teams flows (session-authed: plan gate + role rules)");
r2 = await sreq("GET", "/api/account/teams", { jar });
ok("teams list with session -> 200, empty", r2.status === 200 && r2.json?.teams?.length === 0, `got ${r2.status}`);
r2 = await sreq("POST", "/api/account/teams", { jar, origin, csrf, body: { name: "Smoke Team" } });
const liveTeamId = r2.json?.team?.id ?? null;
ok("team created on the team plan -> 200", r2.status === 200 && Boolean(liveTeamId), `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("GET", "/api/account/teams", { jar });
const listed = (r2.json?.teams ?? []).find((t) => t.id === liveTeamId);
ok("team listed with owner role and memberCount 1", listed?.role === "owner" && listed?.memberCount === 1);
r2 = await sreq("POST", `/api/account/teams/${liveTeamId}/members`, { jar, origin, csrf, body: { userId: memberId } });
ok("member added by user id -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("DELETE", `/api/account/teams/${liveTeamId}/members/${smokeUserId}`, { jar, origin, csrf });
ok("last owner cannot leave their team -> 400", r2.status === 400, `got ${r2.status}`);
r2 = await sreq("DELETE", `/api/account/teams/${liveTeamId}/members/${memberId}`, { jar, origin, csrf });
ok("owner removes the member -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
const { error: downgradeErr } = await service.from("profiles").update({ plan_id: "free" }).eq("user_id", smokeUserId);
r2 = await sreq("POST", "/api/account/teams", { jar, origin, csrf, body: { name: "Blocked Team" } });
ok("free plan cannot create teams -> 403", !downgradeErr && r2.status === 403, `got ${r2.status}`);

console.log("15) Admin session flows (real admin grant -> admin routes + audit)");
const { error: admErr } = await service.from("admin_users").insert({ user_id: smokeUserId, role: "admin" });
ok("admin role granted to the throwaway user", !admErr, admErr?.message ?? "");
r2 = await sreq("GET", "/api/admin/users", { jar });
ok("admin users list -> 200 and contains our user", r2.status === 200 && JSON.stringify(r2.json ?? {}).includes(smokeUserId), `got ${r2.status}`);
ok("admin users list includes planId", r2.status === 200 && Array.isArray(r2.json?.users) && r2.json.users.every((row) => typeof row.planId === "string"), "planId missing from user rows");
r2 = await sreq("PUT", `/api/admin/users/${smokeUserId}/plan`, { jar, origin, csrf, body: { planId: "pro" } });
ok("admin plan change -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
const { data: planCheck } = await service.from("profiles").select("plan_id").eq("user_id", smokeUserId).single();
ok("plan really changed to pro in the DB", planCheck?.plan_id === "pro", `got ${planCheck?.plan_id}`);
const { data: auditRows } = await service.from("audit_logs").select("id").eq("user_id", smokeUserId).eq("action", "plan_changed").limit(1);
ok("plan_changed audit row recorded (p12 constraint live)", (auditRows ?? []).length === 1);
r2 = await sreq("GET", "/api/admin/api-stats", { jar });
ok("api-stats -> 200 for an admin session", r2.status === 200, `got ${r2.status}`);

console.log("16) Team-scoped workflows (share, read, permissions, copy)");
const { error: planTeamErr } = await service.from("profiles").update({ plan_id: "team" }).eq("user_id", smokeUserId);
r2 = await sreq("GET", "/api/account/teams", { jar });
const tId = (r2.json?.teams ?? []).find((t) => t.id === liveTeamId)?.id ?? null;
ok("team still listed after plan churn", !planTeamErr && Boolean(tId));
const shareWfId = `smoke-team-wf-${stamp}`;
r2 = await sreq("PUT", `/api/account/teams/${tId}/workflows/${shareWfId}`, { jar, origin, csrf, body: { name: "Shared smoke wf", description: "", steps: [{ operationId: "base64.encode" }, { operationId: "base64.decode" }] } });
ok("owner shares a workflow to the team -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("GET", `/api/account/teams/${tId}/workflows`, { jar });
const sharedWf = (r2.json?.workflows ?? []).find((w) => w.id === shareWfId);
ok("shared workflow listed with 2 steps", r2.status === 200 && sharedWf?.steps?.length === 2);
r2 = await sreq("POST", `/api/account/teams/${tId}/members`, { jar, origin, csrf, body: { userId: memberId } });
ok("member re-added for sharing", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
const mJar = {};
r2 = await sreq("GET", "/api/auth/csrf", { jar: mJar });
const mCsrf = r2.json?.token ?? "";
r2 = await sreq("POST", "/api/auth/login", { jar: mJar, origin, csrf: mCsrf, body: { email: memberEmail, password: smokePassword } });
ok("member logs in through the app", r2.status === 200 && Boolean(mJar.du_access));
r2 = await sreq("GET", `/api/account/teams/${tId}/workflows`, { jar: mJar });
ok("member reads team workflows", r2.status === 200 && (r2.json?.workflows ?? []).some((w) => w.id === shareWfId));
r2 = await sreq("PUT", `/api/account/teams/${tId}/workflows/member-edit`, { jar: mJar, origin, csrf: mCsrf, body: { name: "nope", steps: [{ operationId: "base64.encode" }] } });
ok("member cannot manage shared workflows -> 403", r2.status === 403);
r2 = await sreq("PUT", `/api/account/workflows/${shareWfId}`, { jar: mJar, origin, csrf: mCsrf, body: { name: "Copied from team", description: "", steps: sharedWf?.steps ?? [] } });
ok("member copies the shared workflow to personal -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("GET", "/api/account/workflows", { jar: mJar });
ok("member's personal copy is listed", (r2.json ?? []).some((w) => w?.id === shareWfId));
r2 = await sreq("DELETE", `/api/account/teams/${tId}/workflows/${shareWfId}`, { jar, origin, csrf });
ok("owner deletes the shared workflow -> 200", r2.status === 200, `got ${r2.status}`);
r2 = await sreq("GET", `/api/account/teams/${tId}/workflows`, { jar });
ok("shared workflow no longer listed", !(r2.json?.workflows ?? []).some((w) => w.id === shareWfId));

console.log("17) Team workflow run (p14: native execution + member attribution)");
const runWfId = `smoke-team-wf-run-${stamp}`;
r2 = await sreq("PUT", `/api/account/teams/${tId}/workflows/${runWfId}`, { jar, origin, csrf, body: { name: "Runnable smoke wf", description: "", steps: [{ operationId: "base64.encode" }, { operationId: "base64.decode" }] } });
ok("owner shares a runnable workflow -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("POST", `/api/account/teams/${tId}/workflows/${runWfId}/run`, { jar, origin, csrf, body: { input: "team-native" } });
ok("owner runs it natively -> 200, input round-trips through 2 steps", r2.status === 200 && r2.json?.ok === true && r2.json?.output === "team-native" && r2.json?.steps?.length === 2, `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("POST", `/api/account/teams/${tId}/workflows/${runWfId}/run`, { jar: mJar, origin, csrf: mCsrf, body: { input: "from-member" } });
ok("member session runs it too -> 200", r2.status === 200 && r2.json?.output === "from-member", `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("POST", `/api/account/teams/${tId}/workflows/${runWfId}/run`, { jar: {}, body: { input: "x" } });
ok("run requires a session -> 401 or 403 (guard)", r2.status === 401 || r2.status === 403, `got ${r2.status}`);
const { data: runUsage } = await service.from("usage_records").select("metric, resource_id").eq("user_id", memberId).eq("metric", "workflow_runs").gte("recorded_at", startTs);
ok("run usage attributed to the clicking member (workflow_runs row)", (runUsage ?? []).some((row) => (row.resource_id ?? "") === `team-workflow:${runWfId}`));
const { data: runAudit } = await service.from("audit_logs").select("action").eq("user_id", memberId).eq("action", "team_workflow_run").gte("created_at", startTs);
ok("team_workflow_run audit row recorded for the member", (runAudit ?? []).length >= 1);
r2 = await sreq("DELETE", `/api/account/teams/${tId}/workflows/${runWfId}`, { jar, origin, csrf });
ok("owner removes the runnable shared workflow -> 200", r2.status === 200, `got ${r2.status}`);

console.log("18) Team collections (p16: shared collections, permissions, copy)");
const colId = `smoke-team-col-${stamp}`;
r2 = await sreq("PUT", `/api/account/teams/${tId}/collections/${colId}`, { jar, origin, csrf, body: { name: "Team smoke collection", description: "shared tools" } });
ok("owner creates a shared collection -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
const { data: colRow } = await service.from("team_collections").select("team_id,name").eq("team_id", tId).eq("id", colId).maybeSingle();
ok("collection row exists and is team-scoped", colRow?.name === "Team smoke collection", `got ${JSON.stringify(colRow)}`);
r2 = await sreq("POST", `/api/account/teams/${tId}/collections/${colId}/items`, { jar, origin, csrf, body: { kind: "tool", targetId: "base64.encode" } });
ok("owner adds an item -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("GET", `/api/account/teams/${tId}/collections/${colId}/items`, { jar, origin, csrf });
ok("item listed for the owner", (r2.json?.items ?? []).some((it) => it.kind === "tool" && it.target_id === "base64.encode"), `got ${r2.status}`);
r2 = await sreq("GET", `/api/account/teams/${tId}/collections`, { jar: mJar, origin, csrf: mCsrf });
ok("member reads team collections -> 200", r2.status === 200 && (r2.json?.collections ?? []).some((c) => c.id === colId), `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("PUT", `/api/account/teams/${tId}/collections/${colId}`, { jar: mJar, origin, csrf: mCsrf, body: { name: "member takeover" } });
ok("member cannot manage shared collections -> 403", r2.status === 403, `got ${r2.status}`);
r2 = await sreq("POST", `/api/account/teams/${tId}/collections/${colId}/copy`, { jar: mJar, origin, csrf: mCsrf });
ok("member copies the collection to personal -> 200", r2.status === 200 && r2.json?.ok === true, `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("GET", "/api/account/collections", { jar: mJar, origin, csrf: mCsrf });
const memberCol = Array.isArray(r2.json) ? r2.json.find((c) => c.name === "Team smoke collection (team copy)") : null;
ok("member's personal copy is listed", Boolean(memberCol), `got ${r2.status}`);
let memberItemsOk = false;
if (memberCol) {
  const { data: memberItems } = await service.from("collection_items").select("kind,target_id").eq("collection_id", memberCol.id);
  memberItemsOk = (memberItems ?? []).some((it) => it.target_id === "base64.encode");
}
ok("member's personal copy carries the item", memberItemsOk, "copy item missing");
const { data: colAudit } = await service.from("audit_logs").select("action").eq("user_id", smokeUserId).eq("action", "team_collection_saved").gte("created_at", startTs);
ok("team_collection_saved audit row recorded", (colAudit ?? []).length >= 1);
r2 = await sreq("DELETE", `/api/account/teams/${tId}/collections/${colId}/items/base64.encode`, { jar, origin, csrf });
ok("owner removes the item -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("GET", `/api/account/teams/${tId}/collections/${colId}/items`, { jar, origin, csrf });
ok("item no longer listed", !(r2.json?.items ?? []).some((it) => it.target_id === "base64.encode"), `got ${r2.status}`);
r2 = await sreq("DELETE", `/api/account/teams/${tId}/collections/${colId}`, { jar, origin, csrf });
ok("owner deletes the shared collection -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("GET", `/api/account/teams/${tId}/collections`, { jar, origin, csrf });
ok("shared collection no longer listed", !(r2.json?.collections ?? []).some((c) => c.id === colId), `got ${r2.status}`);

console.log("19) Invitations, ownership transfer, offboarding (p17)");
r2 = await sreq("POST", `/api/account/teams/${tId}/invitations`, { jar, origin, csrf, body: { email: "ghost-smoke@example.invalid", role: "member" } });
ok("owner can invite an email without an account -> 200", r2.status === 200 && Boolean(r2.json?.token), `got ${r2.status} ${r2.json?.error ?? ""}`);
const ghostInviteId = r2.json?.id ?? null;
r2 = await sreq("POST", `/api/account/teams/${tId}/invitations`, { jar, origin, csrf, body: { email: "ghost-smoke@example.invalid", role: "member" } });
ok("duplicate pending invite -> 409", r2.status === 409, `got ${r2.status} ${r2.json?.error ?? ""}`);
let ghostHashOk = false;
if (ghostInviteId) { const { data: gRow } = await service.from("team_invitations").select("token_hash,revoked_at,accepted_at").eq("id", ghostInviteId).maybeSingle(); ghostHashOk = Boolean(gRow?.token_hash) && gRow?.token_hash?.length === 64 && !gRow?.revoked_at && !gRow?.accepted_at; }
ok("invitation row stored with a 64-char token hash", ghostHashOk);
r2 = await sreq("POST", `/api/account/teams/${tId}/invitations`, { jar: mJar, origin, csrf: mCsrf, body: { email: "x@example.invalid", role: "member" } });
ok("plain member cannot invite -> 403", r2.status === 403, `got ${r2.status}`);
r2 = await sreq("POST", `/api/account/teams/${tId}/invitations`, { jar, origin, csrf, body: { email: memberEmail, role: "member" } });
ok("owner invites the member's email -> 200", r2.status === 200 && Boolean(r2.json?.token), `got ${r2.status} ${r2.json?.error ?? ""}`);
const inviteToken = r2.json?.token ?? "";
r2 = await sreq("POST", `/api/account/invitations/${encodeURIComponent(inviteToken)}/accept`, { jar: mJar, origin, csrf: mCsrf });
ok("member cannot accept while already a member -> 400", r2.status === 400, `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("DELETE", `/api/account/teams/${tId}/members/${memberId}`, { jar, origin, csrf });
ok("owner removes the member -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("GET", "/api/account/invitations", { jar: mJar, origin, csrf: mCsrf });
ok("pending invitation is visible to the invited user", r2.status === 200 && (r2.json?.invitations ?? []).some((iv) => iv.teamId === tId), `got ${r2.status} ${JSON.stringify(r2.json?.invitations ?? [])}`);
r2 = await sreq("POST", `/api/account/invitations/${encodeURIComponent(inviteToken)}/accept`, { jar: mJar, origin, csrf: mCsrf });
ok("member accepts the invitation -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
const { data: rejoined } = await service.from("team_members").select("role").eq("team_id", tId).eq("user_id", memberId).maybeSingle();
ok("member row restored with the invited role", rejoined?.role === "member", `got ${JSON.stringify(rejoined)}`);
r2 = await sreq("POST", `/api/account/invitations/${encodeURIComponent(inviteToken)}/accept`, { jar: mJar, origin, csrf: mCsrf });
ok("invitation token is single-use -> 400", r2.status === 400, `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("POST", `/api/account/invitations/${encodeURIComponent(ghostInviteId ?? "")}/accept`, { jar, origin, csrf });
ok("another user cannot accept someone else's invitation -> 403", r2.status === 403, `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("POST", `/api/account/teams/${tId}/invitations`, { jar, origin, csrf, body: { email: memberEmail, role: "member" } });
ok("owner creates a second invitation -> 200", r2.status === 200 && Boolean(r2.json?.token), `got ${r2.status}`);
const invite2Token = r2.json?.token ?? "";
const invite2Id = r2.json?.id ?? null;
r2 = await sreq("DELETE", `/api/account/teams/${tId}/invitations/${invite2Id}`, { jar, origin, csrf });
ok("owner revokes the invitation -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
let revokedOk = false;
if (invite2Id) { const { data: rvRow } = await service.from("team_invitations").select("revoked_at").eq("id", invite2Id).maybeSingle(); revokedOk = Boolean(rvRow?.revoked_at); }
ok("revoked_at set in the DB", revokedOk);
r2 = await sreq("POST", `/api/account/invitations/${encodeURIComponent(invite2Token)}/accept`, { jar: mJar, origin, csrf: mCsrf });
ok("member cannot accept the revoked invitation -> 410", r2.status === 410, `got ${r2.status} ${r2.json?.error ?? ""}`);
r2 = await sreq("POST", `/api/account/teams/${tId}/owner`, { jar: mJar, origin, csrf: mCsrf, body: { userId: memberId } });
ok("non-owner cannot transfer ownership -> 403", r2.status === 403, `got ${r2.status}`);
r2 = await sreq("POST", `/api/account/teams/${tId}/owner`, { jar, origin, csrf, body: { userId: memberId } });
ok("owner transfers ownership -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
const { data: teamAfter } = await service.from("teams").select("owner_user_id").eq("id", tId).maybeSingle();
const { data: rolesAfter } = await service.from("team_members").select("user_id,role").eq("team_id", tId);
const roleOf = (uid) => (rolesAfter ?? []).find((row) => row.user_id === uid)?.role;
ok("ownership recorded: teams.owner_user_id swapped + roles exchanged", teamAfter?.owner_user_id === memberId && roleOf(memberId) === "owner" && roleOf(smokeUserId) === "admin", `owner=${teamAfter?.owner_user_id} old=${roleOf(smokeUserId)} new=${roleOf(memberId)}`);
r2 = await sreq("POST", `/api/account/teams/${tId}/owner`, { jar, origin, csrf, body: { userId: smokeUserId } });
ok("previous owner (now admin) cannot transfer -> 403", r2.status === 403, `got ${r2.status}`);
const { data: invAudit } = await service.from("audit_logs").select("action,user_id").eq("action", "team_invitation_accepted").eq("user_id", memberId).gte("created_at", startTs);
const { data: ownAudit } = await service.from("audit_logs").select("action").eq("action", "team_ownership_transferred").eq("user_id", smokeUserId).gte("created_at", startTs);
ok("team_invitation_accepted + team_ownership_transferred audit rows recorded", (invAudit ?? []).length >= 1 && (ownAudit ?? []).length >= 1);
r2 = await sreq("DELETE", `/api/account/teams/${tId}/members/${smokeUserId}`, { jar: mJar, origin, csrf: mCsrf });
ok("new owner removes the previous owner (offboarding) -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
const { count: oldOwnerRows } = await service.from("team_members").select("user_id", { count: "exact", head: true }).eq("team_id", tId).eq("user_id", smokeUserId);
ok("previous owner no longer in team_members", (oldOwnerRows ?? 0) === 0, `got ${oldOwnerRows}`);

console.log("20) Billing ledger (p18)");
r2 = await sreq("GET", "/api/account/billing", { jar: {} });
ok("billing summary requires a session -> 401", r2.status === 401, `got ${r2.status}`);
r2 = await sreq("GET", "/api/account/billing", { jar, origin, csrf });
ok("billing summary -> 200 with plan, limit, events", r2.status === 200 && r2.json?.planId && typeof r2.json?.monthlyLimit === "number" && Array.isArray(r2.json?.events), `got ${r2.status}`);
r2 = await sreq("PUT", `/api/admin/users/${smokeUserId}/plan`, { jar, origin, csrf, body: { planId: "pro" } });
ok("admin changes plan to pro -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
let beOk = false;
const { data: be } = await service.from("billing_events").select("old_plan_id,new_plan_id,source").eq("user_id", smokeUserId).order("created_at", { ascending: false }).limit(1);
if (be?.length) beOk = be[0].new_plan_id === "pro" && be[0].source === "admin";
ok("billing_events row recorded with source admin", beOk, `got ${JSON.stringify(be ?? [])}`);
r2 = await sreq("GET", "/api/account/billing", { jar, origin, csrf });
ok("billing history lists the change", r2.status === 200 && (r2.json?.events ?? []).some((e) => e.new_plan_id === "pro"), `got ${r2.status}`);
r2 = await sreq("PUT", `/api/admin/users/${smokeUserId}/plan`, { jar, origin, csrf, body: { planId: "team" } });
ok("admin restores the plan -> 200", r2.status === 200, `got ${r2.status} ${r2.json?.error ?? ""}`);
const { data: be2 } = await service.from("billing_events").select("old_plan_id,new_plan_id").eq("user_id", smokeUserId).order("created_at", { ascending: false }).limit(1);
ok("second ledger row records the restore", be2?.length === 1 && be2[0].new_plan_id === "team" && be2[0].old_plan_id === "pro", `got ${JSON.stringify(be2 ?? [])}`);

// Cleanup: revoke the read-only key, delete only THIS run's usage rows.
await revokeByHash(readOnly.keyHash);
const { error: delErr } = await service.from("usage_records").delete().in("resource_id", ["api:v1", "api:v1:workflow"]).gte("recorded_at", startTs);
if (smokeUserId || memberId) await service.from("usage_records").delete().in("user_id", [smokeUserId, memberId].filter(Boolean)).gte("recorded_at", startTs);
await revokeByHash(wfKey.keyHash);
await revokeByHash(planKey.keyHash);
if (memberId) await service.from("collections").delete().eq("user_id", memberId);
if (teamId) await service.from("teams").delete().eq("id", teamId);
const { error: wfDelErr } = await service.from("saved_workflows").delete().eq("id", wfId);
const rateKeyIds = [full.id, readOnly.id].filter(Boolean);
if (rateKeyIds.length) await service.from("rate_limit_hits").delete().in("key_id", rateKeyIds);
console.log(delErr ? "cleanup: usage rows left in place (" + delErr.message + ")" : "cleanup: smoke usage + rate-limit rows deleted, read-only key revoked");
console.log(wfDelErr ? "cleanup: smoke workflow row left in place (" + wfDelErr.message + ")" : "cleanup: smoke workflow row deleted");

if (smokeUserId) {
  await service.from("admin_users").delete().eq("user_id", smokeUserId);
  if (liveTeamId) await service.from("teams").delete().eq("id", liveTeamId);
  const { error: delUserErr } = await service.auth.admin.deleteUser(smokeUserId);
  console.log(delUserErr ? "cleanup: throwaway owner left in place (" + delUserErr.message + ")" : "cleanup: throwaway owner user deleted");
}
if (memberId) await service.auth.admin.deleteUser(memberId);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
