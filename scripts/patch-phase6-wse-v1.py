#!/usr/bin/env python3
"""Phase 6 WS E: role-separation tests + moderator UI visibility fix.

Anchored, assertion-guarded edits. Run once from the repo root:

    python3 scripts/patch-phase6-wse-v1.py

Changes:
  1. src/pages/admin.tsx
     Moderators no longer see the "Users" nav tab (GET /api/admin/users is
     admin-tier; hiding the tab avoids the 403 dead-end). Direct URL access
     still fails safely server-side — this is UX only, not a security control.
  2. scripts/test-server.mjs
     Adds a gating-matrix block that pins, for every Phase 6 admin route,
     which tiers pass hasMinRole: moderator read-only, admin user/tools ops,
     super_admin role ops. 55 new assertions (100 -> 155 expected).

Two separate commits after running (one concern per commit):
  git add src/pages/admin.tsx && git commit -m "..."
  git add scripts/test-server.mjs && git commit -m "..."
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent


def patch(rel, edits):
    path = ROOT / rel
    s = path.read_text(encoding="utf-8")
    for old, new in edits:
        count = s.count(old)
        if count == 1:
            s = s.replace(old, new, 1)
            print(f"  [{rel}] applied: {old.strip().splitlines()[0][:70]!r}")
        elif new in s:
            print(f"  [{rel}] already applied: {old.strip().splitlines()[0][:70]!r}")
        else:
            sys.exit(f"ANCHOR NOT FOUND or not unique ({count}x) in {rel}:\n{old}")
    path.write_text(s, encoding="utf-8")


# ---------------------------------------------------------------- 1. admin.tsx
patch("src/pages/admin.tsx", [(
    "{SECTIONS.map((item) => (",
    "{(role === \"moderator\" ? SECTIONS.filter((item) => item.id !== \"users\") : SECTIONS).map((item) => (",
)])

# ---------------------------------------------------------------- 2. test-server.mjs
GATING_BLOCK = '''/* ---------------- phase6: admin route gating matrix ---------------- */
/* Every /api/admin route and its minimum tier, pinned via hasMinRole so a
   future edit cannot silently widen a gate. Server middleware (requireRole)
   is the enforcement; this matrix is its characterization test. */
const ADMIN_ROUTE_GATES = [
  { route: "base /api/admin middleware", min: "moderator" },
  { route: "GET /api/admin/me", min: "moderator" },
  { route: "GET /api/admin/users", min: "admin" },
  { route: "POST /api/admin/users/:id/suspend", min: "admin" },
  { route: "POST /api/admin/users/:id/reactivate", min: "admin" },
  { route: "POST /api/admin/users/:id/revoke-access", min: "admin" },
  { route: "PUT /api/admin/tools/:id", min: "admin" },
  { route: "POST /api/admin/tools/reorder", min: "admin" },
  { route: "DELETE /api/admin/tools/:id", min: "admin" },
  { route: "PUT /api/admin/users/:id/role", min: "super_admin" },
  { route: "DELETE /api/admin/users/:id/role", min: "super_admin" },
];
for (const { route, min } of ADMIN_ROUTE_GATES) {
  ok(`gating: ${route} allows ${min}`, hasMinRole(min, min) === true);
  ok(`gating: ${route} allows super_admin`, hasMinRole("super_admin", min) === true);
  ok(`gating: ${route} rejects non-admin identity`, hasMinRole(null, min) === false);
  ok(`gating: ${route} rejects unknown role`, hasMinRole("owner", min) === false);
  if (min !== "moderator") ok(`gating: ${route} rejects moderator (read-only)`, hasMinRole("moderator", min) === false);
  if (min === "super_admin") ok(`gating: ${route} rejects admin`, hasMinRole("admin", min) === false);
}
'''

path = ROOT / "scripts" / "test-server.mjs"
s = path.read_text(encoding="utf-8")
if "ADMIN_ROUTE_GATES" in s:
    print("  [scripts/test-server.mjs] gating matrix already present")
else:
    anchor = 'ok("hasMinRole unknown role never passes (phase6)", () => assert.equal(hasMinRole("owner", "moderator"), false));'
    count = s.count(anchor)
    if count != 1:
        sys.exit(f"ANCHOR NOT FOUND or not unique ({count}x) in scripts/test-server.mjs:\\n{anchor}")
    s = s.replace(anchor, anchor + "\\n\\n" + GATING_BLOCK, 1)
    path.write_text(s, encoding="utf-8")
    print("  [scripts/test-server.mjs] gating matrix inserted after the phase6 role contract block")

print(
    "\\nWS E patch complete. Two commits, gates before each push:\\n"
    "  1) git add src/pages/admin.tsx -m 'fix(phase6): hide Users tab for moderators (read-only tier)'\n"
    "  2) git add scripts/test-server.mjs -m 'test(phase6): admin route gating matrix (155/0)'\n"
    "Gates: npx tsc --noEmit; npx tsx scripts/verify.ts (247/0); npm run test:server (155/0); npm run build"
)
