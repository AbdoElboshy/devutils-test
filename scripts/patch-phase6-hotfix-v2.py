#!/usr/bin/env python3
import pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent

REPLACEMENTS = {
  "server/index.mjs": [(
    '''    const { error } = await service.auth.admin.signOutById(id);
    if (error) return sendError(res, error, "Access revocation failed.");''',
    '''    // supabase-js does not expose an admin signOutById; call the GoTrue admin endpoint directly.
    const signOutUrl = `${process.env.SUPABASE_URL.replace(/\\/$/, "")}/auth/v1/admin/users/${encodeURIComponent(id)}/sign_out`;
    const signOutResp = await fetch(signOutUrl, { method: "POST", headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } });
    if (!signOutResp.ok) return res.status(502).json({ error: "Access revocation failed." });''',
  )],
}

for rel, pairs in REPLACEMENTS.items():
    path = root / rel
    text = path.read_text()
    for old, new in pairs:
        count = text.count(old)
        if count != 1:
            print(f"ABORT {rel}: anchor found {count} times (expected 1)"); sys.exit(1)
        text = text.replace(old, new)
    path.write_text(text)
    print(f"patched {rel}")

(root / "scripts/diag-phase6.mjs").unlink(missing_ok=True)
print("removed one-off diagnostic script (it was committed malformed)")
