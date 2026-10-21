import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Bookmark, Gauge, KeyRound, LogOut, Settings, Shield, Star, Trash2, UserRound, Workflow as WorkflowIcon } from "lucide-react";
import { platform, type ApiKeyMetadata, type AuditLog, type Favorite, type Profile, type SavedPreset, type SavedWorkflow, type UsageSummary, type User } from "../platform";
import { useAuth } from "../platform/auth-context";
import { TOOL_MAP } from "../lib/registry";
import { WORKFLOW_TEMPLATES } from "../data/workflows";
import { INTEGRATIONS } from "../data/integrations";
import { Btn, Check, ErrorCallout, Field, Panel, Select, Stat, TextInput } from "../components/ui";
import { AccountUnavailable } from "./auth";
import { cn } from "../utils/cn";
import { getPrivacyPreferences, setPrivacyPreferences } from "../platform/privacy";

export type AccountSection = "dashboard" | "profile" | "favorites" | "workflows" | "presets" | "api-keys" | "usage" | "billing" | "security" | "settings";

const sections: { id: AccountSection; label: string; icon: typeof Gauge }[] = [
  { id: "dashboard", label: "Dashboard", icon: Gauge }, { id: "profile", label: "Profile", icon: UserRound },
  { id: "favorites", label: "Favorites", icon: Star }, { id: "workflows", label: "Workflows", icon: WorkflowIcon },
  { id: "presets", label: "Presets", icon: Bookmark }, { id: "security", label: "Security", icon: Shield }, { id: "settings", label: "Settings", icon: Settings },
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
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const user = auth.user;
    if (!user) return;
    setLoadingData(true); setError("");
    try {
      const [favoriteData, workflowData, presetData, recentData, profileData, usageData, auditData, keyData] = await Promise.all([
        platform.favorites.list(), platform.workflows.list(), platform.presets.list(), platform.recentTools.list(),
        platform.profile?.get() ?? null,
        platform.usage?.summary() ?? emptyUsage(),
        platform.audit?.list() ?? [],
        platform.apiKeys?.list() ?? [],
      ]);
      setFavorites(favoriteData); setWorkflows(workflowData); setPresets(presetData); setRecent(recentData.map((item) => item.toolId));
      setProfile(profileData ?? { userId: user.id, displayName: user.displayName ?? "", avatarUrl: user.avatarUrl ?? "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, locale: navigator.language, theme: "system", preferences: {} });
      setUsage(usageData); setAudit(auditData); setKeys(keyData);
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
              {section === "dashboard" && <DashboardSection name={profile?.displayName || auth.user.displayName || auth.user.email || "developer"} favorites={favorites} workflows={workflows} presets={presets} recent={recent} usage={usage} audit={audit} onNav={onNav} />}
              {section === "profile" && profile && <ProfileSection value={profile} email={auth.user.email ?? ""} emailVerified={auth.user.emailVerified} onSaved={load} />}
              {section === "favorites" && <FavoritesSection favorites={favorites} onNav={onNav} onChanged={load} />}
              {section === "workflows" && <WorkflowsSection workflows={workflows} onNav={onNav} onChanged={load} />}
              {section === "presets" && <PresetsSection presets={presets} onChanged={load} />}
              {section === "api-keys" && <ApiKeysSection userId={auth.user.id} keys={keys} onChanged={load} />}
              {section === "usage" && <UsageSection usage={usage} user={auth.user} />}
              {section === "billing" && <BillingSection plan={auth.user.planId} />}
              {section === "security" && <SettingsSection profile={profile} onNav={onNav} />}
              {section === "settings" && <SettingsSection profile={profile} onNav={onNav} />}
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

function DashboardSection({ name, favorites, workflows, presets, recent, usage, audit, onNav }: { name: string; favorites: Favorite[]; workflows: SavedWorkflow[]; presets: SavedPreset[]; recent: string[]; usage: UsageSummary; audit: AuditLog[]; onNav: (route: string) => void }) {
  return <div><h2 className="text-xl font-extrabold">Welcome back, {name}</h2><p className="mt-1 text-[13px] text-zinc-500">Real account activity for the current month. No tool inputs are tracked.</p>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Favorites" value={String(favorites.length)} /><Stat label="Workflows" value={String(workflows.length)} /><Stat label="Presets" value={String(presets.length)} /><Stat label="API requests" value={usage.apiRequests.toLocaleString()} /></div>
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <AccountBlock title="Recent tools" empty="Use a tool and it will appear here. No pasted content is saved.">{recent.map((id) => TOOL_MAP[id]).filter(Boolean).slice(0, 7).map((tool) => <button key={tool.id} type="button" onClick={() => onNav(tool.route)} className="flex w-full items-center justify-between border-b border-zinc-100 py-2 text-left text-[13px] font-medium last:border-0 dark:border-zinc-800"><span>{tool.name}</span><span className="text-zinc-400">Open →</span></button>)}</AccountBlock>
      <AccountBlock title="Account activity" empty="No account changes have been recorded yet.">{audit.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 border-b border-zinc-100 py-2 text-[12.5px] last:border-0 dark:border-zinc-800"><span className="capitalize">{item.action.replace(/_/g, " ")}</span><time className="font-mono text-[10.5px] text-zinc-400">{new Date(item.createdAt).toLocaleString()}</time></div>)}</AccountBlock>
    </div>
    {platform.merge && <LocalMergePanel />}
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
    <Panel className="border-red-200 p-5 dark:border-red-900"><h2 className="text-[14px] font-extrabold text-red-700 dark:text-red-300">Delete account</h2><p className="mt-1 text-[12.5px] text-zinc-500">Permanently removes the authentication identity and cascades user-owned profile, favorites, workflows, presets, keys and usage data. This cannot be undone.</p><Field label="Type DELETE to confirm" className="mt-3"><TextInput value={deleteText} onChange={(event) => setDeleteText(event.target.value)} /></Field><Btn variant="danger" className="mt-2" disabled={deleteText !== "DELETE"} onClick={() => { if (deleteText === "DELETE" && window.confirm("Permanently delete your DevUtils account?")) void platform.auth.deleteAccount().then(() => onNav("/")); }}>Delete account permanently</Btn></Panel>
  </div>;
}