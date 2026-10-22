#!/usr/bin/env python3
"""Phase 6 WS C + WS D combined: version history, restore, publish-time
route validation, feature flags (gateway-mediated), health broken-tool scan.
One run, one commit. Requires WS A2/B/E applied and migration
202610220001_admin_roles_flags_history.sql applied.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent

def sub1(text, rel, old, new):
    n = text.count(old)
    if n == 1:
        print(f"  applied: {old.strip().splitlines()[0][:70]!r}")
        return text.replace(old, new, 1)
    if new in text:
        print(f"  already applied: {old.strip().splitlines()[0][:70]!r}")
        return text
    sys.exit(f"ANCHOR NOT FOUND or not unique ({n}x) in {rel}:\n{old[:200]}")

def rw(rel, edits, append_block=None, append_marker=None):
    p = ROOT / rel
    s = p.read_text(encoding="utf-8")
    for old, new in edits:
        s = sub1(s, rel, old, new)
    if append_block is not None:
        if append_marker and append_marker in s:
            print(f"  [{rel}] append block already present")
        else:
            s = s.rstrip("\n") + "\n\n" + append_block.strip("\n") + "\n"
            print(f"  [{rel}] appended block")
    p.write_text(s, encoding="utf-8")

# ---------------- 1. server/lib.mjs: pure helpers (appended) ----------------
LIB_APPEND = """
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
    if (!/^\\/[a-z0-9-]+$/.test(route)) { broken.push({ id: String(tool.id), reason: `route ${route} is not a valid tool route` }); continue; }
    byRoute.set(route, String(tool.id));
  }
  return broken;
}
"""
rw("server/lib.mjs", [], LIB_APPEND, "findBrokenTools")

# ---------------- 2. server/index.mjs ----------------
IDX_EDITS = [
    # imports
    ('  toToolOverrideDbRow,\n} from "./lib.mjs";',
     '  toToolOverrideDbRow,\n  validatePublishableSlug,\n  mergeFeatureFlags,\n  findBrokenTools,\n} from "./lib.mjs";'),
    # runtime-config.js: gateway-mediated flags
    ('''app.get("/runtime-config.js", (_req, res) => {
  res.type("application/javascript").set("Cache-Control", "no-store")
    .send('window.__DEVUTILS_CONFIG__={"authMode":"server","accountsEnabled":true};');
});''',
     '''app.get("/runtime-config.js", async (_req, res) => {
  let flags = {};
  try { flags = await effectiveFlags(); } catch { flags = {}; }
  const payload = { authMode: "server", accountsEnabled: true, flags };
  res.type("application/javascript").set("Cache-Control", "no-store")
    .send(`window.__DEVUTILS_CONFIG__=${JSON.stringify(payload)};`);
});'''),
    # PUT tools: publish-time broken-route validation + history capture
    ('''    invalidateRegistry();
    const changed = previous ? (previous.visibility ?? "published") !== (row.visibility ?? "published") || previous.enabled !== row.enabled : true;''',
     '''    invalidateRegistry();
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
    if (history.error) console.error("[DevUtils] Version history write failed:", { tool_id: id, code: history.error.code ?? "unknown" });'''),
    # DELETE tools: record the override being reset into history first
    ('''app.delete("/api/admin/tools/:id", requireRole("admin"), async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const r = await service.from("tool_overrides").delete().eq("id", id);''',
     '''app.delete("/api/admin/tools/:id", requireRole("admin"), async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const existing = await service.from("tool_overrides").select("*").eq("id", id).maybeSingle();
  if (existing.error) return sendError(res, existing.error, "Reset failed.");
  if (existing.data) {
    const history = await service.from("tool_override_versions").insert({ tool_id: id, patch: existing.data, change_kind: "reset", changed_by: req.devutils.user.id });
    if (history.error) console.error("[DevUtils] Version history write failed:", { tool_id: id, code: history.error.code ?? "unknown" });
  }
  const r = await service.from("tool_overrides").delete().eq("id", id);'''),
    # health: new tables + broken-tools scan
    ('  const tables = ["profiles", "favorites", "saved_workflows", "saved_presets", "usage_records", "api_keys", "audit_logs", "tool_overrides", "category_overrides", "analytics_events", "admin_users"];',
     '  const tables = ["profiles", "favorites", "saved_workflows", "saved_presets", "usage_records", "api_keys", "audit_logs", "tool_overrides", "category_overrides", "analytics_events", "admin_users", "feature_flags", "tool_override_versions"];'),
    ('''  const ok = Object.values(checks).every((check) => check.ok);
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", checks, migrationRequired: !checks.tool_overrides.ok || !checks.admin_users.ok || !checks.analytics_events.ok });''',
     '''  let brokenTools = [];
  try {
    const merged = await registry({ includeUnpublished: true, maxAgeMs: 0 });
    brokenTools = findBrokenTools(merged.allTools, baseRegistry.tools.map((tool) => tool.id));
  } catch {
    brokenTools = [{ id: "unknown", reason: "registry unavailable" }];
  }
  const ok = Object.values(checks).every((check) => check.ok) && brokenTools.length === 0;
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", checks, brokenTools, migrationRequired: !checks.tool_overrides.ok || !checks.admin_users.ok || !checks.analytics_events.ok });'''),
]

IDX_BLOCK = """/* ---------------- Phase 6 WS C/D: version history, flags ---------------- */

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

