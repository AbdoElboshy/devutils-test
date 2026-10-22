#!/usr/bin/env python3
"""Phase 6 WS B: user management endpoints for the gateway.

Anchored, assertion-guarded insertion into server/index.mjs. Run once:

    python3 scripts/patch-phase6-users-v1.py

Inserts a block of endpoints immediately BEFORE the /api 404 catch-all.
Requires: WS A2 applied (requireRole, adminRoleOf, adminCache of roles) and
migration 202610220001_admin_roles_flags_history.sql applied.

New endpoints (all under the existing /api/admin middleware stack):
  GET    /api/admin/users                      requireRole("admin")
         ?query=&status=all|active|suspended&page=&pageSize=
  POST   /api/admin/users/:id/suspend          requireRole("admin")
  POST   /api/admin/users/:id/reactivate       requireRole("admin")
  POST   /api/admin/users/:id/revoke-access    requireRole("admin")
  PUT    /api/admin/users/:id/role             requireRole("super_admin")  body {role}
  DELETE /api/admin/users/:id/role              requireRole("super_admin")

Guards:
  * No self-moderation (suspend/reactivate/revoke/role on your own id -> 400).
  * Ordinary admins cannot suspend/revoke a super_admin (403).
  * Role changes invalidate adminCache for the target immediately.
  * Every action writes an audit log entry via recordAdminAuditOrRespond.

Suspension uses the Supabase Auth admin API (ban_duration 100y ~= indefinite;
reactivate clears with ban_duration "none"). Sessions are revoked with
auth.admin.signOut(userId).
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent


def replace_once(text, rel, old, new):
    count = text.count(old)
    if count == 1:
        return text.replace(old, new, 1)
    if old in text or new in text:
        print("  already applied — nothing to do")
        return text
    sys.exit(f"ANCHOR NOT FOUND or not unique ({count}x) in {rel}:\n{old}")


BLOCK = r'''/* ------------------------------------------------------------------ *
 * Phase 6 — user management (WS B)
 * ------------------------------------------------------------------ */

const AUTH_BAN_INDEFINITE = "876000h"; // 100 years: treated as an indefinite ban.

async function loadActiveAdminRoles() {
  const r = await service.from("admin_users").select("user_id,role,revoked_at");
  if (r.error) throw r.error;
  const map = new Map();
  for (const row of r.data ?? []) if (!row.revoked_at) map.set(row.user_id, row.role);
  return map;
}

app.get("/api/admin/users", requireRole("admin"), async (req, res) => {
  try {
    const query = String(req.query.query ?? "").trim().toLowerCase().slice(0, 100);
    const status = String(req.query.status ?? "all"); // all | active | suspended
    const page = Math.max(1, Math.min(50, Number(req.query.page ?? 1) || 1));
    const pageSize = Math.max(10, Math.min(100, Number(req.query.pageSize ?? 25) || 25));
    const roles = await loadActiveAdminRoles();
    // Bounded fan-out: at most 5 pages x 100 users covers current platform scale.
    const all = [];
    let total = 0;
    for (let p = 1; p <= 5; p += 1) {
      const { data, error } = await service.auth.admin.listUsers({ page: p, perPage: 100 });
      if (error) return sendError(res, error, "User listing unavailable.");
      const users = data?.users ?? [];
      total = data?.total ?? all.length;
      all.push(...users);
      if (users.length < 100) break;
    }
    let users = all.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      bannedUntil: u.banned_until ?? null,
      suspended: Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
      role: roles.get(u.id) ?? null,
    }));
    if (query) users = users.filter((u) => (u.email ?? "").toLowerCase().includes(query) || u.id.toLowerCase().includes(query));
    if (status === "suspended") users = users.filter((u) => u.suspended);
    if (status === "active") users = users.filter((u) => !u.suspended);
    const filtered = users.length;
    const start = (page - 1) * pageSize;
    res.json({ users: users.slice(start, start + pageSize), total: filtered, authTotal: total, page, pageSize });
  } catch (error) {
    sendError(res, error, "User listing unavailable.");
  }
});

app.post("/api/admin/users/:id/suspend", requireRole("admin"), async (req, res) => {
  const id = String(req.params.id);
  try {
    if (id === req.devutils.user.id) return res.status(400).json({ error: "You cannot suspend your own account." });
    const targetRole = await adminRoleOf(id);
    if (targetRole === "super_admin" && req.devutils.adminRole !== "super_admin") {
      return res.status(403).json({ error: "Only a super-administrator can suspend another administrator." });
    }
    const { error } = await service.auth.admin.updateUserById(id, { ban_duration: AUTH_BAN_INDEFINITE });
    if (error) return sendError(res, error, "Suspension failed.");
    adminCache.delete(id);
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "user_suspended", { target_user_id: id }))) return;
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, "Suspension failed.");
  }
});

app.post("/api/admin/users/:id/reactivate", requireRole("admin"), async (req, res) => {
  const id = String(req.params.id);
  try {
    if (id === req.devutils.user.id) return res.status(400).json({ error: "You cannot reactivate your own account." });
    const { error } = await service.auth.admin.updateUserById(id, { ban_duration: "none" });
    if (error) return sendError(res, error, "Reactivation failed.");
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "user_reactivated", { target_user_id: id }))) return;
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, "Reactivation failed.");
  }
});

app.post("/api/admin/users/:id/revoke-access", requireRole("admin"), async (req, res) => {
  const id = String(req.params.id);
  try {
    if (id === req.devutils.user.id) return res.status(400).json({ error: "You cannot revoke your own access." });
    const targetRole = await adminRoleOf(id);
    if (targetRole === "super_admin" && req.devutils.adminRole !== "super_admin") {
      return res.status(403).json({ error: "Only a super-administrator can revoke another administrator's access." });
    }
    const { error } = await service.auth.admin.signOut(id);
    if (error) return sendError(res, error, "Access revocation failed.");
    adminCache.delete(id);
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "user_access_revoked", { target_user_id: id }))) return;
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, "Access revocation failed.");
  }
});

app.put("/api/admin/users/:id/role", requireRole("super_admin"), async (req, res) => {
  const id = String(req.params.id);
  const role = String(req.body?.role ?? "");
  try {
    if (id === req.devutils.user.id) return res.status(400).json({ error: "You cannot change your own role." });
    if (!["moderator", "admin", "super_admin"].includes(role)) return res.status(400).json({ error: "role must be moderator, admin, or super_admin." });
    const { error } = await service.rpc("set_admin_role", { p_user_id: id, p_role: role, p_set_by: req.devutils.user.id });
    if (error) return sendError(res, error, "Role assignment failed.");
    adminCache.delete(id);
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "admin_role_assigned", { target_user_id: id, role }))) return;
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, "Role assignment failed.");
  }
});

app.delete("/api/admin/users/:id/role", requireRole("super_admin"), async (req, res) => {
  const id = String(req.params.id);
  try {
    if (id === req.devutils.user.id) return res.status(400).json({ error: "You cannot revoke your own role." });
    const { error } = await service.rpc("revoke_admin", { p_user_id: id });
    if (error) return sendError(res, error, "Role revocation failed.");
    adminCache.delete(id);
    if (!(await recordAdminAuditOrRespond(res, req.devutils.user.id, "admin_role_revoked", { target_user_id: id }))) return;
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, "Role revocation failed.");
  }
});

'''

ANCHOR = 'app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));'

path = ROOT / "server" / "index.mjs"
idx = path.read_text(encoding="utf-8")

for name in ("requireRole", "adminRoleOf", "recordAdminAuditOrRespond"):
    if name not in idx:
        sys.exit(f"Prerequisite function {name} missing from server/index.mjs — apply WS A2 first (patch-phase6-roles-v1.py).")

if BLOCK.strip() in idx:
    print("WS B block already present — nothing to do.")
else:
    idx = replace_once(idx, "server/index.mjs", ANCHOR, BLOCK + ANCHOR)
    path.write_text(idx, encoding="utf-8")
    print("  inserted user-management endpoints before the /api 404 catch-all")
    print("WS B patch complete. Gates: npx tsc --noEmit; npx tsx scripts/verify.ts; npm run test:server (100/0); npm run build")
