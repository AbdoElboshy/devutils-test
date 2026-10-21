#!/usr/bin/env python3
"""Idempotent UI upgrade patch for DevUtils.

Applies three changes, each asserted before writing, each skippable if already applied:
  1. chrome.tsx    - remove the DevOps nav link
  2. account.tsx   - add dashboard visual charts (usage meters + favorites mix)
  3. admin.tsx     - upgrade Overview (visibility breakdown, tools per category)
                      and Analytics (ranked top tools, CSS donut by category, failure cards)

Run from the repo root. Safe to re-run. No new npm dependencies.
"""
import pathlib

# ---------- 1. chrome.tsx: remove DevOps nav link (idempotent) ----------
p = pathlib.Path("src/components/chrome.tsx")
s = p.read_text()
line = '    { label: "DevOps", path: "/categories/devops" },\n'
if line in s:
    s = s.replace(line, "")
    assert line not in s
    p.write_text(s)
    print("chrome.tsx: DevOps nav link removed")
else:
    print("chrome.tsx: already patched (or link not found) - skipping")

# ---------- 2. account.tsx: dashboard charts (idempotent) ----------
p = pathlib.Path("src/pages/account.tsx")
s = p.read_text()
if "function DashboardCharts" in s:
    print("account.tsx: already patched - skipping")
else:
    old = '{section === "dashboard" && <DashboardSection name={profile?.displayName || auth.user.displayName || auth.user.email || "developer"} favorites={favorites} workflows={workflows} presets={presets} recent={recent} usage={usage} audit={audit} onNav={onNav} />}'
    assert s.count(old) == 1, "account.tsx: dashboard anchor not found - inspect git diff and report"
    s = s.replace(old, '{section === "dashboard" && <><DashboardSection name={profile?.displayName || auth.user.displayName || auth.user.email || "developer"} favorites={favorites} workflows={workflows} presets={presets} recent={recent} usage={usage} audit={audit} onNav={onNav} /><DashboardCharts favorites={favorites} usage={usage} onNav={onNav} /></>}')
    s += '''
/* ---------- Dashboard visual charts (pure CSS, no dependencies) ---------- */

function BarMeter({ label, value, max, tone, hint }: { label: string; value: number; max: number; tone: string; hint?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
        <span className="font-mono text-[13px] font-bold tabular-nums">{value.toLocaleString()}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className={cn("h-full rounded-full transition-all duration-700", tone)} style={{ width: `${pct}%` }} />
      </div>
      {hint && <p className="mt-1 text-[10.5px] text-zinc-400">{hint}</p>}
    </div>
  );
}

function DashboardCharts({ favorites, usage, onNav }: { favorites: Favorite[]; usage: UsageSummary; onNav: (route: string) => void }) {
  const counts = { tool: 0, workflow: 0, integration: 0, category: 0 } as Record<string, number>;
  favorites.forEach((favorite) => { counts[favorite.kind] = (counts[favorite.kind] ?? 0) + 1; });
  const kindTotal = favorites.length || 1;
  const kinds = [
    { id: "tool", label: "Tools", tone: "bg-emerald-500" },
    { id: "workflow", label: "Workflows", tone: "bg-sky-500" },
    { id: "integration", label: "Integrations", tone: "bg-violet-500" },
    { id: "category", label: "Categories", tone: "bg-amber-400" },
  ];
  const usageMax = Math.max(usage.toolRuns, usage.workflowRuns, usage.apiRequests, usage.integrationCalls, 1);
  const hasUsage = usage.toolRuns + usage.workflowRuns + usage.apiRequests + usage.integrationCalls > 0;
  const usageItems = [
    { label: "Tool runs", value: usage.toolRuns, tone: "bg-emerald-500", hint: "Executions this month" },
    { label: "Workflow runs", value: usage.workflowRuns, tone: "bg-sky-500" },
    { label: "API requests", value: usage.apiRequests, tone: "bg-violet-500" },
    { label: "Integration calls", value: usage.integrationCalls, tone: "bg-amber-400" },
  ];
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <Panel className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-extrabold">Usage this month</h2>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-zinc-500 dark:bg-zinc-800">since {new Date(usage.periodStart).toLocaleDateString()}</span>
        </div>
        {hasUsage ? (
          <div className="mt-3 space-y-3">{usageItems.map((item) => <BarMeter key={item.label} {...item} max={usageMax} />)}</div>
        ) : <p className="mt-3 rounded-lg border border-dashed border-zinc-300 p-4 text-center text-[12.5px] text-zinc-500 dark:border-zinc-700">No usage recorded yet. Run any tool or workflow and it will appear here.</p>}
      </Panel>
      <Panel className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-extrabold">Favorites mix</h2>
          <button type="button" onClick={() => onNav("/account/favorites")} className="text-[12px] font-semibold text-emerald-600 hover:underline dark:text-emerald-400">View all &rarr;</button>
        </div>
        {favorites.length ? (
          <>
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="img" aria-label="Favorites by kind">
              {kinds.map((kind) => counts[kind.id] > 0 && (
                <span key={kind.id} className={kind.tone} style={{ width: `${(counts[kind.id] / kindTotal) * 100}%` }} title={`${kind.label}: ${counts[kind.id]}`} />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {kinds.map((kind) => (
                <li key={kind.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className={cn("h-2.5 w-2.5 rounded-sm", kind.tone)} />
                  <span className="text-zinc-600 dark:text-zinc-400">{kind.label}</span>
                  <span className="ml-auto font-mono font-bold tabular-nums">{counts[kind.id]}</span>
                </li>
              ))}
            </ul>
          </>
        ) : <p className="mt-3 rounded-lg border border-dashed border-zinc-300 p-4 text-center text-[12.5px] text-zinc-500 dark:border-zinc-700">Star a tool or workflow to build your mix.</p>}
      </Panel>
    </div>
  );
}
'''
    p.write_text(s)
    print("account.tsx: dashboard charts added")