"""
rw("server/index.mjs", IDX_EDITS)
# insert the block before the /api 404 catch-all
p = ROOT / "server/index.mjs"
s = p.read_text(encoding="utf-8")
anchor = 'app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));'
if "Phase 6 WS C/D: version history, flags" in s:
    print("  [server/index.mjs] WS C/D block already present")
else:
    n = s.count(anchor)
    assert n == 1, f"404 catch-all anchor found {n}x"
    s = s.replace(anchor, IDX_BLOCK + anchor, 1)
    p.write_text(s, encoding="utf-8")
    print("  [server/index.mjs] inserted WS C/D endpoints before the /api 404 catch-all")

# ---------------- 3. src/lib/routes.ts ----------------
rw("src/lib/routes.ts", [(
    'export const ADMIN_SECTIONS = ["overview", "tools", "categories", "users", "analytics", "audit", "health"] as const;',
    'export const ADMIN_SECTIONS = ["overview", "tools", "categories", "users", "flags", "analytics", "audit", "health"] as const;',
)])

# ---------------- 4. src/platform/features.ts ----------------
rw("src/platform/features.ts", [(
    '''export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}''',
    '''export function isFeatureEnabled(flag: FeatureFlag): boolean {
  /* Phase 6 WS D: gateway-mediated flags (from runtime-config.js) win;
     the static table is the offline/failure fallback. */
  const gateway = typeof window !== "undefined"
    ? (window as unknown as { __DEVUTILS_CONFIG__?: { flags?: Partial<Record<FeatureFlag, boolean>> } }).__DEVUTILS_CONFIG__?.flags
    : undefined;
  if (gateway && flag in gateway) return Boolean(gateway[flag]);
  return FEATURE_FLAGS[flag];
}''')])

# ---------------- 5. src/platform/admin-api.ts (appended) ----------------
API_APPEND = """
/* ---------------- Phase 6 WS C/D: flags + version history ---------------- */

export type AdminFlag = { key: string; enabled: boolean; defaultEnabled: boolean; overridden: boolean; updatedAt: string | null };
export type ToolVersion = { id: number; patch: Record<string, unknown>; change_kind: string; changed_by: string | null; created_at: string };

