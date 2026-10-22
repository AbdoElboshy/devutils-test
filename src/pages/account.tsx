import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Bookmark, Download, FolderOpen, Gauge, KeyRound, LogOut, Pin, Settings, Shield, Star, Trash2, Upload, UserRound, Workflow as WorkflowIcon } from "lucide-react";
import { platform, type ApiKeyMetadata, type AuditLog, type Collection, type CollectionItem, type Favorite, type PinnedTool, type Profile, type SavedPreset, type SavedWorkflow, type UsageSummary, type User } from "../platform";
import { useAuth } from "../platform/auth-context";
import { TOOL_MAP, type Tool } from "../lib/registry";
import { WORKFLOW_TEMPLATES } from "../data/workflows";
import { INTEGRATIONS } from "../data/integrations";
import { Btn, Check, ErrorCallout, Field, Panel, Select, Stat, TextInput } from "../components/ui";
import { AccountUnavailable } from "./auth";
import { cn } from "../utils/cn";
import { getPrivacyPreferences, setPrivacyPreferences } from "../platform/privacy";

export type AccountSection = "dashboard" | "profile" | "favorites" | "workflows" | "presets" | "api-keys" | "usage" | "billing" | "security" | "settings" | "collections";

const sections: { id: AccountSection; label: string; icon: typeof Gauge }[] = [
  { id: "dashboard", label: "Dashboard", icon: Gauge }, { id: "profile", label: "Profile", icon: UserRound },
  { id: "favorites", label: "Favorites", icon: Star }, { id: "workflows", label: "Workflows", icon: WorkflowIcon },
  { id: "presets", label: "Presets", icon: Bookmark }, { id: "collections", label: "Collections", icon: FolderOpen }, { id: "settings", label: "Settings", icon: Settings },
];

const emptyUsage = (): UsageSummary => ({ toolRuns: 0, workflowRuns: 0, apiRequests: 0, integrationCalls: 0, periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString() });

