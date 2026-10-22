#!/usr/bin/env python3
"""Phase 6 WS A2: wire the role hierarchy into the gateway.

Anchored, assertion-guarded edits to server/lib.mjs and server/index.mjs.
Run once from the repo root:

    python3 scripts/patch-phase6-roles-v1.py

Every edit asserts its anchor occurs exactly once, so a moved or already
patched file fails loudly instead of patching the wrong spot. Re-running
the script after a successful patch is safe (anchors are consumed).

Requires migration 202610220001_admin_roles_flags_history.sql applied.

What changes:
  lib.mjs
    * activeAdminRole(record) — resolve moderator/admin/super_admin or null
      (replaces the hardcoded `role === "admin"` check).
    * hasMinRole(role, min) — tier comparison (moderator < admin < super_admin).
    * isActiveAdminRecord(record) — kept for compatibility; now any active tier.
  index.mjs
    * adminRoleOf(userId) — adminCache now caches the ROLE string (30s TTL).
    * isAdmin(userId) — thin wrapper, true for any active tier.
    * requireRole(min) middleware factory; base /api/admin gate becomes
      requireRole("moderator") (read surfaces).
    * Every mutating /api/admin route (PUT/POST/DELETE) gains an explicit
      requireRole("admin") gate, so moderators can read but not change.
    * /api/admin/me returns the real role instead of a hardcoded string.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent


def load(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def save(rel, text):
    (ROOT / rel).write_text(text, encoding="utf-8")
    print(f"  patched {rel}")


def replace_once(text, rel, old, new, optional=False):
    count = text.count(old)
    if count == 1:
        print(f"  applied: {old.strip().splitlines()[0][:70]!r}")
        return text.replace(old, new, 1)
    if new in text:
        print(f"  already applied: {old.strip().splitlines()[0][:70]!r}")
        return text
    if optional:
        print(f"  skipped (anchor absent, optional): {old.strip().splitlines()[0][:70]!r}")
        return text
    sys.exit(
        f"ANCHOR NOT FOUND or not unique ({count}x) in {rel}:\n{old}\n"
        "Resolve manually - do not edit around this."
    )


# --------------------------------------------------------------------------
# 1. server/lib.mjs — role helpers
# --------------------------------------------------------------------------
lib_old = '''export function isActiveAdminRecord(record) {
  return Boolean(record && record.role === "admin" && !record.revoked_at);
}'''
lib_new = '''export function isActiveAdminRecord(record) {
  return activeAdminRole(record) !== null;
}

/** Admin tiers, ordered: moderator < admin < super_admin. */
export const ADMIN_ROLE_RANK = { moderator: 1, admin: 2, super_admin: 3 };

/** Resolve the active role of an admin_users row, or null for none/revoked. */
export function activeAdminRole(record) {
  if (!record || record.revoked_at) return null;
  return ADMIN_ROLE_RANK[record.role] ? record.role : null;
}

/** True when `role` meets the `min` tier. Unknown tiers never pass. */
export function hasMinRole(role, min) {
  const r = ADMIN_ROLE_RANK[role] ?? 0;
  return r > 0 && r >= (ADMIN_ROLE_RANK[min] ?? 99);
}'''

lib = load("server/lib.mjs")
lib = replace_once(lib, "server/lib.mjs", lib_old, lib_new)
save("server/lib.mjs", lib)

# --------------------------------------------------------------------------
# 2. server/index.mjs — imports
# --------------------------------------------------------------------------
idx = load("server/index.mjs")
idx = replace_once(
    idx,
    "server/index.mjs",
    '''  isActiveAdminRecord,
  toToolOverrideDbRow,''',
    '''  activeAdminRole,
  hasMinRole,
  isActiveAdminRecord,
  toToolOverrideDbRow,''',
)

# --------------------------------------------------------------------------
# 3. isAdmin -> adminRoleOf (cache the role string, not a boolean)
# --------------------------------------------------------------------------
idx = replace_once(
    idx,
    "server/index.mjs",
    'function isAdmin(userId) {',
    'function adminRoleOf(userId) {',
)
idx = replace_once(
    idx,
    "server/index.mjs",
    '''  const cached = adminCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.value;''',
    '''  const cached = adminCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.role ?? (cached.value ? "admin" : null);''',
)
idx = replace_once(
    idx,
    "server/index.mjs",
    '''  const value = isActiveAdminRecord(data);
  adminCache.set(userId, { value, expires: Date.now() + 30_000 });
  return value;
}''',
    '''  const role = activeAdminRole(data);
  adminCache.set(userId, { role, expires: Date.now() + 30_000 });
  return role;
}
async function isAdmin(userId) {
  return (await adminRoleOf(userId)) !== null;
}''',
)

# --------------------------------------------------------------------------
# 4. requireAdmin -> requireRole(min) factory (admin wrapper kept for safety)
# --------------------------------------------------------------------------
idx = replace_once(
    idx,
    "server/index.mjs",
    '''async function requireAdmin(req, res, next) {
  try {
    if (!(await isAdmin(req.devutils.user.id))) return res.status(403).json({ error: "Administrator access required." });
    req.devutils.isAdmin = true;
    next();
  } catch (error) {
    sendError(res, error, "Administrator check failed.");
  }
}''',
    '''function requireRole(min = "moderator") {
  return async (req, res, next) => {
    try {
      const role = await adminRoleOf(req.devutils.user.id);
      if (!role || !hasMinRole(role, min)) return res.status(403).json({ error: "Administrator access required." });
      req.devutils.isAdmin = true;
      req.devutils.adminRole = role;
      next();
    } catch (error) {
      sendError(res, error, "Administrator check failed.");
    }
  };
}
async function requireAdmin(req, res, next) {
  await requireRole("admin")(req, res, next);
}''',
)

# --------------------------------------------------------------------------
# 5. Base gate: moderators may READ admin surfaces
# --------------------------------------------------------------------------
idx = replace_once(
    idx,
    "server/index.mjs",
    'app.use("/api/admin", adminLimit, requireOrigin, requireCsrf, requireSession, requireAdmin);',
    'app.use("/api/admin", adminLimit, requireOrigin, requireCsrf, requireSession, requireRole("moderator"));',
)

# --------------------------------------------------------------------------
# 6. /api/admin/me: return the real role
# --------------------------------------------------------------------------
idx = replace_once(
    idx,
    "server/index.mjs",
    'app.get("/api/admin/me", (req, res) => res.json({ role: "admin", userId: req.devutils.user.id, email: req.devutils.user.email }));',
    'app.get("/api/admin/me", (req, res) => res.json({ role: req.devutils.adminRole, userId: req.devutils.user.id, email: req.devutils.user.email }));',
)

# --------------------------------------------------------------------------
# 7. Mutating /api/admin routes require tier "admin" (moderators: read-only)
# --------------------------------------------------------------------------
pattern = re.compile(r'(app\.(?:put|post|delete)\("(?:/api/admin/[^"]*)"),\s*')


def add_admin_gate(match):
    head = match.group(1)
    return f'{head}, requireRole("admin"), '


mutating = pattern.findall(idx)
idx, n = pattern.subn(lambda m: add_admin_gate(m) if 'requireRole("admin")' not in m.group(0) else m.group(0), idx)
print(f'  mutating admin routes gated with requireRole("admin"): {len(mutating)} found, {n} scanned')
if n == 0 and 'requireRole("admin"), ' not in idx:
    sys.exit("No mutating /api/admin routes found - nothing gated. Inspect manually.")

save("server/index.mjs", idx)

print(
    "\nWS A2 patch complete. Next: npx tsc --noEmit; npm run test:server; npm run build\n"
    "then commit lib.mjs, index.mjs and this script together."
)
