import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownUp, Check, Download, Gauge, Layers, Lock,
  Flag, Pencil, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Trash2, Upload, Users, X,
} from "lucide-react";
import { useAuth } from "../platform/auth-context";
import {
  exportRegistry, fetchAdminAnalytics, fetchAdminAudit, fetchAdminFlags, fetchAdminHealth, fetchAdminMe,
  fetchAdminRegistry, fetchAdminUsers, fetchToolHistory, importRegistry, reactivateUser, reorderTools,
  resetToolOverride, restoreToolVersion, revokeUserAccess, revokeUserRole, saveCategoryOverride,
  saveToolOverride, setFeatureFlag, setUserRole, suspendUser, type AdminAnalytics, type AdminFlag,
  type AdminHealth, type AdminRegistry, type AdminUser, type AdminUsersPage, type AuditEntry,
  type CategoryOverlay, type ToolOverlay, type ToolVersion,
} from "../platform/admin-api";
import { applyRegistryOverlays, CATEGORIES, loadRegistryOverlays } from "../lib/registry";
import { downloadFile } from "../lib/engine";
import { Btn, ErrorCallout, Field, Panel, Select, Stat, TextInput, inputCls } from "../components/ui";
import { AccountUnavailable } from "./auth";
import { cn } from "../utils/cn";

type Section = "overview" | "tools" | "categories" | "users" | "flags" | "analytics" | "audit" | "health";

const SECTIONS: { id: Section; label: string; icon: typeof Gauge; hint: string }[] = [
  { id: "overview", label: "Overview", icon: Gauge, hint: "Live counts and configuration state" },
  { id: "tools", label: "Tools", icon: Layers, hint: "Metadata, ordering, visibility" },
  { id: "categories", label: "Categories", icon: SlidersHorizontal, hint: "Grouping and display order" },
  { id: "users", label: "Users", icon: Users, hint: "Search, suspension, and roles (admin+)" },
  { id: "flags", label: "Flags & history", icon: Flag, hint: "Feature toggles and tool version history (admin+)" },
  { id: "analytics", label: "Analytics", icon: Activity, hint: "Real usage, no fabricated numbers" },
  { id: "audit", label: "Audit log", icon: ShieldCheck, hint: "Administrative and account events" },
  { id: "health", label: "Health", icon: AlertTriangle, hint: "Dependency and migration checks" },
];