export async function fetchAdminFlags(): Promise<AdminFlag[]> {
  return apiFetch("/api/admin/flags");
}
export async function setFeatureFlag(key: string, enabled: boolean): Promise<unknown> {
  return apiFetch(`/api/admin/flags/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ enabled }) });
}
export async function fetchToolHistory(id: string): Promise<ToolVersion[]> {
  return apiFetch(`/api/admin/tools/${encodeURIComponent(id)}/history`);
}
export async function restoreToolVersion(id: string, versionId: number): Promise<unknown> {
  return apiFetch(`/api/admin/tools/${encodeURIComponent(id)}/restore`, { method: "POST", body: JSON.stringify({ versionId }) });
}
"""
rw("src/platform/admin-api.ts", [], API_APPEND, "fetchAdminFlags")

# ---------------- 6. src/pages/admin.tsx ----------------
ADMIN_EDITS = [
    ('  Pencil, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Trash2, Upload, Users, X,\n',
     '  Flag, Pencil, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Trash2, Upload, Users, X,\n'),
    ('''import {
  exportRegistry, fetchAdminAnalytics, fetchAdminAudit, fetchAdminHealth, fetchAdminMe,
  fetchAdminRegistry, fetchAdminUsers, importRegistry, reactivateUser, reorderTools,
  resetToolOverride, revokeUserAccess, revokeUserRole, saveCategoryOverride, saveToolOverride,
  setUserRole, suspendUser, type AdminAnalytics, type AdminHealth, type AdminRegistry,
  type AdminUser, type AdminUsersPage, type AuditEntry, type CategoryOverlay, type ToolOverlay,
} from "../platform/admin-api";''',
     '''import {
  exportRegistry, fetchAdminAnalytics, fetchAdminAudit, fetchAdminFlags, fetchAdminHealth, fetchAdminMe,
  fetchAdminRegistry, fetchAdminUsers, fetchToolHistory, importRegistry, reactivateUser, reorderTools,
  resetToolOverride, restoreToolVersion, revokeUserAccess, revokeUserRole, saveCategoryOverride,
  saveToolOverride, setFeatureFlag, setUserRole, suspendUser, type AdminAnalytics, type AdminFlag,
  type AdminHealth, type AdminRegistry, type AdminUser, type AdminUsersPage, type AuditEntry,
  type CategoryOverlay, type ToolOverlay, type ToolVersion,
} from "../platform/admin-api";'''),
    ('type Section = "overview" | "tools" | "categories" | "users" | "analytics" | "audit" | "health";',
     'type Section = "overview" | "tools" | "categories" | "users" | "flags" | "analytics" | "audit" | "health";'),
    ('  { id: "users", label: "Users", icon: Users, hint: "Search, suspension, and roles (admin+)" },',
     '  { id: "users", label: "Users", icon: Users, hint: "Search, suspension, and roles (admin+)" },\n  { id: "flags", label: "Flags & history", icon: Flag, hint: "Feature toggles and tool version history (admin+)" },'),
    ('{(role === "moderator" ? SECTIONS.filter((item) => item.id !== "users") : SECTIONS).map((item) => (',
     '{(role === "moderator" ? SECTIONS.filter((item) => item.id !== "users" && item.id !== "flags") : SECTIONS).map((item) => ('),
    (': section === "users" ? <UsersManager />',
     ': section === "users" ? <UsersManager />\n              : section === "flags" ? <FlagsManager registry={registry} />'),
]
FLAGS_COMPONENT = """
/* ------------------------------ Flags & history (Phase 6 WS C/D) ------------------------------ */

function FlagsManager({ registry }: { registry: AdminRegistry }) {
  const [flags, setFlags] = useState<AdminFlag[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [toolId, setToolId] = useState("");
  const [history, setHistory] = useState<ToolVersion[] | null>(null);

const loadFlags = useCallback(async () => {
    setError("");
    try { setFlags(await fetchAdminFlags()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Flags unavailable."); }
  }, []);
  useEffect(() => { void loadFlags(); }, [loadFlags]);

const loadHistory = useCallback(async () => {
    if (!toolId) { setHistory(null); return; }
    try { setHistory(await fetchToolHistory(toolId)); } catch (cause) { setError(cause instanceof Error ? cause.message : "History unavailable."); }
  }, [toolId]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

async function toggle(flag: AdminFlag) {
    setError("");
    try {
      await setFeatureFlag(flag.key, !flag.enabled);
      setNotice(`${flag.key} ${!flag.enabled ? "enabled" : "disabled"}.`);
      window.setTimeout(() => setNotice(""), 4000);
      await loadFlags();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Flag update failed."); }
  }

async function restore(versionId: number) {
    setError("");
    try {
      await restoreToolVersion(toolId, versionId);
      setNotice(`Version #${versionId} restored.`);
      window.setTimeout(() => setNotice(""), 4000);
      await loadHistory();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Restore failed."); }
  }

return (
    <div className="space-y-4">
      {error && <ErrorCallout title="Request failed" message={error} hint="Server-side authorization and validation are authoritative." />}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</p>}

<Panel className="overflow-hidden">
        <div className="max-h-[40vh] overflow-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th scope="col" className="px-3 py-2 font-bold">Feature flag</th>
                <th scope="col" className="px-3 py-2 font-bold">Default</th>
                <th scope="col" className="px-3 py-2 font-bold">Effective</th>
                <th scope="col" className="px-3 py-2 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {(flags ?? []).map((flag) => (
                <tr key={flag.key} className="border-t border-zinc-100 dark:border-zinc-800/70">
                  <td className="px-3 py-2.5 font-mono text-[12px]">{flag.key}{flag.overridden && <span className="ml-1.5 rounded bg-amber-50 px-1 text-[10px] font-bold uppercase text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">override</span>}</td>
                  <td className="px-3 py-2.5 text-[12px] text-zinc-500">{String(flag.defaultEnabled)}</td>
                  <td className="px-3 py-2.5"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", flag.enabled ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400")}>{String(flag.enabled)}</span></td>
                  <td className="px-3 py-2.5 text-right"><Btn onClick={() => { void toggle(flag); }}>{flag.enabled ? "Disable" : "Enable"}</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

