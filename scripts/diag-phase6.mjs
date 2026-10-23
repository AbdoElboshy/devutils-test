import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { findBrokenTools, mergeToolRegistry } from "../server/lib.mjs";

const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });

for (const table of ["profiles","favorites","saved_workflows","saved_presets","usage_records","api_keys","audit_logs","tool_overrides","category_overrides","analytics_events","admin_users","feature_flags","tool_override_versions"]) {
  const r = await service.from(table).select("*", { count: "exact", head: true });
  console.log(`check ${table}:`, r.error ? `FAIL ${r.error.code}` : "ok");
}

const base = JSON.parse(readFileSync(new URL("../registry.generated.json", import.meta.url), "utf8"));
const o = await service.from("tool_overrides").select("*");
const c = await service.from("category_overrides").select("*");
const merged = mergeToolRegistry(base.tools, o.data ?? [], c.data ?? [], { includeUnpublished: true });
console.log("brokenTools:", JSON.stringify(findBrokenTools(merged.allTools, base.tools.map((t) => t.id))));

const target = "884b3f3c-0935-46bc-a34a-01175d712bb9";
const sign = await service.auth.admin.signOut(target);
console.log("admin.signOut(id) ->", sign.error ? `${sign.error.code}: ${sign.error.message}` : "unexpectedly OK");
console.log("SDK has signOutById:", typeof service.auth.admin.signOutById === "function");
const resp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${target}/sign_out`, {
  method: "POST",
  headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
});
console.log("REST sign_out ->", resp.status, (await resp.text()).slice(0, 200));
