#!/usr/bin/env python3
"""Phase 6 WS B: Users tab UI (admin page + route classifier + API client).

Anchored, assertion-guarded edits. Run once from the repo root:

    python3 scripts/patch-phase6-users-ui-v1.py

Requires WS B endpoints applied (patch-phase6-users-v1.py) and WS A2
(/api/admin/me returns the real role).

Changes:
  src/lib/routes.ts      add "users" to ADMIN_SECTIONS
  src/platform/admin-api.ts  add fetchAdminUsers + action helpers + types
  src/pages/admin.tsx    add Users section (nav + render), real role state,
                         UsersManager component with typed confirmations
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent


def patch(rel, edits, append_text=None):
    path = ROOT / rel
    s = path.read_text(encoding="utf-8")
    changed = False
    for old, new in edits:
        count = s.count(old)
        if count == 1:
            s = s.replace(old, new, 1)
            print(f"  [{rel}] applied: {old.strip().splitlines()[0][:70]!r}")
            changed = True
        elif new in s:
            print(f"  [{rel}] already applied: {old.strip().splitlines()[0][:70]!r}")
        else:
            sys.exit(f"ANCHOR NOT FOUND or not unique ({count}x) in {rel}:\n{old}")
    if append_text is not None:
        if append_text.strip() in s:
            print(f"  [{rel}] append block already present")
        else:
            s = s.rstrip("\n") + "\n\n" + append_text.lstrip("\n")
            print(f"  [{rel}] appended UsersManager")
            changed = True
    if changed:
        path.write_text(s, encoding="utf-8")


# ---------------------------------------------------------------- routes.ts
patch("src/lib/routes.ts", [(
    'export const ADMIN_SECTIONS = ["overview", "tools", "categories", "analytics", "audit", "health"] as const;',
    'export const ADMIN_SECTIONS = ["overview", "tools", "categories", "users", "analytics", "audit", "health"] as const;',
)])

# ---------------------------------------------------------------- admin-api.ts
API_APPEND = '''/* ---------------- Phase 6: user management ---------------- */

export type AdminUser = {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  suspended: boolean;
  role: string | null;
};
export type AdminUsersPage = { users: AdminUser[]; total: number; authTotal: number; page: number; pageSize: number };

export async function fetchAdminUsers(params: { query?: string; status?: string; page?: number; pageSize?: number } = {}): Promise<AdminUsersPage> {
  const qs = new URLSearchParams();
  if (params.query) qs.set("query", params.query);
  if (params.status && params.status !== "all") qs.set("status", params.status);
  qs.set("page", String(params.page ?? 1));
  qs.set("pageSize", String(params.pageSize ?? 25));
  return apiFetch<AdminUsersPage>(`/api/admin/users?${qs.toString()}`);
}
export async function suspendUser(id: string): Promise<unknown> {
  return apiFetch(`/api/admin/users/${encodeURIComponent(id)}/suspend`, { method: "POST" });
}
export async function reactivateUser(id: string): Promise<unknown> {
  return apiFetch(`/api/admin/users/${encodeURIComponent(id)}/reactivate`, { method: "POST" });
}
export async function revokeUserAccess(id: string): Promise<unknown> {
  return apiFetch(`/api/admin/users/${encodeURIComponent(id)}/revoke-access`, { method: "POST" });
}
export async function setUserRole(id: string, role: string): Promise<unknown> {
  return apiFetch(`/api/admin/users/${encodeURIComponent(id)}/role`, { method: "PUT", body: JSON.stringify({ role }) });
}
export async function revokeUserRole(id: string): Promise<unknown> {
  return apiFetch(`/api/admin/users/${encodeURIComponent(id)}/role`, { method: "DELETE" });
}
'''
patch("src/platform/admin-api.ts", [], append_text=API_APPEND)

# ---------------------------------------------------------------- admin.tsx
ADMIN_EDITS = [
    # lucide icon import
    ("  Pencil, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Trash2, Upload, X,\n",
     "  Pencil, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Trash2, Upload, Users, X,\n"),
    # admin-api import block
    ('''import {
  exportRegistry, fetchAdminAnalytics, fetchAdminAudit, fetchAdminHealth, fetchAdminMe,
  fetchAdminRegistry, importRegistry, reorderTools, resetToolOverride, saveCategoryOverride,
  saveToolOverride, type AdminAnalytics, type AdminHealth, type AdminRegistry, type AuditEntry,
  type CategoryOverlay, type ToolOverlay,
} from "../platform/admin-api";''',
     '''import {
  exportRegistry, fetchAdminAnalytics, fetchAdminAudit, fetchAdminHealth, fetchAdminMe,
  fetchAdminRegistry, fetchAdminUsers, importRegistry, reactivateUser, reorderTools,
  resetToolOverride, revokeUserAccess, revokeUserRole, saveCategoryOverride, saveToolOverride,
  setUserRole, suspendUser, type AdminAnalytics, type AdminHealth, type AdminRegistry,
  type AdminUser, type AdminUsersPage, type AuditEntry, type CategoryOverlay, type ToolOverlay,
} from "../platform/admin-api";'''),
    # Section union
    ('type Section = "overview" | "tools" | "categories" | "analytics" | "audit" | "health";',
     'type Section = "overview" | "tools" | "categories" | "users" | "analytics" | "audit" | "health";'),
    # SECTIONS nav entry (after Categories)
    ('  { id: "categories", label: "Categories", icon: SlidersHorizontal, hint: "Grouping and display order" },',
     '''  { id: "categories", label: "Categories", icon: SlidersHorizontal, hint: "Grouping and display order" },
  { id: "users", label: "Users", icon: Users, hint: "Search, suspension, and roles (admin+)" },'''),
    # role state: keep the real role from admin/me
    ('  const [role, setRole] = useState<"unknown" | "admin" | "denied">("unknown");',
     '  const [role, setRole] = useState<"unknown" | "denied" | "moderator" | "admin" | "super_admin">("unknown");'),
    # load(): capture the real role
    ('''      await fetchAdminMe();
      setRole("admin");''',
     '''      const me = await fetchAdminMe();
      setRole(me.role === "moderator" || me.role === "admin" || me.role === "super_admin" ? me.role : "denied");'''),
    # render chain: add UsersManager
    (': section === "categories" ? <CategoryManager registry={registry} onSaved={refresh} onError={setError} />',
     ''': section === "categories" ? <CategoryManager registry={registry} onSaved={refresh} onError={setError} />
              : section === "users" ? <UsersManager />'''),
]

USERS_COMPONENT = '''/* ------------------------------ Users (Phase 6) ------------------------------ */

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
'''

patch("src/pages/admin.tsx", ADMIN_EDITS, append_text=USERS_COMPONENT)

print(
    "\nWS B UI patch complete. Gates: npx tsc --noEmit; npx tsx scripts/verify.ts; npm run test:server (100/0); npm run build"
)