<Panel className="space-y-3">
        <Field label="Tool version history" hint="Every saved override change is recorded. Restoring re-applies a recorded patch, re-validates the published routes, and audits tool_version_restored.">
          <Select value={toolId} onChange={(e) => setToolId(e.target.value)}>
            <option value="">Select a tool…</option>
            {registry.tools.map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}
          </Select>
        </Field>
        {history && (
          <div className="max-h-[30vh] overflow-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-[13px]">
              <thead className="bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th scope="col" className="px-3 py-2 font-bold">Version</th>
                  <th scope="col" className="px-3 py-2 font-bold">Change</th>
                  <th scope="col" className="px-3 py-2 font-bold">Saved at</th>
                  <th scope="col" className="px-3 py-2 text-right font-bold">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((v) => (
                  <tr key={v.id} className="border-t border-zinc-100 dark:border-zinc-800/70">
                    <td className="px-3 py-2.5 font-mono text-[12px]">#{v.id}</td>
                    <td className="px-3 py-2.5 text-[12px]">{v.change_kind}</td>
                    <td className="px-3 py-2.5 text-[12px] text-zinc-500">{new Date(v.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right"><Btn onClick={() => { void restore(v.id); }}>Restore</Btn></td>
                  </tr>
                ))}
                {history.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-zinc-500">No recorded changes for this tool yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
"""
rw("src/pages/admin.tsx", ADMIN_EDITS, FLAGS_COMPONENT, "FlagsManager")

# ---------------- 7. scripts/test-server.mjs ----------------
TEST_EDITS = [
    ('activeAdminRole, hasMinRole, isActiveAdminRecord',
     'activeAdminRole, findBrokenTools, hasMinRole, isActiveAdminRecord, mergeFeatureFlags, validatePublishableSlug'),
    ('''  { route: "DELETE /api/admin/users/:id/role", min: "super_admin" },
];''',
     '''  { route: "DELETE /api/admin/users/:id/role", min: "super_admin" },
  { route: "GET /api/admin/tools/:id/history", min: "moderator" },
  { route: "POST /api/admin/tools/:id/restore", min: "admin" },
  { route: "GET /api/admin/flags", min: "moderator" },
  { route: "PUT /api/admin/flags/:key", min: "admin" },
];'''),
    ('''  if (min === "super_admin") ok(`gating: ${route} rejects admin`, () => assert.equal(hasMinRole("admin", min), false));
}''',
     '''  if (min === "super_admin") ok(`gating: ${route} rejects admin`, () => assert.equal(hasMinRole("admin", min), false));
}

/* ---------------- phase6 WS C/D: publish validation, flags, broken-tool scan ---------------- */
ok("validatePublishableSlug accepts a clean slug", () => assert.equal(validatePublishableSlug("json-formatter", { id: "json_formatter" }).ok, true));
ok("validatePublishableSlug rejects uppercase", () => assert.equal(validatePublishableSlug("Bad Slug", { id: "t1" }).ok, false));
ok("validatePublishableSlug rejects a slug owned by another tool", () => assert.equal(validatePublishableSlug("json-formatter", { id: "t2", existingSlugs: new Map([["json-formatter", "t1"]]) }).ok, false));
ok("validatePublishableSlug allows a slug owned by the same tool", () => assert.equal(validatePublishableSlug("json-formatter", { id: "t1", existingSlugs: new Map([["json-formatter", "t1"]]) }).ok, true));
ok("validatePublishableSlug rejects a too-short slug", () => assert.equal(validatePublishableSlug("a", { id: "t1" }).ok, false));
ok("validatePublishableSlug returns null value for empty slug", () => assert.equal(validatePublishableSlug("", { id: "t1" }).value, null));
ok("mergeFeatureFlags applies a known override", () => assert.equal(mergeFeatureFlags({ api: false }, [{ key: "api", enabled: true }]).api, true));
ok("mergeFeatureFlags ignores unknown keys", () => assert.deepEqual(mergeFeatureFlags({ api: false }, [{ key: "nope", enabled: true }]), { api: false }));
ok("mergeFeatureFlags ignores malformed rows", () => assert.deepEqual(mergeFeatureFlags({ api: false }, [null, 7]), { api: false }));
ok("findBrokenTools returns empty for a clean registry", () => assert.equal(findBrokenTools([{ id: "a", route: "/a", visibility: "published" }], ["a"]).length, 0));
ok("findBrokenTools flags a duplicate route", () => assert.equal(findBrokenTools([{ id: "a", route: "/x", visibility: "published" }, { id: "b", route: "/x", visibility: "published" }], ["a", "b"]).length, 1));
ok("findBrokenTools flags a tool missing from the base registry", () => assert.equal(findBrokenTools([{ id: "ghost", route: "/ghost", visibility: "published" }], ["a"]).length, 1));
ok("findBrokenTools skips non-published tools", () => assert.equal(findBrokenTools([{ id: "ghost", route: "/ghost", visibility: "draft" }], ["a"]).length, 0));'''),
]
rw("scripts/test-server.mjs", TEST_EDITS)

# ---------------- 8. revoke_admin migration (gap found: never defined) ----------------
MIGRATION = """BEGIN;

-- DevUtils Phase 6 follow-up: revoke_admin() was called by the WS B gateway
-- (DELETE /api/admin/users/:id/role) but never defined by any migration.
create or replace function public.revoke_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null then raise exception 'p_user_id is required'; end if;
  update public.admin_users
    set revoked_at = now()
  where user_id = p_user_id and revoked_at is null;
end;
$$;

revoke all on function public.revoke_admin(uuid) from public, anon, authenticated;
grant execute on function public.revoke_admin(uuid) to service_role;

COMMIT;
"""
mig = ROOT / "supabase" / "migrations" / "202610220002_revoke_admin.sql"
if mig.exists():
    print("  [supabase/migrations/202610220002_revoke_admin.sql] already present")
else:
    mig.write_text(MIGRATION, encoding="utf-8")
    print("  [supabase/migrations/202610220002_revoke_admin.sql] written")

print("\\nWS C + WS D patch complete. Gates: npx tsc --noEmit; npx tsx scripts/verify.ts (247/0); npm run test:server (186/0); npm run build")
print("Then apply the revoke_admin migration: psql \\"$SUPABASE_SESSION_POOLER_URL\\" -v ON_ERROR_STOP=1 -f supabase/migrations/202610220002_revoke_admin.sql")