# ---------- 3. admin.tsx: overview + analytics upgrade (idempotent) ----------
p = pathlib.Path("src/pages/admin.tsx")
s = p.read_text()
if "DONUT_TONES" in s:
    print("admin.tsx: already patched - skipping")
else:
    old_import = 'import { applyRegistryOverlays, loadRegistryOverlays } from "../lib/registry";'
    assert s.count(old_import) == 1, "admin.tsx: registry import anchor not found"
    s = s.replace(old_import, 'import { applyRegistryOverlays, CATEGORIES, loadRegistryOverlays } from "../lib/registry";')

    start = s.index("function Overview({ registry, onNav }: { registry: AdminRegistry; onNav: (route: string) => void }) {")
    end = s.index("/* ------------------------------ Tools ------------------------------ */", start)
    new_overview = '''function Overview({ registry, onNav }: { registry: AdminRegistry; onNav: (route: string) => void }) {
  const published = registry.tools.filter((t) => t.visibility === "published").length;
  const draft = registry.tools.filter((t) => t.visibility === "draft").length;
  const archived = registry.tools.filter((t) => t.visibility === "archived").length;
  const overridden = registry.tools.filter((t) => t.updatedAt).length;
  const total = registry.tools.length || 1;
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    registry.tools.forEach((tool) => map.set(tool.category, (map.get(tool.category) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [registry.tools]);
  const categoryMax = byCategory[0]?.[1] ?? 0;
  const visibility = [
    { label: "Published", count: published, tone: "bg-emerald-500" },
    { label: "Draft", count: draft, tone: "bg-amber-400" },
    { label: "Archived", count: archived, tone: "bg-zinc-400" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Registered tools" value={String(registry.tools.length)} />
        <Stat label="Published" value={String(published)} />
        <Stat label="Draft / archived" value={`${draft} / ${archived}`} />
        <Stat label="Categories" value={String(registry.categories.length)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Panel className="p-4">
          <h2 className="text-[14px] font-extrabold">Visibility breakdown</h2>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="img" aria-label="Visibility breakdown">
            {visibility.map((item) => item.count > 0 && (
              <span key={item.label} className={item.tone} style={{ width: `${(item.count / total) * 100}%` }} title={`${item.label}: ${item.count}`} />
            ))}
          </div>
          <ul className="mt-3 space-y-1.5 text-[12.5px]">
            {visibility.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-sm", item.tone)} />
                <span className="text-zinc-600 dark:text-zinc-400">{item.label}</span>
                <span className="ml-auto font-mono font-bold tabular-nums">{item.count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-zinc-400">{overridden} tool(s) carry administrator customizations.</p>
        </Panel>
        <Panel className="p-4">
          <h2 className="text-[14px] font-extrabold">Tools per category</h2>
          <ul className="mt-3 space-y-2">
            {byCategory.map(([id, count]) => (
              <li key={id}>
                <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                  <span className="font-medium">{CATEGORIES.find((c) => c.id === id)?.name ?? id}</span>
                  <span className="font-mono text-zinc-500 tabular-nums">{count}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${categoryMax ? (count / categoryMax) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel className="p-4">
        <h2 className="text-[14px] font-extrabold">Configuration state</h2>
        <dl className="mt-2 divide-y divide-zinc-100 text-[13px] dark:divide-zinc-800">
          {[
            ["Source of truth", "src/lib/registry.ts &rarr; registry.generated.json"],
            ["Administrator overlays", overridden ? `${overridden} tool(s) customized` : "none - running base catalogue"],
            ["Implementation ids", `${registry.baseToolIds.length} (not editable; new tools require code)`],
            ["Visibility options", registry.visibilityOptions.join(", ")],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <dt className="text-zinc-500">{k}</dt><dd className="font-mono text-[12px] text-zinc-800 dark:text-zinc-200">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn onClick={() => onNav("/admin/tools")}><Pencil size={14} /> Manage tools</Btn>
          <Btn onClick={() => onNav("/admin/analytics")}><Activity size={14} /> View analytics</Btn>
          <Btn onClick={() => onNav("/admin/health")}><AlertTriangle size={14} /> Check health</Btn>
        </div>
      </Panel>
      <p className="text-[12px] leading-relaxed text-zinc-500">
        Every figure on this page is read from the live registry and database. No sample or projected values are rendered.
      </p>
    </div>
  );
}

'''
    s = s[:start] + new_overview + s[end:]

    start = s.index("function Analytics() {")
    end = s.index("/* ------------------------------ Audit ------------------------------ */", start)
    new_analytics = '''const DONUT_TONES = ["#10b981", "#0ea5e9", "#8b5cf6", "#f59e0b", "#f43f5e", "#14b8a6", "#6366f1", "#eab308", "#22d3ee", "#a3a3a3"];

function Analytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { setData(await fetchAdminAnalytics(days)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Analytics unavailable."); }
  }, [days]);
  useEffect(() => { void load(); }, [load]);
  const max = data?.topTools[0]?.count ?? 0;
  const totalCategory = data ? data.byCategory.reduce((sum, item) => sum + item.count, 0) : 0;
  const donutStyle = useMemo(() => {
    if (!data || totalCategory === 0) return undefined;
    let offset = 0;
    const stops: string[] = [];
    data.byCategory.slice(0, 10).forEach((item, index) => {
      const start = (offset / totalCategory) * 100;
      offset += item.count;
      stops.push(`${DONUT_TONES[index]} ${start}% ${(offset / totalCategory) * 100}%`);
    });
    return { background: `conic-gradient(${stops.join(", ")})` };
  }, [data, totalCategory]);

  return (
    <div className="space-y-4">
      <Panel className="flex flex-wrap items-end gap-3 p-3">
        <Field label="Window"><Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="w-32"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></Select></Field>
        <Btn onClick={() => { void load(); }}><RefreshCw size={14} /> Refresh</Btn>
        {data && <p className="pb-2 font-mono text-[11px] text-zinc-400">collected {new Date(data.collectedAt).toLocaleString()}</p>}
      </Panel>
      {error && <ErrorCallout title="Analytics unavailable" message={error} hint="The dashboard never renders fabricated numbers when a query fails." />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Registered users" value={String(data.registeredUsers)} />
            <Stat label={`New in ${data.windowDays}d`} value={String(data.newUsersInWindow)} />
            <Stat label="Workflow runs" value={String(data.workflowRuns)} />
            <Stat label="Tool failures" value={String(data.toolFailures)} />
          </div>
          {!data.available.anonymousEvents && (
            <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>Anonymous product analytics are not being collected. Visitors must opt in via Settings &rarr; Privacy, so per-tool counters below reflect account usage only. This is an honest gap, not a zero.</span>
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
            <Panel className="p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[14px] font-extrabold">Top tools</h2>
                {max > 0 && <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-zinc-500 dark:bg-zinc-800">peak {max}</span>}
              </div>
              {data.topTools.length ? (
                <ul className="mt-3 space-y-2.5">
                  {data.topTools.map((tool, index) => (
                    <li key={tool.toolId}>
                      <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                        <span className="font-medium"><span className="mr-1.5 font-mono text-[10.5px] text-zinc-400">#{index + 1}</span>{tool.name}</span>
                        <span className="font-mono text-zinc-500 tabular-nums">{tool.count} &middot; {max ? Math.round((tool.count / max) * 100) : 0}%</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-700" style={{ width: `${max ? (tool.count / max) * 100 : 0}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-[13px] text-zinc-500">No tool usage recorded in this window.</p>}
            </Panel>
            <Panel className="p-4">
              <h2 className="text-[14px] font-extrabold">Usage by category</h2>
              {totalCategory > 0 && donutStyle ? (
                <div className="mt-3 flex items-center justify-center">
                  <div className="relative flex h-36 w-36 items-center justify-center rounded-full" style={donutStyle} role="img" aria-label="Usage by category">
                    <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white dark:bg-zinc-950">
                      <span className="font-mono text-lg font-extrabold tabular-nums">{totalCategory.toLocaleString()}</span>
                      <span className="text-[10px] uppercase tracking-wide text-zinc-400">events</span>
                    </div>
                  </div>
                </div>
              ) : <p className="mt-2 text-[13px] text-zinc-500">No category usage recorded in this window.</p>}
              {totalCategory > 0 && (
                <ul className="mt-3 space-y-1.5 text-[12px]">
                  {data.byCategory.slice(0, 10).map((item, index) => (
                    <li key={item.categoryId} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: DONUT_TONES[index] }} />
                      <span className="text-zinc-600 dark:text-zinc-400">{CATEGORIES.find((c) => c.id === item.categoryId)?.name ?? item.categoryId}</span>
                      <span className="ml-auto font-mono font-bold tabular-nums">{item.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Panel className="p-4">
              <h2 className="text-[14px] font-extrabold">Least used</h2>
              {data.leastUsedTools.length ? <ul className="mt-2 space-y-1 text-[12.5px] text-zinc-600 dark:text-zinc-400">{data.leastUsedTools.map((t) => <li key={t.toolId} className="flex justify-between gap-2"><span>{t.name}</span><span className="font-mono text-zinc-400">{t.count}</span></li>)}</ul> : <p className="mt-2 text-[13px] text-zinc-500">Every registered tool recorded usage.</p>}
            </Panel>
            <Panel className="p-4">
              <h2 className="text-[14px] font-extrabold">Failures</h2>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/30"><p className="text-[11px] font-bold uppercase tracking-wide text-red-600 dark:text-red-300">Tool errors</p><p className="mt-1 font-mono text-xl font-extrabold tabular-nums text-red-700 dark:text-red-300">{data.toolFailures}</p></div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30"><p className="text-[11px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-300">Auth errors</p><p className="mt-1 font-mono text-xl font-extrabold tabular-nums text-amber-700 dark:text-amber-300">{data.authFailures}</p></div>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-500">Event names and identifiers only - never tool input, tokens, or payloads.</p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

'''
    s = s[:start] + new_analytics + s[end:]
    p.write_text(s)
    print("admin.tsx: overview + analytics upgraded")

print("done")
