#!/usr/bin/env python3
import pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
path = root / "server/index.mjs"
text = path.read_text()

old = '''    // supabase-js does not expose an admin signOutById; call the GoTrue admin endpoint directly.
    const signOutUrl = `${process.env.SUPABASE_URL.replace(/\\/$/, "")}/auth/v1/admin/users/${encodeURIComponent(id)}/sign_out`;
    const signOutResp = await fetch(signOutUrl, { method: "POST", headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } });
    if (!signOutResp.ok) return res.status(502).json({ error: "Access revocation failed." });'''
new = '''    // GoTrue has no admin sign-out-by-user-id; revoke their sessions via SQL function (see migration 202610230001).
    const { error } = await service.rpc("revoke_user_sessions", { p_user_id: id });
    if (error) return sendError(res, error, "Access revocation failed.");'''

if text.count(old) != 1:
    print(f"ABORT: anchor found {text.count(old)} times (expected 1)"); sys.exit(1)
path.write_text(text.replace(old, new, 1))
print("patched server/index.mjs")