export function AccountPage({ section, onNav }: { section: AccountSection; onNav: (route: string) => void }) {
  const auth = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [usage, setUsage] = useState<UsageSummary>(emptyUsage);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [keys, setKeys] = useState<ApiKeyMetadata[]>([]);
  const [pinned, setPinned] = useState<PinnedTool[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const user = auth.user;
    if (!user) return;
    setLoadingData(true); setError("");
    try {
      const [favoriteData, workflowData, presetData, recentData, profileData, usageData, auditData, keyData, pinnedData, collectionsData] = await Promise.all([
        platform.favorites.list(), platform.workflows.list(), platform.presets.list(), platform.recentTools.list(),
        platform.profile?.get() ?? null,
        platform.usage?.summary() ?? emptyUsage(),
        platform.audit?.list() ?? [],
        platform.apiKeys?.list() ?? [],
        platform.pinned.list(), platform.collections.list(),
      ]);
      setFavorites(favoriteData); setWorkflows(workflowData); setPresets(presetData); setRecent(recentData.map((item) => item.toolId));
      setProfile(profileData ?? { userId: user.id, displayName: user.displayName ?? "", avatarUrl: user.avatarUrl ?? "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, locale: navigator.language, theme: "system", preferences: {} });
      setUsage(usageData); setAudit(auditData); setKeys(keyData); setPinned(pinnedData); setCollections(collectionsData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load account data."); }
    finally { setLoadingData(false); }
  // Depend on the stable identity, not the user object instance. Auth refreshes
  // may produce a new object for the same account and must not retrigger every
  // account request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id]);

  useEffect(() => { void load(); }, [load]);

  if (!auth.enabled) return <AccountUnavailable onNav={onNav} />;
  if (auth.loading) return <div className="mx-auto max-w-6xl px-4 py-20 text-center text-sm text-zinc-500">Checking your session…</div>;
  if (!auth.user) return <ProtectedAccountEmpty onNav={onNav} />;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-7 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[12px] font-bold uppercase tracking-wide text-emerald-600">Account</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight">{sections.find((item) => item.id === section)?.label ?? section.replace(/-/g, " ")}</h1></div>
        <div className="flex items-center gap-2"><span className="hidden text-right sm:block"><span className="block text-[12.5px] font-semibold">{auth.user.displayName || auth.user.email}</span><span className="block text-[11px] uppercase tracking-wide text-zinc-400">{auth.user.planId} plan</span></span><Btn variant="ghost" onClick={() => { void auth.signOut().then(() => onNav("/")); }}><LogOut size={14} /> Sign out</Btn></div>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[190px_1fr]">
        <nav className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1" aria-label="Account navigation">
          {sections.map((item) => <button key={item.id} type="button" onClick={() => onNav(item.id === "dashboard" ? "/account" : `/account/${item.id}`)} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition lg:w-full", section === item.id ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900")}><item.icon size={14} />{item.label}</button>)}
        </nav>
        <div className="min-w-0">
          {error && <div className="mb-3"><ErrorCallout title="Account data unavailable" message={error} hint="Your public tools and local inputs are unaffected." /></div>}
          {!auth.user.emailVerified && <UnverifiedBanner email={auth.user.email ?? ""} />}
          {loadingData ? <Panel className="p-6 text-sm text-zinc-500">Loading account data…</Panel> : (
            <>
              {section === "dashboard" && <><DashboardSection name={profile?.displayName || auth.user.displayName || auth.user.email || "developer"} favorites={favorites} workflows={workflows} presets={presets} recent={recent} pinned={pinned} usage={usage} audit={audit} onNav={onNav} onReload={load} /><DashboardCharts favorites={favorites} usage={usage} onNav={onNav} /></>}
              {section === "profile" && profile && <ProfileSection value={profile} email={auth.user.email ?? ""} emailVerified={auth.user.emailVerified} onSaved={load} />}
              {section === "favorites" && <FavoritesSection favorites={favorites} onNav={onNav} onChanged={load} />}
              {section === "workflows" && <WorkflowsSection workflows={workflows} onNav={onNav} onChanged={load} />}
              {section === "presets" && <PresetsSection presets={presets} onChanged={load} />}
              {section === "collections" && <CollectionsSection collections={collections} onReload={load} />}
              {section === "api-keys" && <ApiKeysSection userId={auth.user.id} keys={keys} onChanged={load} />}
              {section === "usage" && <UsageSection usage={usage} user={auth.user} />}
              {section === "billing" && <BillingSection plan={auth.user.planId} />}
              {(section === "security" || section === "settings") && <SettingsSection profile={profile} onNav={onNav} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProtectedAccountEmpty({ onNav }: { onNav: (route: string) => void }) {
  return <div className="mx-auto w-full max-w-lg px-4 py-20 text-center"><Shield size={28} className="mx-auto text-zinc-400" /><h1 className="mt-3 text-2xl font-extrabold">Sign in required</h1><p className="mt-2 text-sm text-zinc-500">This route contains private account data. Public tools remain available without signing in.</p><div className="mt-5 flex justify-center gap-2"><Btn variant="primary" onClick={() => onNav("/login")}>Sign in</Btn><Btn onClick={() => onNav("/tools")}>Public tools</Btn></div></div>;
}

function DashboardSection({ name, favorites, workflows, presets, recent, pinned, usage, audit, onNav, onReload }: { name: string; favorites: Favorite[]; workflows: SavedWorkflow[]; presets: SavedPreset[]; recent: string[]; pinned: PinnedTool[]; usage: UsageSummary; audit: AuditLog[]; onNav: (route: string) => void; onReload: () => Promise<void> }) {
  return <div><h2 className="text-xl font-extrabold">Welcome back, {name}</h2><p className="mt-1 text-[13px] text-zinc-500">Real account activity for the current month. No tool inputs are tracked.</p>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Favorites" value={String(favorites.length)} /><Stat label="Workflows" value={String(workflows.length)} /><Stat label="Presets" value={String(presets.length)} /><Stat label="API requests" value={usage.apiRequests.toLocaleString()} /></div>
    <PinnedToolsPanel pinned={pinned} onNav={onNav} onReload={onReload} />
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <AccountBlock title="Recent tools" empty="Use a tool and it will appear here. No pasted content is saved.">{recent.map((id) => TOOL_MAP[id]).filter(Boolean).slice(0, 7).map((tool) => <button key={tool.id} type="button" onClick={() => onNav(tool.route)} className="flex w-full items-center justify-between border-b border-zinc-100 py-2 text-left text-[13px] font-medium last:border-0 dark:border-zinc-800"><span>{tool.name}</span><span className="text-zinc-400">Open →</span></button>)}</AccountBlock>
      <AccountBlock title="Account activity" empty="No account changes have been recorded yet.">{audit.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 border-b border-zinc-100 py-2 text-[12.5px] last:border-0 dark:border-zinc-800"><span className="capitalize">{item.action.replace(/_/g, " ")}</span><time className="font-mono text-[10.5px] text-zinc-400">{new Date(item.createdAt).toLocaleString()}</time></div>)}</AccountBlock>
    </div>
    {platform.merge && <LocalMergePanel />}
  </div>;
}

function PinnedToolsPanel({ pinned, onNav, onReload }: { pinned: PinnedTool[]; onNav: (route: string) => void; onReload: () => Promise<void> }) {
  const [toolId, setToolId] = useState("");
  const [message, setMessage] = useState("");
  const entries: Array<{ tool: Tool; sortOrder: number }> = [];
  pinned.forEach((item) => { const tool = TOOL_MAP[item.toolId]; if (tool) entries.push({ tool, sortOrder: item.sortOrder }); });
  entries.sort((a, b) => a.sortOrder - b.sortOrder);
  const ids = entries.map((entry) => entry.tool.id);
  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    const next = ids.slice();
    [next[index], next[target]] = [next[target], next[index]];
    await platform.pinned.reorder(next);
    await onReload();
  };
  const pin = async () => {
    if (!toolId) { setMessage("Choose a tool to pin."); return; }
    try { await platform.pinned.pin(toolId); setToolId(""); setMessage(""); await onReload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not pin the tool."); }
  };
  const unpin = async (id: string) => {
    try { await platform.pinned.unpin(id); await onReload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not unpin the tool."); }
  };
  return (
    <Panel className="p-4">
      <h3 className="text-[13px] font-bold">Pinned tools</h3>
      <div className="mt-2">
        {entries.length === 0 && <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-[12.5px] text-zinc-500 dark:border-zinc-700">No pinned tools yet. Pin your most-used tools below to keep them one click away.</p>}
        {entries.map((entry, index) => (
          <div key={entry.tool.id} className="flex items-center justify-between gap-2 border-b border-zinc-100 py-2 text-[13px] font-medium last:border-0 dark:border-zinc-800">
            <button type="button" onClick={() => onNav(entry.tool.route)} className="text-left hover:text-emerald-700 dark:hover:text-emerald-300">{entry.tool.name}</button>
            <span className="flex items-center gap-1">
              <button type="button" aria-label={"Move " + entry.tool.name + " up"} disabled={index === 0} onClick={() => { void move(index, -1); }} className="rounded-md px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-900">&uarr;</button>
              <button type="button" aria-label={"Move " + entry.tool.name + " down"} disabled={index === entries.length - 1} onClick={() => { void move(index, 1); }} className="rounded-md px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-900">&darr;</button>
              <button type="button" aria-label={"Unpin " + entry.tool.name} onClick={() => { void unpin(entry.tool.id); }} className="rounded-md px-1.5 py-0.5 text-zinc-400 hover:text-red-600">&#10005;</button>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <Select value={toolId} onChange={(event) => setToolId(event.target.value)}>
          <option value="">Choose a tool&hellip;</option>
          {Object.values(TOOL_MAP).map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}
        </Select>
        <Btn onClick={() => { void pin(); }} disabled={!toolId}><Pin size={13} /> Pin tool</Btn>
      </div>
      {message && <p className="mt-2 text-[12px] text-red-600">{message}</p>}
    </Panel>
  );
}

function CollectionsSection({ collections, onReload }: { collections: Collection[]; onReload: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [toolId, setToolId] = useState("");

useEffect(() => {
    if (openId) { void platform.collections.items(openId).then(setItems).catch(() => setItems([])); }
    else setItems([]);
  }, [openId]);

const create = async () => {
    if (!name.trim()) { setMessage("Collection name is required."); return; }
    try { await platform.collections.create({ name: name.trim(), description: description.trim() }); setName(""); setDescription(""); setMessage("Collection created."); await onReload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not create the collection."); }
  };
  const remove = async (id: string) => {
    if (!window.confirm("Delete this collection and its items?")) return;
    try { await platform.collections.remove(id); if (openId === id) setOpenId(null); setMessage("Collection deleted."); await onReload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete the collection."); }
  };
  const addItem = async () => {
    if (!openId || !toolId) { setMessage("Pick a tool to add."); return; }
    try { await platform.collections.addItem(openId, "tool", toolId); setItems(await platform.collections.items(openId)); setMessage("Tool added."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not add the tool."); }
  };
  const removeItem = async (targetId: string) => {
    if (!openId) return;
    try { await platform.collections.removeItem(openId, targetId); setItems(await platform.collections.items(openId)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not remove the item."); }
  };

return <div className="space-y-4">
    <Panel className="p-5"><h2 className="text-[14px] font-extrabold">New collection</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Collection name (required, unique)" />
        <TextInput value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" />
      </div>
      <Btn className="mt-2" onClick={() => { void create(); }}>Create collection</Btn>
      {message && <p className="mt-3 text-[12.5px] text-emerald-600">{message}</p>}
    </Panel>
    {collections.length === 0 && <Panel className="p-6 text-center text-[13px] text-zinc-500">No collections yet. Group your favorite tools into named collections above.</Panel>}
    {collections.map((collection) => (
      <Panel key={collection.id} className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <button type="button" onClick={() => setOpenId(openId === collection.id ? null : collection.id)} className="text-left text-[14px] font-bold hover:text-emerald-700 dark:hover:text-emerald-300">{collection.name}</button>
            {collection.description && <p className="mt-0.5 text-[12.5px] text-zinc-500">{collection.description}</p>}
            <p className="mt-0.5 text-[11px] text-zinc-400">Updated {new Date(collection.updatedAt).toLocaleDateString()}</p>
          </div>
          <div className="flex items-center gap-2">
            <Btn variant="ghost" onClick={() => setOpenId(openId === collection.id ? null : collection.id)}>{openId === collection.id ? "Hide items" : "Show items"}</Btn>
            <Btn variant="danger" onClick={() => { void remove(collection.id); }}><Trash2 size={13} /> Delete</Btn>
          </div>
        </div>
        {openId === collection.id && (
          <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <div className="space-y-1">
              {items.length === 0 && <p className="text-[12.5px] text-zinc-500">No items yet.</p>}
              {items.map((item) => {
                const tool = TOOL_MAP[item.targetId];
                return <div key={item.targetId} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="font-medium">{tool ? tool.name : item.targetId}<span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] uppercase text-zinc-400 dark:bg-zinc-800">{item.kind}</span></span>
                  <button type="button" onClick={() => { void removeItem(item.targetId); }} className="text-zinc-400 hover:text-red-600">Remove</button>
                </div>;
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Select value={toolId} onChange={(event) => setToolId(event.target.value)}>
                <option value="">Add a tool&hellip;</option>
                {Object.values(TOOL_MAP).map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}
              </Select>
              <Btn onClick={() => { void addItem(); }} disabled={!toolId}>Add to collection</Btn>
            </div>
          </div>
        )}
      </Panel>
    ))}
  </div>;
}

function UnverifiedBanner({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const resend = async () => {
    setState("busy");
    try { await platform.auth.resendVerification(email, ""); setState("sent"); }
    catch { setState("error"); }
  };
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 dark:border-amber-900 dark:bg-amber-950/30">
      <AlertTriangle size={17} className="shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-amber-900 dark:text-amber-200">
        <strong className="font-bold">Email not verified.</strong>{" "}
        {state === "sent" ? "A new verification email is on its way. Check your inbox and spam folder." : "Some account features stay limited until you confirm your address."}
      </p>
      {state !== "sent" && <Btn onClick={() => { void resend(); }} disabled={state === "busy"}>{state === "busy" ? "Sending…" : "Resend email"}</Btn>}
      {state === "error" && <span className="w-full text-[12px] text-red-600">Could not send. Try again shortly.</span>}
    </div>
  );
}

function AccountBlock({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <Panel className="p-4"><h3 className="text-[13px] font-bold">{title}</h3><div className="mt-2">{hasChildren ? children : <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-[12.5px] text-zinc-500 dark:border-zinc-700">{empty}</p>}</div></Panel>;
}

function LocalMergePanel() {
  const [preview, setPreview] = useState<{ favorites: number; recentTools: number; workflows: number; presets: number } | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { void platform.merge?.preview().then(setPreview); }, []);
  if (!preview || preview.favorites + preview.recentTools + preview.workflows + preview.presets === 0) return null;
  return <Panel className="mt-4 p-4"><h3 className="text-[13px] font-bold">Local data found on this device</h3><p className="mt-1 text-[12.5px] text-zinc-500">{preview.favorites} favorites · {preview.recentTools} recent tools · {preview.workflows} workflows · {preview.presets} presets. Merge is additive and never overwrites cloud records.</p><Btn className="mt-3" onClick={() => { void platform.merge?.merge().then((count) => setMessage(`Merged ${count.favorites + count.recentTools + count.workflows + count.presets} local records.`)).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Merge failed.")); }}>Review and merge into account</Btn>{message && <p className="mt-2 text-[12px] text-emerald-600">{message}</p>}</Panel>;
}

function ProfileSection({ value, email, emailVerified: _emailVerified, onSaved }: { value: Profile; email: string; emailVerified: boolean; onSaved: () => Promise<void> }) {
  const [profile, setProfile] = useState(value); const [nextEmail, setNextEmail] = useState(email); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); setError(""); setMessage(""); try { if (!platform.profile) throw new Error("Profile backend unavailable."); await platform.profile.save(profile); await platform.auth.updateProfileMetadata({ displayName: profile.displayName ?? "", avatarUrl: profile.avatarUrl }); if (nextEmail !== email) await platform.auth.updateEmail(nextEmail); try { localStorage.setItem("du:theme", JSON.stringify(profile.theme ?? "system")); } catch { /* noop */ } await onSaved(); setMessage(nextEmail !== email ? "Profile saved. Confirm your new email address to complete the email change." : "Profile saved."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save profile."); } finally { setBusy(false); } };
  return <Panel className="p-5"><h2 className="text-[15px] font-extrabold">Profile</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Name"><TextInput value={profile.displayName ?? ""} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} /></Field><Field label="Email"><TextInput type="email" value={nextEmail} onChange={(event) => setNextEmail(event.target.value)} /></Field><Field label="Avatar URL" hint="Use an HTTPS image URL. File uploads are not configured."><TextInput value={profile.avatarUrl ?? ""} onChange={(event) => setProfile({ ...profile, avatarUrl: event.target.value })} /></Field><Field label="Timezone"><TextInput value={profile.timezone ?? "UTC"} onChange={(event) => setProfile({ ...profile, timezone: event.target.value })} /></Field><Field label="Locale"><TextInput value={profile.locale ?? "en"} onChange={(event) => setProfile({ ...profile, locale: event.target.value })} /></Field><Field label="Theme"><Select value={profile.theme ?? "system"} onChange={(event) => setProfile({ ...profile, theme: event.target.value as Profile["theme"] })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></Select></Field></div>{error && <div className="mt-3"><ErrorCallout title="Cannot save profile" message={error} /></div>}{message && <p className="mt-3 text-[13px] text-emerald-600">{message}</p>}<Btn variant="primary" className="mt-4" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save profile"}</Btn></Panel>;
}

function FavoritesSection({ favorites, onNav, onChanged }: { favorites: Favorite[]; onNav: (route: string) => void; onChanged: () => Promise<void> }) {
  return <AccountBlock title="Synced favorites" empty="Favorite a public tool, toolkit, workflow or integration to see it here.">{favorites.map((favorite) => { const tool = favorite.kind === "tool" ? TOOL_MAP[favorite.targetId] : null; const workflow = favorite.kind === "workflow" ? WORKFLOW_TEMPLATES.find((item) => item.id === favorite.targetId) : null; const integration = favorite.kind === "integration" ? INTEGRATIONS.find((item) => item.id === favorite.targetId) : null; const route = tool?.route ?? (workflow ? "/workflows" : integration ? "/integrations" : `/categories/${favorite.targetId}`); return <div key={favorite.id} className="flex items-center gap-2 border-b border-zinc-100 py-2.5 last:border-0 dark:border-zinc-800"><Star size={14} className="text-amber-400" fill="currentColor" /><button type="button" onClick={() => onNav(route)} className="min-w-0 flex-1 text-left text-[13px] font-semibold">{tool?.name ?? workflow?.name ?? integration?.name ?? favorite.targetId}<span className="ml-2 text-[10px] uppercase text-zinc-400">{favorite.kind}</span></button><Btn variant="ghost" className="px-2 py-1" onClick={() => { void platform.favorites.toggle(favorite.kind, favorite.targetId).then(() => onChanged()); }}><Trash2 size={13} /></Btn></div>; })}</AccountBlock>;
}

function WorkflowsSection({ workflows, onNav, onChanged }: { workflows: SavedWorkflow[]; onNav: (route: string) => void; onChanged: () => Promise<void> }) {
  return <AccountBlock title="Saved workflows" empty="Save a workflow from the workflow library to sync it here.">{workflows.map((workflow) => <div key={workflow.id} className="flex items-center gap-3 border-b border-zinc-100 py-3 last:border-0 dark:border-zinc-800"><WorkflowIcon size={15} className="text-emerald-500" /><button type="button" onClick={() => onNav("/workflows")} className="min-w-0 flex-1 text-left"><span className="block text-[13px] font-semibold">{workflow.name}</span><span className="block text-[11.5px] text-zinc-500">{workflow.steps.length} steps · updated {new Date(workflow.updatedAt).toLocaleDateString()}</span></button><Btn variant="ghost" className="px-2 py-1" onClick={() => { void platform.workflows.remove(workflow.id).then(() => onChanged()); }}><Trash2 size={13} /></Btn></div>)}</AccountBlock>;
}

function PresetsSection({ presets, onChanged }: { presets: SavedPreset[]; onChanged: () => Promise<void> }) {
  return <AccountBlock title="Saved presets" empty="Save non-sensitive tool configuration from a supported tool to sync it here.">{presets.map((preset) => <div key={preset.id} className="flex items-center gap-3 border-b border-zinc-100 py-3 last:border-0 dark:border-zinc-800"><Bookmark size={15} className="text-emerald-500" /><div className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{preset.name}</span><span className="block text-[11.5px] text-zinc-500">{TOOL_MAP[preset.toolId]?.name ?? preset.toolId} · {Object.keys(preset.config).length} configuration values</span></div><Btn variant="ghost" className="px-2 py-1" onClick={() => { void platform.presets.remove(preset.id).then(() => onChanged()); }}><Trash2 size={13} /></Btn></div>)}</AccountBlock>;
}

function ApiKeysSection({ userId, keys, onChanged }: { userId: string; keys: ApiKeyMetadata[]; onChanged: () => Promise<void> }) {
  const [name, setName] = useState(""); const [scopes, setScopes] = useState<ApiKeyMetadata["scopes"]>(["tools:execute"]); const [secret, setSecret] = useState(""); const [error, setError] = useState("");
  const create = async () => { setError(""); setSecret(""); try { if (!platform.apiKeys) throw new Error("API-key backend unavailable."); const result = await platform.apiKeys.create({ userId, name: name.trim(), scopes }); setSecret(result.secret); setName(""); await onChanged(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create key."); } };
  const toggle = (scope: ApiKeyMetadata["scopes"][number]) => setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  return <div className="space-y-4"><Panel className="p-4"><h2 className="text-[14px] font-extrabold">Create API key</h2><p className="mt-1 text-[12px] text-zinc-500">The full key is returned once. Only its SHA-256 hash is stored server-side.</p><div className="mt-3 flex flex-wrap items-end gap-2"><Field label="Name" className="min-w-48 flex-1"><TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="dev-machine" maxLength={100} /></Field>{(["tools:read", "tools:execute", "workflows:execute"] as const).map((scope) => <Check key={scope} label={scope} checked={scopes.includes(scope)} onChange={() => toggle(scope)} />)}<Btn variant="primary" onClick={create} disabled={!name.trim() || !scopes.length}>Create key</Btn></div>{error && <div className="mt-3"><ErrorCallout title="Cannot create key" message={error} /></div>}{secret && <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30"><p className="text-[12px] font-bold text-amber-800 dark:text-amber-200">Copy this key now. It cannot be displayed again.</p><code className="mt-2 block break-all rounded-lg bg-white p-2 font-mono text-[12px] dark:bg-zinc-950">{secret}</code></div>}</Panel><AccountBlock title="API keys" empty="No API keys yet.">{keys.map((key) => <div key={key.id} className="flex items-center gap-3 border-b border-zinc-100 py-3 last:border-0 dark:border-zinc-800"><KeyRound size={15} className="text-zinc-400" /><div className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{key.name} <code className="ml-1 font-mono text-[10px] text-zinc-400">{key.prefix}…</code></span><span className="block text-[11.5px] text-zinc-500">Created {new Date(key.createdAt).toLocaleDateString()} · Last used {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "never"} · {key.revokedAt ? "revoked" : key.scopes.join(", ")}</span></div>{!key.revokedAt && <Btn variant="danger" className="py-1" onClick={() => { if (platform.apiKeys && confirm(`Revoke ${key.name}?`)) void platform.apiKeys.revoke(key.id).then(() => onChanged()); }}>Revoke</Btn>}</div>)}</AccountBlock></div>;
}

function UsageSection({ usage, user }: { usage: UsageSummary; user: User }) {
  const apiLimit = platform.capabilities.getLimit(user, "api_requests_per_month");
  return <Panel className="p-5"><h2 className="text-[15px] font-extrabold">Usage since {new Date(usage.periodStart).toLocaleDateString()}</h2><p className="mt-1 text-[12.5px] text-zinc-500">Only operation names, IDs, counts and timestamps are recorded. Inputs and outputs are excluded.</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Tool runs" value={usage.toolRuns.toLocaleString()} /><Stat label="Workflow runs" value={usage.workflowRuns.toLocaleString()} /><Stat label="API requests" value={`${usage.apiRequests.toLocaleString()} / ${apiLimit ?? "∞"}`} /><Stat label="Integration calls" value={usage.integrationCalls.toLocaleString()} /></div></Panel>;
}

function BillingSection({ plan }: { plan: string }) {
  return <Panel className="p-5"><h2 className="text-[15px] font-extrabold">Plan and billing</h2><p className="mt-2 text-[13px]">Current plan: <span className="rounded bg-emerald-100 px-2 py-1 font-semibold capitalize text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{plan}</span></p><p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-4 text-[13px] leading-relaxed text-zinc-500 dark:border-zinc-700">No billing provider is configured, so DevUtils does not present checkout, cancellation, pricing, or upgrade actions that cannot work. The provider-independent subscription and entitlement models are ready for a later billing integration.</p></Panel>;
}

function SettingsSection({ profile, onNav }: { profile: Profile | null; onNav: (route: string) => void }) {
  const auth = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleteText, setDeleteText] = useState("");
  const [message, setMessage] = useState("");
  const [privacy, setPrivacy] = useState(getPrivacyPreferences);
  const [theme, setTheme] = useState<"light" | "dark" | "system">(profile?.theme ?? "system");
  const [session, setSession] = useState<{ createdAt: string | null; expiresAt: string | null } | null>(null);
  useEffect(() => { void platform.auth.getSession().then(setSession); }, []);
  const [busy, setBusy] = useState(false);
  const changePassword = async () => {
    if (busy) return;
    if (password.length < 10 || password !== confirmPassword) { setMessage("Use at least 10 characters and make both passwords match."); return; }
    setBusy(true);
    try {
      await platform.auth.updatePassword(password);
      setPassword(""); setConfirmPassword("");
      // The gateway revokes all sessions after a password change, so the current
      // session is no longer valid. Route to login with a clear notice instead of
      // leaving the user on an account page whose next request would 401.
      try { sessionStorage.setItem("du:auth:notice", "Password updated. All sessions were signed out for security — sign in again."); } catch { /* private mode */ }
      onNav("/login");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Password update failed."); }
    finally { setBusy(false); }
  };
  const [portMessage, setPortMessage] = useState("");
  const exportData = async () => {
    setPortMessage("");
    try {
      const [favoriteRows, workflowRows, presetRows, pinnedRows, collectionRows] = await Promise.all([
        platform.favorites.list(), platform.workflows.list(), platform.presets.list(), platform.pinned.list(), platform.collections.list(),
      ]);
      const collectionsWithItems = await Promise.all(collectionRows.map(async (collection) => ({ ...collection, items: await platform.collections.items(collection.id) })));
      const payload = { format: "devutils-export", version: 1, exportedAt: new Date().toISOString(), favorites: favoriteRows, workflows: workflowRows, presets: presetRows, pinned: pinnedRows, collections: collectionsWithItems };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "devutils-export.json";
      link.click();
      URL.revokeObjectURL(url);
      setPortMessage("Export downloaded as devutils-export.json.");
    } catch (error) { setPortMessage(error instanceof Error ? error.message : "Export failed."); }
  };
  const importData = async (file: File | null) => {
    if (!file) return;
    setPortMessage("");
    try {
      const raw = JSON.parse(await file.text()) as {
        favorites?: Array<{ kind?: unknown; targetId?: unknown }>;
        workflows?: Array<Record<string, unknown>>;
        presets?: Array<Record<string, unknown>>;
        pinned?: Array<{ toolId?: unknown }>;
        collections?: Array<Record<string, unknown>>;
      };
      let imported = 0;
      const existingFavorites = await platform.favorites.list();
      const knownFavorites = new Set(existingFavorites.map((item) => item.kind + ":" + item.targetId));
      for (const favorite of raw.favorites ?? []) {
        if (typeof favorite.kind !== "string" || typeof favorite.targetId !== "string") continue;
        if (!["tool", "toolkit", "workflow", "integration"].includes(favorite.kind)) continue;
        if (knownFavorites.has(favorite.kind + ":" + favorite.targetId)) continue;
        await platform.favorites.toggle(favorite.kind as Favorite["kind"], favorite.targetId);
        imported += 1;
      }
      for (const workflow of raw.workflows ?? []) {
        if (typeof workflow.id !== "string" || !Array.isArray(workflow.steps)) continue;
        await platform.workflows.save(workflow as unknown as SavedWorkflow);
        imported += 1;
      }
      for (const preset of raw.presets ?? []) {
        if (typeof preset.id !== "string" || typeof preset.toolId !== "string" || typeof preset.config !== "object" || !preset.config) continue;
        await platform.presets.save(preset as unknown as SavedPreset);
        imported += 1;
      }
      for (const item of raw.pinned ?? []) {
        if (typeof item.toolId !== "string") continue;
        await platform.pinned.pin(item.toolId);
        imported += 1;
      }
      for (const collection of raw.collections ?? []) {
        if (typeof collection.name !== "string" || !collection.name) continue;
        try {
          const created = await platform.collections.create({ name: String(collection.name).slice(0, 60), description: typeof collection.description === "string" ? collection.description.slice(0, 200) : undefined });
          const entries = Array.isArray(collection.items) ? collection.items : [];
          for (const entry of entries) {
            if (typeof entry !== "object" || entry === null) continue;
            const kind = (entry as { kind?: unknown }).kind;
            const targetId = (entry as { targetId?: unknown }).targetId;
            if (typeof kind !== "string" || typeof targetId !== "string") continue;
            if (!["tool", "toolkit", "workflow", "integration"].includes(kind)) continue;
            await platform.collections.addItem(created.id, kind as Favorite["kind"], targetId);
          }
          imported += 1;
        } catch { /* duplicate or invalid collection: skip and keep going */ }
      }
      setPortMessage("Imported " + imported + " records.");
    } catch (error) {
      setPortMessage(error instanceof Error ? error.message : "Import failed. The file must be a DevUtils export.");
    }
  };

  const savePreferences = async () => {
    setPrivacyPreferences(privacy);
    try { localStorage.setItem("du:theme", JSON.stringify(theme)); } catch { /* noop */ }
    document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches));
    if (profile && platform.profile) await platform.profile.save({ ...profile, theme });
    setMessage("Appearance and privacy preferences saved.");
  };
  return <div className="space-y-4">
    <Panel className="p-5"><h2 className="text-[14px] font-extrabold">Appearance</h2><Field label="Theme" className="mt-3"><Select value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></Select></Field></Panel>
    <Panel className="p-5"><div className="flex items-center justify-between gap-2"><h2 className="text-[14px] font-extrabold">Security and sessions</h2><span className={`rounded-full px-2 py-1 text-[10.5px] font-semibold ${auth.user?.emailVerified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{auth.user?.emailVerified ? "Email verified" : "Verification required"}</span></div>
      {session && <div className="mt-3 grid gap-2 sm:grid-cols-2"><Stat label="Current session started" value={session.createdAt ? new Date(session.createdAt).toLocaleString() : "Unknown"} /><Stat label="Access token expires" value={session.expiresAt ? new Date(session.expiresAt).toLocaleString() : "Managed automatically"} /></div>}
      <div className="mt-3 flex flex-wrap gap-2"><Btn onClick={() => { void auth.signOut("others").then(() => setMessage("Other sessions revoked.")); }}>Revoke other sessions</Btn><Btn variant="danger" onClick={() => { void auth.signOut("global").then(() => onNav("/")); }}>Sign out all devices</Btn></div>
      <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800"><p className="text-[13px] font-bold">Change password</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><TextInput type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" /><TextInput type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" /></div><Btn className="mt-2" onClick={changePassword} disabled={busy}>{busy ? "Updating…" : "Update password"}</Btn></div>
      {message && <p className="mt-3 text-[12.5px] text-emerald-600">{message}</p>}
    </Panel>
    <Panel className="p-5"><h2 className="text-[14px] font-extrabold">Privacy</h2><p className="mt-1 text-[13px] leading-relaxed text-zinc-500">Sensitive tool input is never synced. Account storage includes IDs, safe preset configuration, workflow definitions and privacy-safe usage counts only.</p><div className="mt-3 flex flex-wrap gap-2"><Check label="Remember recent tool IDs" checked={privacy.recentHistory} onChange={(value) => setPrivacy({ ...privacy, recentHistory: value })} /><Check label="Allow privacy-safe product analytics if configured" checked={privacy.analytics} onChange={(value) => setPrivacy({ ...privacy, analytics: value })} /></div><p className="mt-2 text-[12px] text-zinc-400">No analytics provider is currently configured. This preference never permits tool inputs to be collected.</p><Btn className="mt-3" onClick={() => { void savePreferences(); }}>Save preferences</Btn><Btn variant="ghost" className="mt-3" onClick={() => { void platform.recentTools.clear().then(() => setMessage("Recent tool IDs cleared.")); }}>Clear recent tool IDs</Btn></Panel>
        <Panel className="p-5"><h2 className="text-[14px] font-extrabold">Data portability</h2><p className="mt-1 text-[13px] leading-relaxed text-zinc-500">Export your favorites, workflows, presets, pinned tools and collections as JSON, or import a previous export. Tool inputs are never included.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Btn onClick={() => { void exportData(); }}><Download size={13} /> Export data</Btn>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
          <Upload size={13} /> Import JSON
          <input type="file" accept="application/json" className="hidden" onChange={(event) => { void importData(event.target.files ? event.target.files[0] : null); }} />
        </label>
      </div>
      {portMessage && <p className="mt-3 text-[12.5px] text-emerald-600">{portMessage}</p>}
    </Panel>
    <Panel className="border-red-200 p-5 dark:border-red-900"><h2 className="text-[14px] font-extrabold text-red-700 dark:text-red-300">Delete account</h2><p className="mt-1 text-[12.5px] text-zinc-500">Permanently removes the authentication identity and cascades user-owned profile, favorites, workflows, presets, keys and usage data. This cannot be undone.</p><Field label="Type DELETE to confirm" className="mt-3"><TextInput value={deleteText} onChange={(event) => setDeleteText(event.target.value)} /></Field><Btn variant="danger" className="mt-2" disabled={deleteText !== "DELETE"} onClick={() => { if (deleteText === "DELETE" && window.confirm("Permanently delete your DevUtils account?")) void platform.auth.deleteAccount().then(() => onNav("/")); }}>Delete account permanently</Btn></Panel>
  </div>;
}
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
