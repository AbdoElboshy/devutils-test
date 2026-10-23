#!/usr/bin/env python3
import pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent

REPLACEMENTS = {
  "server/lib.mjs": [(
    r'''    if (!/^\/[a-z0-9-]+$/.test(route)) { broken.push({ id: String(tool.id), reason: `route ${route} is not a valid tool route` }); continue; }''',
    r'''    if (!/^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(route)) { broken.push({ id: String(tool.id), reason: `route ${route} is not a valid tool route` }); continue; }''',
  )],
  "server/index.mjs": [(
    '''    const { error } = await service.auth.admin.signOut(id);
    if (error) return sendError(res, error, "Access revocation failed.");''',
    '''    const { error } = await service.auth.admin.signOutById(id);
    if (error) return sendError(res, error, "Access revocation failed.");''',
  )],
  "scripts/test-server.mjs": [(
    '''ok("findBrokenTools flags a duplicate route", () => assert.equal(findBrokenTools([{ id: "a", route: "/x", visibility: "published" }, { id: "b", route: "/x", visibility: "published" }], ["a", "b"]).length, 1));''',
    '''ok("findBrokenTools flags a duplicate route", () => assert.equal(findBrokenTools([{ id: "a", route: "/x", visibility: "published" }, { id: "b", route: "/x", visibility: "published" }], ["a", "b"]).length, 1));
ok("findBrokenTools accepts multi-segment /tools/* routes", () => assert.equal(findBrokenTools([{ id: "aws-arn-parser", route: "/tools/aws-arn-parser", visibility: "published" }, { id: "log-diff", route: "/tools/log-diff", visibility: "published" }], ["aws-arn-parser", "log-diff"]).length, 0));
ok("findBrokenTools still rejects malformed routes", () => assert.equal(findBrokenTools([{ id: "a", route: "/tools/Bad_Route", visibility: "published" }, { id: "b", route: "tools/b", visibility: "published" }, { id: "c", route: "/a/", visibility: "published" }], ["a", "b", "c"]).length, 3));''',
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
print("OK")