export function AdminPage({ section, onNav }: { section: Section; onNav: (route: string) => void }) {
  const auth = useAuth();
  const [role, setRole] = useState<"unknown" | "denied" | "moderator" | "admin" | "super_admin">("unknown");
  const [registry, setRegistry] = useState<AdminRegistry | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const me = await fetchAdminMe();
      setRole(me.role === "moderator" || me.role === "admin" || me.role === "super_admin" ? me.role : "denied");
      setRegistry(await fetchAdminRegistry());
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Admin access failed.";
      setRole(/administrator|Authentication required|session/i.test(message) ? "denied" : "denied");
      setError(message);
    }
  }, []);

  useEffect(() => { if (auth.user) void load(); else if (!auth.loading) setRole("denied"); }, [auth.user, auth.loading, load]);

  const refresh = async (message: string) => {
    setRegistry(await fetchAdminRegistry());
    await loadRegistryOverlays();
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4000);
  };

  if (!auth.enabled) return <AccountUnavailable onNav={onNav} />;
  if (auth.loading || role === "unknown") return <Centered>Verifying administrator access…</Centered>;
  if (!auth.user) return <Centered action={<Btn variant="primary" onClick={() => onNav("/login")}>Sign in</Btn>}>Administrator access requires an authenticated session.</Centered>;
  if (role === "denied") {
    return (
      <Centered action={<Btn onClick={() => onNav("/account")}>Back to account</Btn>}>
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40"><Lock size={20} /></span>
        <strong className="block text-base">Administrator access required</strong>
        <span className="mt-1 block max-w-md text-[13px] leading-relaxed">
          Authorization is enforced by the gateway against the <code className="font-mono">admin_users</code> table. Signed-in users cannot promote themselves by editing a request, URL, or local storage.
          {error && <> <span className="text-zinc-400">({error})</span></>}
        </span>
      </Centered>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-7 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">Administration</p>
          <h1 className="mt-1 text-[26px] font-extrabold tracking-tight">{SECTIONS.find((s) => s.id === section)?.label ?? "Admin"}</h1>
          <p className="mt-0.5 text-[13px] text-zinc-500">{SECTIONS.find((s) => s.id === section)?.hint}</p>
        </div>
        <div className="flex items-center gap-2">
          {notice && <span role="status" className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><Check size={12} /> {notice}</span>}
          <Btn onClick={() => { void load(); }}><RefreshCw size={14} /> Reload</Btn>
        </div>
      </header>

      {error && <div className="mt-4"><ErrorCallout title="Admin request failed" message={error} hint="Server-side authorization and validation are authoritative; retry after correcting the input." /></div>}

      <div className="mt-5 grid gap-5 lg:grid-cols-[196px_1fr]">
        <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1">
          {(role === "moderator" ? SECTIONS.filter((item) => item.id !== "users" && item.id !== "flags") : SECTIONS).map((item) => (
            <button key={item.id} type="button" onClick={() => onNav(item.id === "overview" ? "/admin" : `/admin/${item.id}`)} aria-current={section === item.id ? "page" : undefined}
              className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition lg:w-full",
                section === item.id ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900")}>
              <item.icon size={14} />{item.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {!registry ? <Panel className="p-8 text-center text-sm text-zinc-500">Loading registry…</Panel>
            : section === "overview" ? <Overview registry={registry} onNav={onNav} />
              : section === "tools" ? <ToolsManager registry={registry} onSaved={refresh} onError={setError} />
                : section === "categories" ? <CategoryManager registry={registry} onSaved={refresh} onError={setError} />
              : section === "users" ? <UsersManager />
              : section === "flags" ? <FlagsManager registry={registry} />
                  : section === "analytics" ? <Analytics />
                    : section === "audit" ? <AuditLog />
                      : <Health />}
        </div>
      </div>
    </div>
  );
}

function Centered({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-24 text-center">
      <p className="text-[14px] leading-relaxed text-zinc-500">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------ Overview ------------------------------ */

function Overview({ registry, onNav }: { registry: AdminRegistry; onNav: (route: string) => void }) {
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

/* ------------------------------ Tools ------------------------------ */

type SortKey = "order" | "name" | "category" | "visibility";

function ToolsManager({ registry, onSaved, onError }: { registry: AdminRegistry; onSaved: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [sort, setSort] = useState<SortKey>("order");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return registry.tools
      .filter((tool) => (category === "all" || tool.category === category)
        && (visibility === "all" || tool.visibility === visibility)
        && (!q || `${tool.id} ${tool.name} ${tool.description} ${(tool.keywords ?? []).join(" ")}`.toLowerCase().includes(q)))
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name)
        : sort === "category" ? a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
          : sort === "visibility" ? a.visibility.localeCompare(b.visibility)
            : (a.order ?? 0) - (b.order ?? 0));
  }, [registry.tools, query, category, visibility, sort]);

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    try { await reorderTools(next.map((tool) => ({ id: tool.id }))); await onSaved("Order updated"); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "Reorder failed."); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <Panel className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[200px] flex-1">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-500">Search</span>
            <span className="relative block">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="id, name, description, keyword…" aria-label="Search tools"
                className={cn(inputCls, "pl-9 font-mono text-[13px]")} />
            </span>
          </label>
          <Field label="Category" className="w-40"><Select value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">All</option>{registry.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Visibility" className="w-36"><Select value={visibility} onChange={(e) => setVisibility(e.target.value)}><option value="all">All</option>{registry.visibilityOptions.map((v) => <option key={v} value={v}>{v}</option>)}</Select></Field>
          <Field label="Sort" className="w-36"><Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}><option value="order">Display order</option><option value="name">Name</option><option value="category">Category</option><option value="visibility">Visibility</option></Select></Field>
        </div>
        <p className="mt-2 text-[12px] text-zinc-500" role="status">{rows.length} of {registry.tools.length} tools</p>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="max-h-[62vh] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th scope="col" className="px-3 py-2 font-bold">Tool</th>
                <th scope="col" className="px-3 py-2 font-bold">Category</th>
                <th scope="col" className="px-3 py-2 font-bold">Visibility</th>
                <th scope="col" className="px-3 py-2 font-bold">Order</th>
                <th scope="col" className="px-3 py-2 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tool, index) => (
                <tr key={tool.id} className="border-t border-zinc-100 align-top transition hover:bg-zinc-50/70 dark:border-zinc-800/70 dark:hover:bg-zinc-900/50">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold">{tool.name}</p>
                    <p className="font-mono text-[11px] text-zinc-400">{tool.id} · {tool.route}</p>
                    <p className="mt-0.5 line-clamp-2 max-w-md text-[12px] text-zinc-500">{tool.description}</p>
                    {tool.updatedAt && <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">customized {new Date(tool.updatedAt).toLocaleDateString()}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-zinc-600 dark:text-zinc-400">{tool.category}</td>
                  <td className="px-3 py-2.5"><VisibilityPill value={tool.visibility} featured={tool.featured} /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => { void move(index, -1); }} disabled={busy || index === 0} aria-label={`Move ${tool.name} up`}
                        className="rounded-md border border-zinc-200 p-1 text-zinc-500 transition hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-30 dark:border-zinc-700"><ArrowDownUp size={12} className="-scale-y-100" /></button>
                      <button type="button" onClick={() => { void move(index, 1); }} disabled={busy || index === rows.length - 1} aria-label={`Move ${tool.name} down`}
                        className="rounded-md border border-zinc-200 p-1 text-zinc-500 transition hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-30 dark:border-zinc-700"><ArrowDownUp size={12} /></button>
                      <span className="ml-1 font-mono text-[11px] text-zinc-400">{tool.order ?? index}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Btn variant="ghost" className="px-2 py-1" onClick={() => setEditing(editing === tool.id ? null : tool.id)}><Pencil size={13} /> {editing === tool.id ? "Close" : "Edit"}</Btn>
                      {tool.updatedAt && <Btn variant="ghost" className="px-2 py-1" onClick={() => { setBusy(true); void resetToolOverride(tool.id).then(() => onSaved("Reset to defaults")).catch((c: unknown) => onError(c instanceof Error ? c.message : "Reset failed.")).finally(() => setBusy(false)); }}><Trash2 size={13} /> Reset</Btn>}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="px-3 py-10 text-center text-[13px] text-zinc-500">No tools match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {editing && <ToolEditor tool={registry.tools.find((t) => t.id === editing)!} categories={registry.categories} onClose={() => setEditing(null)} onSaved={onSaved} onError={onError} />}
      <ImportExport onError={onError} onSaved={onSaved} />
    </div>
  );
}

function VisibilityPill({ value, featured }: { value: string; featured?: boolean }) {
  const tone = value === "published" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
    : value === "draft" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", tone)}>{value}</span>
      {featured && <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-bold uppercase text-lime-300 dark:bg-zinc-100 dark:text-zinc-900">featured</span>}
    </span>
  );
}

function ToolEditor({ tool, categories, onClose, onSaved, onError }: {
  tool: AdminRegistry["tools"][number]; categories: AdminRegistry["categories"];
  onClose: () => void; onSaved: (message: string) => Promise<void>; onError: (message: string) => void;
}) {
  const [form, setForm] = useState<ToolOverlay>({
    id: tool.id, name: tool.name, slug: tool.slug, description: tool.description,
    longDescription: tool.longDescription, category: tool.category, keywords: tool.keywords,
    aliases: tool.aliases, related: tool.related, tags: tool.tags ?? [],
    featured: Boolean(tool.featured), visibility: (tool.visibility as ToolOverlay["visibility"]) ?? "published", order: tool.order ?? 0,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ToolOverlay>(key: K, value: ToolOverlay[K]) => setForm((f) => ({ ...f, [key]: value }));
  const list = (value: string[]) => value.join(", ");
  const unlist = (value: string) => value.split(",").map((v) => v.trim()).filter(Boolean);

  const baseline = JSON.stringify({ id: tool.id, name: tool.name, slug: tool.slug, description: tool.description, longDescription: tool.longDescription, category: tool.category, keywords: tool.keywords, aliases: tool.aliases, related: tool.related, tags: tool.tags ?? [], featured: Boolean(tool.featured), visibility: (tool.visibility as ToolOverlay["visibility"]) ?? "published", order: tool.order ?? 0 });
  const confirmClose = () => {
    if (JSON.stringify(form) !== baseline && !window.confirm("You have unsaved edits. Discard them?")) return;
    onClose();
  };

  const save = async () => {
    setBusy(true); setErrors([]);
    try { await saveToolOverride(tool.id, form); await onSaved(`Saved ${tool.name}`); onClose(); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : "Save failed.";
      const parsed = /errors/.test(message) ? message : null;
      setErrors(parsed ? [parsed] : [message]);
      onError(message);
    } finally { setBusy(false); }
  };

  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold">Edit {tool.name}</h2>
          <p className="mt-0.5 font-mono text-[11.5px] text-zinc-400">{tool.id} — implementation id is fixed; metadata is editable</p>
        </div>
        <button type="button" onClick={confirmClose} aria-label="Close editor" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"><X size={16} /></button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Display name"><TextInput value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} maxLength={80} /></Field>
        <Field label="Slug" hint="Changes the public URL. Existing links to the old route stop resolving."><TextInput value={form.slug ?? ""} onChange={(e) => set("slug", e.target.value)} className="font-mono" maxLength={80} /></Field>
        <Field label="Category"><Select value={form.category ?? ""} onChange={(e) => set("category", e.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Visibility"><Select value={form.visibility ?? "published"} onChange={(e) => set("visibility", e.target.value as ToolOverlay["visibility"])}><option value="published">published</option><option value="draft">draft</option><option value="archived">archived</option></Select></Field>
          <Field label="Display order"><TextInput type="number" min={0} max={9999} value={String(form.order ?? 0)} onChange={(e) => set("order", Number(e.target.value))} className="font-mono" /></Field>
        </div>
        <Field label="Short description" className="md:col-span-2"><textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2} maxLength={240} className={cn(inputCls, "text-[13px]")} /></Field>
        <Field label="Long description" className="md:col-span-2"><textarea value={form.longDescription ?? ""} onChange={(e) => set("longDescription", e.target.value)} rows={3} maxLength={1200} className={cn(inputCls, "text-[13px]")} /></Field>
        <Field label="Keywords (comma separated)"><TextInput value={list(form.keywords ?? [])} onChange={(e) => set("keywords", unlist(e.target.value))} className="font-mono text-[12px]" /></Field>
        <Field label="Aliases (comma separated)"><TextInput value={list(form.aliases ?? [])} onChange={(e) => set("aliases", unlist(e.target.value))} className="font-mono text-[12px]" /></Field>
        <Field label="Tags (comma separated)"><TextInput value={list(form.tags ?? [])} onChange={(e) => set("tags", unlist(e.target.value))} className="font-mono text-[12px]" /></Field>
        <Field label="Related tool ids (comma separated)"><TextInput value={list(form.related ?? [])} onChange={(e) => set("related", unlist(e.target.value))} className="font-mono text-[12px]" /></Field>
        <label className="flex items-center gap-2 text-[13px] md:col-span-2">
          <input type="checkbox" checked={Boolean(form.featured)} onChange={(e) => set("featured", e.target.checked)} className="h-4 w-4 accent-emerald-600" />
          Featured on the homepage
        </label>
      </div>

      {errors.length > 0 && (
        <div className="mt-3" role="alert">
          <ErrorCallout title="Validation failed" message={errors.join(" · ")} hint="Nothing was written. Correct the fields and save again." />
        </div>
      )}
      <p className="mt-3 rounded-lg bg-zinc-100 p-2.5 text-[11.5px] leading-relaxed text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        Only metadata is editable here. Tool behaviour lives in code, so an administrator cannot inject executable JavaScript, SQL, or shell commands through configuration.
      </p>
      <div className="mt-3 flex gap-2">
        <Btn variant="primary" onClick={() => { void save(); }} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Btn>
        <Btn onClick={confirmClose} disabled={busy}>Cancel</Btn>
      </div>
    </Panel>
  );
}

function ImportExport({ onSaved, onError }: { onSaved: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const data = await exportRegistry();
      downloadFile("devutils-registry-overrides.json", JSON.stringify(data, null, 2), "application/json");
      setResult([`Exported ${data.tools.length} tool override(s) and ${data.categories.length} category override(s).`]);
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Export failed."); }
    finally { setBusy(false); }
  };

  const doImport = async (dryRun: boolean) => {
    setBusy(true); setResult([]);
    try {
      const payload = JSON.parse(raw) as unknown;
      const response = await importRegistry(payload, dryRun);
      if ("errors" in response) { setResult(response.errors); onError("Import validation failed."); }
      else {
        setResult([dryRun ? `Dry run passed — ${response.wouldWrite} entries would be written.` : `Imported ${response.written} entries.`]);
        if (!dryRun) await onSaved("Registry imported");
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Import failed.";
      setResult([message]); onError(message);
    } finally { setBusy(false); }
  };

  return (
    <Panel className="p-4">
      <h2 className="text-[14px] font-extrabold">Export / import configuration</h2>
      <p className="mt-1 text-[12.5px] text-zinc-500">Move validated overrides between environments. Imports are validated before anything is written, and a dry run writes nothing.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn onClick={() => { void doExport(); }} disabled={busy}><Download size={14} /> Export JSON</Btn>
      </div>
      <Field label="Import payload" className="mt-3">
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={6} spellCheck={false}
          placeholder='{"tools":[{"id":"json","featured":true,"order":0}]}' className={cn(inputCls, "font-mono text-[12px]")} />
      </Field>
      <div className="mt-2 flex flex-wrap gap-2">
        <Btn onClick={() => { void doImport(true); }} disabled={busy || !raw.trim()}><Upload size={14} /> Validate (dry run)</Btn>
        <Btn variant="primary" onClick={() => { void doImport(false); }} disabled={busy || !raw.trim()}>{busy ? "Working…" : "Import"}</Btn>
      </div>
      {result.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg bg-zinc-100 p-3 font-mono text-[11.5px] dark:bg-zinc-900" role="status">
          {result.map((line, i) => <li key={i} className="text-zinc-700 dark:text-zinc-300">{line}</li>)}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------ Categories ------------------------------ */

function CategoryManager({ registry, onSaved, onError }: { registry: AdminRegistry; onSaved: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    registry.tools.forEach((tool) => map.set(tool.category, (map.get(tool.category) ?? 0) + 1));
    return map;
  }, [registry.tools]);

  return (
    <div className="space-y-3">
      <Panel className="overflow-hidden">
        <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
          <thead className="bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr><th scope="col" className="px-3 py-2 font-bold">Category</th><th scope="col" className="px-3 py-2 font-bold">Slug</th><th scope="col" className="px-3 py-2 font-bold">Tools</th><th scope="col" className="px-3 py-2 font-bold">Order</th><th scope="col" className="px-3 py-2 text-right font-bold">Actions</th></tr>
          </thead>
          <tbody>
            {registry.categories.map((category) => (
              <tr key={category.id} className="border-t border-zinc-100 dark:border-zinc-800/70">
                <td className="px-3 py-2.5">
                  <p className="font-semibold">{category.name}{category.enabled === false && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-500 dark:bg-zinc-800">disabled</span>}</p>
                  <p className="line-clamp-1 max-w-md text-[12px] text-zinc-500">{category.description}</p>
                </td>
                <td className="px-3 py-2.5 font-mono text-[11.5px] text-zinc-400">{category.slug}</td>
                <td className="px-3 py-2.5 font-mono text-[12px]">{counts.get(category.id) ?? 0}</td>
                <td className="px-3 py-2.5 font-mono text-[12px] text-zinc-400">{category.order}</td>
                <td className="px-3 py-2.5 text-right"><Btn variant="ghost" className="px-2 py-1" onClick={() => setEditing(editing === category.id ? null : category.id)}><Pencil size={13} /> {editing === category.id ? "Close" : "Edit"}</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {editing && (
        <CategoryEditor
          category={registry.categories.find((c) => c.id === editing)!}
          toolCount={counts.get(editing) ?? 0}
          onClose={() => setEditing(null)} onSaved={onSaved} onError={onError}
        />
      )}
      <p className="text-[12px] leading-relaxed text-zinc-500">
        Categories cannot be deleted while tools are assigned to them. Disable a category to hide it from navigation, or reassign its tools first — historical favorites and recent-tool references keep working either way.
      </p>
    </div>
  );
}

function CategoryEditor({ category, toolCount, onClose, onSaved, onError }: {
  category: AdminRegistry["categories"][number]; toolCount: number;
  onClose: () => void; onSaved: (message: string) => Promise<void>; onError: (message: string) => void;
}) {
  const [form, setForm] = useState<CategoryOverlay>({ id: category.id, name: category.name, slug: category.slug, description: category.description, tagline: category.tagline, order: category.order ?? 0, enabled: category.enabled !== false });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const baseline = JSON.stringify({ id: category.id, name: category.name, slug: category.slug, description: category.description, tagline: category.tagline, order: category.order ?? 0, enabled: category.enabled !== false });
  const confirmClose = () => {
    if (JSON.stringify(form) !== baseline && !window.confirm("You have unsaved edits. Discard them?")) return;
    onClose();
  };

  const save = async () => {
    setBusy(true); setErrors([]);
    try { await saveCategoryOverride(category.id, form); await onSaved(`Saved ${form.name}`); onClose(); }
    catch (cause) { const message = cause instanceof Error ? cause.message : "Save failed."; setErrors([message]); onError(message); }
    finally { setBusy(false); }
  };
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-[15px] font-extrabold">Edit {category.name}</h2><p className="mt-0.5 font-mono text-[11.5px] text-zinc-400">{category.id} · {toolCount} tool(s) assigned</p></div>
        <button type="button" onClick={confirmClose} aria-label="Close editor" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X size={16} /></button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Name"><TextInput value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} /></Field>
        <Field label="Slug" hint="Changing this changes /categories/<slug>."><TextInput value={form.slug ?? ""} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="font-mono" maxLength={60} /></Field>
        <Field label="Tagline" className="md:col-span-2"><TextInput value={form.tagline ?? ""} onChange={(e) => setForm({ ...form, tagline: e.target.value })} maxLength={160} /></Field>
        <Field label="Description" className="md:col-span-2"><textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={400} className={cn(inputCls, "text-[13px]")} /></Field>
        <Field label="Display order"><TextInput type="number" min={0} max={999} value={String(form.order ?? 0)} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} className="font-mono" /></Field>
        <label className="flex items-center gap-2 pb-2 text-[13px]"><input type="checkbox" checked={form.enabled !== false} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-4 w-4 accent-emerald-600" /> Visible in navigation</label>
      </div>
      {errors.length > 0 && <div className="mt-3"><ErrorCallout title="Validation failed" message={errors.join(" · ")} /></div>}
      <div className="mt-3 flex gap-2"><Btn variant="primary" onClick={() => { void save(); }} disabled={busy}>{busy ? "Saving…" : "Save category"}</Btn><Btn onClick={confirmClose} disabled={busy}>Cancel</Btn></div>
    </Panel>
  );
}

/* ------------------------------ Analytics ------------------------------ */

const DONUT_TONES = ["#10b981", "#0ea5e9", "#8b5cf6", "#f59e0b", "#f43f5e", "#14b8a6", "#6366f1", "#eab308", "#22d3ee", "#a3a3a3"];

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
      {!data && !error && <Panel className="p-8 text-center text-sm text-zinc-500">Loading analytics…</Panel>}
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

/* ------------------------------ Audit ------------------------------ */

function AuditLog() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    setLoading(true);
    fetchAdminAudit(80)
      .then(setRows)
      .catch((c: unknown) => setError(c instanceof Error ? c.message : "Audit unavailable."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <Panel className="p-4">
      <h2 className="text-[14px] font-extrabold">Audit log</h2>
      <p className="mt-1 text-[12.5px] text-zinc-500">Administrative and account events. Passwords, tokens, API keys, and tool input are never recorded.</p>
      {error && <div className="mt-3"><ErrorCallout title="Audit unavailable" message={error} /></div>}
      {error && <div className="mt-3"><Btn onClick={load}>Retry</Btn></div>}
      {loading && !error && <p className="mt-3 text-[13px] text-zinc-500">Loading audit events…</p>}
      {rows && (
        <div className="mt-3 max-h-[60vh] overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          {rows.length ? rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-baseline gap-2 border-b border-zinc-100 px-3 py-2 text-[12.5px] last:border-0 dark:border-zinc-800/70">
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-bold dark:bg-zinc-800">{row.action}</code>
              <span className="font-mono text-[11px] text-zinc-400">{row.user_id.slice(0, 8)}</span>
              <span className="ml-auto font-mono text-[11px] text-zinc-400">{new Date(row.created_at).toLocaleString()}</span>
              {Object.keys(row.metadata ?? {}).length > 0 && <span className="w-full font-mono text-[11px] text-zinc-500">{JSON.stringify(row.metadata)}</span>}
            </div>
          )) : <p className="p-6 text-center text-[13px] text-zinc-500">No audit events recorded yet.</p>}
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------ Health ------------------------------ */

function Health() {
  const [data, setData] = useState<AdminHealth | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => { fetchAdminHealth().then(setData).catch((c: unknown) => setError(c instanceof Error ? c.message : "Health check failed.")); }, []);
  useEffect(load, [load]);
  return (
    <div className="space-y-3">
      <Panel className="flex flex-wrap items-center gap-3 p-3">
        <Btn onClick={load}><RefreshCw size={14} /> Re-run checks</Btn>
        {data && <span className={cn("rounded-full px-2.5 py-1 text-[11.5px] font-bold uppercase", data.status === "ok" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300")}>{data.status}</span>}
        {data?.migrationRequired && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11.5px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">migration required</span>}
      </Panel>
      {error && <ErrorCallout title="Health check failed" message={error} />}
      {!data && !error && <Panel className="p-8 text-center text-sm text-zinc-500">Running health checks…</Panel>}
      {data && (
        <Panel className="overflow-hidden">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-900"><tr><th scope="col" className="px-3 py-2 font-bold">Table</th><th scope="col" className="px-3 py-2 font-bold">State</th><th scope="col" className="px-3 py-2 text-right font-bold">Rows</th></tr></thead>
            <tbody>
              {Object.entries(data.checks).map(([table, check]) => (
                <tr key={table} className="border-t border-zinc-100 dark:border-zinc-800/70">
                  <td className="px-3 py-2 font-mono text-[12px]">{table}</td>
                  <td className="px-3 py-2">{check.ok ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-600"><Check size={13} /> reachable</span> : <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-red-600"><X size={13} /> unavailable</span>}</td>
                  <td className="px-3 py-2 text-right font-mono text-[12px] text-zinc-500">{check.rows ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      {data?.migrationRequired && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          After backing up and checking migration history, apply <code className="font-mono">supabase/migrations/202610190002_tools_admin_analytics.sql</code> if its tables are missing, then verify/apply <code className="font-mono">supabase/migrations/202610200001_audit_admin_actions.sql</code> so administrative audit actions are allowed. Bootstrap an administrator with <code className="font-mono">select public.grant_admin('&lt;user-uuid&gt;')</code> only after confirming the user's UUID.
        </p>
      )}
    </div>
  );
}

export { applyRegistryOverlays };

/* ------------------------------ Users (Phase 6) ------------------------------ */

type UserConfirmKind = "suspend" | "reactivate" | "revoke-access" | "role-assign" | "role-revoke";
type UserConfirm = { kind: UserConfirmKind; user: AdminUser } | null;

function UsersManager() {
  const [me, setMe] = useState<{ role: string; userId: string } | null>(null);
  const [data, setData] = useState<AdminUsersPage | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<UserConfirm>(null);
  const [confirmText, setConfirmText] = useState("");
  const [roleChoice, setRoleChoice] = useState("moderator");
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchAdminUsers({ query, status, page, pageSize }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "User listing failed.");
    } finally {
      setLoading(false);
    }
  }, [query, status, page]);

  useEffect(() => {
    void (async () => {
      try {
        const info = await fetchAdminMe();
        setMe({ role: info.role, userId: info.userId });
      } catch {
        setError("Could not verify your administrator role.");
      }
    })();
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const isSuperAdmin = me?.role === "super_admin";
  const confirmed = confirmText.trim().toUpperCase() === "CONFIRM";

  async function act(fn: () => Promise<unknown>, message: string) {
    setError("");
    try {
      await fn();
      setConfirm(null);
      setConfirmText("");
      setNotice(message);
      window.setTimeout(() => setNotice(""), 4000);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    }
  }

  return (
    <div className="space-y-4">
      <Panel className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Search" className="min-w-[220px] flex-1">
            <TextInput value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="email or user id" maxLength={100} />
          </Field>
          <Field label="Status" className="w-36">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </Select>
          </Field>
        </div>
        <p className="text-[12px] text-zinc-500" role="status">
          {loading ? "Loading…" : data ? `${data.users.length} shown · ${data.total} matched · ${data.authTotal} registered${data.authTotal >= 500 ? " (listing capped at 500)" : ""}` : ""}
          {me && <> · your role: <strong className="font-mono">{me.role}</strong></>}
          {!isSuperAdmin && <> · role management requires super-administrator</>}
        </p>
      </Panel>

      {error && !confirm && <ErrorCallout title="Action failed" message={error} hint="Server-side authorization and validation are authoritative." />}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</p>}

      <Panel className="overflow-hidden">
        <div className="max-h-[62vh] overflow-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th scope="col" className="px-3 py-2 font-bold">User</th>
                <th scope="col" className="px-3 py-2 font-bold">Status</th>
                <th scope="col" className="px-3 py-2 font-bold">Admin role</th>
                <th scope="col" className="px-3 py-2 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map((u) => {
                const self = u.id === me?.userId;
                return (
                  <tr key={u.id} className="border-t border-zinc-100 align-top transition hover:bg-zinc-50/70 dark:border-zinc-800/70 dark:hover:bg-zinc-900/50">
                    <td className="px-3 py-2.5">
                      <p className="font-semibold break-all">{u.email ?? <span className="text-zinc-400">no email</span>}{self && <span className="ml-1 rounded bg-zinc-100 px-1.5 text-[10px] font-bold uppercase dark:bg-zinc-800">(you)</span>}</p>
                      <p className="font-mono text-[11px] text-zinc-400">{u.id}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">joined {new Date(u.createdAt).toLocaleDateString()}{u.lastSignInAt ? ` · last sign-in ${new Date(u.lastSignInAt).toLocaleDateString()}` : " · never signed in"}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      {u.suspended
                        ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">suspended</span>
                        : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">active</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px]">{u.role ?? <span className="text-zinc-400">—</span>}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {u.suspended
                          ? <button type="button" disabled={self} onClick={() => setConfirm({ kind: "reactivate", user: u })} className="rounded-md border border-zinc-200 px-2 py-1 text-[12px] font-medium disabled:opacity-40 dark:border-zinc-700">Reactivate</button>
                          : <button type="button" disabled={self} onClick={() => setConfirm({ kind: "suspend", user: u })} className="rounded-md border border-zinc-200 px-2 py-1 text-[12px] font-medium text-amber-700 disabled:opacity-40 dark:border-zinc-700 dark:text-amber-400">Suspend</button>}
                        <button type="button" disabled={self} onClick={() => setConfirm({ kind: "revoke-access", user: u })} className="rounded-md border border-zinc-200 px-2 py-1 text-[12px] font-medium disabled:opacity-40 dark:border-zinc-700">Revoke sessions</button>
                        {isSuperAdmin && (
                          <>
                            <button type="button" disabled={self} onClick={() => { setRoleChoice(u.role ?? "moderator"); setConfirm({ kind: "role-assign", user: u }); }} className="rounded-md border border-zinc-200 px-2 py-1 text-[12px] font-medium disabled:opacity-40 dark:border-zinc-700">Set role</button>
                            {u.role && <button type="button" disabled={self} onClick={() => setConfirm({ kind: "role-revoke", user: u })} className="rounded-md border border-zinc-200 px-2 py-1 text-[12px] font-medium text-red-600 disabled:opacity-40 dark:border-zinc-700">Remove role</button>}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && (data?.users ?? []).length === 0 && (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-zinc-500">No users match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="flex items-center justify-between text-[13px]">
        <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="rounded-lg border border-zinc-200 px-3 py-1.5 font-medium disabled:opacity-40 dark:border-zinc-700">Previous</button>
        <span role="status">Page {page} of {totalPages}</span>
        <button type="button" onClick={() => setPage((p) => (p < totalPages ? p + 1 : p))} disabled={page >= totalPages || loading} className="rounded-lg border border-zinc-200 px-3 py-1.5 font-medium disabled:opacity-40 dark:border-zinc-700">Next</button>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Confirm administrative action">
          <Panel className="w-full max-w-md space-y-3">
            <h2 className="text-[15px] font-bold capitalize">{confirm.kind.replace("-", " ")}</h2>
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Target: <strong className="break-all">{confirm.user.email ?? confirm.user.id}</strong>
              {confirm.kind === "role-assign" && <> — role <strong className="font-mono">{roleChoice}</strong> grants administrative access.</>}
              {confirm.kind === "suspend" && <> — signs them out and blocks sign-in until reactivated.</>}
              {confirm.kind === "revoke-access" && <> — signs out all their active sessions now; they can sign in again.</>}
              {confirm.kind === "role-revoke" && <> — removes administrative access immediately.</>}
              {confirm.kind === "reactivate" && <> — restores normal sign-in.</>}
            </p>
            {confirm.kind === "role-assign" && (
              <Field label="Role">
                <Select value={roleChoice} onChange={(e) => setRoleChoice(e.target.value)}>
                  <option value="moderator">moderator (read-only)</option>
                  <option value="admin">admin (tools + users)</option>
                  <option value="super_admin">super_admin (roles + everything)</option>
                </Select>
              </Field>
            )}
            <Field label="Type CONFIRM to proceed" hint="Destructive administrative actions require typed confirmation.">
              <TextInput value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="CONFIRM" />
            </Field>
            {error && <ErrorCallout title="Action failed" message={error} hint="Nothing was changed. Correct the input and retry." />}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setConfirm(null); setConfirmText(""); setError(""); }} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] font-medium dark:border-zinc-700">Cancel</button>
              <button type="button" disabled={!confirmed || loading} onClick={() => {
                if (!confirm || !confirmed) return;
                const target = confirm.user.email ?? confirm.user.id;
                if (confirm.kind === "suspend") return void act(() => suspendUser(confirm.user.id), `${target} suspended.`);
                if (confirm.kind === "reactivate") return void act(() => reactivateUser(confirm.user.id), `${target} reactivated.`);
                if (confirm.kind === "revoke-access") return void act(() => revokeUserAccess(confirm.user.id), `Sessions revoked for ${target}.`);
                if (confirm.kind === "role-assign") return void act(() => setUserRole(confirm.user.id, roleChoice), `Role ${roleChoice} assigned to ${target}.`);
                return void act(() => revokeUserRole(confirm.user.id), `Role removed for ${target}.`);
              }} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900">Confirm</button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
