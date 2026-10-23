#!/usr/bin/env python3
"""Phase 7 Batch 2, v2: repair the one casualty of v1 — curlToGo.

v1's go-step deleted 'the line containing req.Header.Set("Authorization")'.
But curlToGo's whole body is ONE physical line (literal \\n escapes, not real
newlines), so that deleted the entire return statement, leaving:
    export function curlToGo(r: HttpReq): string {
    }                     <- TS6133 ('r' unused) + TS2355 (no return)

Everything else v1 did is correct and already on master: the effectiveHeaders()
helper plus the Python/fetch/PHP/buildCurl call sites, and the 10 regression
tests in scripts/verify.ts.

v2 strategy — no hand-written template literals at all:
  1. `git show c7a6dca:src/lib/blueprints.ts` — the last good copy of the file
     (the PR merge at c7a6dca only added a script file; blueprints.ts there is
     untouched by the v1 commit).
  2. Slice out the original curlToGo byte-exact from that git blob.
  3. Apply the two intended edits as bounded substring replacements:
       a) r.headers.map((h) =>  ->  effectiveHeaders(r).map((h) =>
       b) delete the ${r.auth ... ` : ""} ternary by index bounds (asserted).
  4. Replace the broken two-line stub in the working file with the fixed
     function, asserted to occur exactly once.

Idempotency: aborts if the stub isn't found (i.e. already fixed).
Expected after this patch: tsc clean, verify 257 passed / 0 failed.
"""
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent.parent

# ---- 1. original good blueprints.ts from git history ----
show = subprocess.run(
    ["git", "show", "c7a6dca:src/lib/blueprints.ts"],
    cwd=root, capture_output=True, text=True,
)
if show.returncode != 0:
    print("ABORT: cannot read c7a6dca from git history")
    print(show.stderr.strip())
    sys.exit(1)
orig = show.stdout

sig = "export function curlToGo(r: HttpReq): string {"
start = orig.index(sig)
end = orig.index("export function curlToPhp", start)
orig_go = orig[start:end].rstrip("\n")
assert orig_go.count(sig) == 1
assert "r.headers.map((h) =>" in orig_go, "go map anchor missing in history copy"
assert 'req.Header.Set("Authorization"' in orig_go, "go auth ternary missing in history copy"

# ---- 2. apply the two intended edits ----
fixed = orig_go.replace(
    "r.headers.map((h) =>", "effectiveHeaders(r).map((h) =>", 1
)
tern_head = '${r.auth && !r.auth.startsWith("Basic ") ? `'
tern_tail = '` : ""}'
ts = fixed.index(tern_head)
te = fixed.index(tern_tail, ts) + len(tern_tail)
fixed = fixed[:ts] + fixed[te:]
assert 'req.Header.Set("Authorization"' not in fixed, "auth ternary not fully removed"
assert "effectiveHeaders" in fixed

# ---- 3. swap the broken stub for the fixed function ----
p = root / "src/lib/blueprints.ts"
s = p.read_text(encoding="utf-8")
stub_re = re.compile(r"export function curlToGo\(r: HttpReq\): string \{\s*\}")
m = stub_re.search(s)
if not m:
    print("ABORT: broken curlToGo stub not found (already fixed?)")
    sys.exit(1)
assert len(stub_re.findall(s)) == 1, "expected exactly one curlToGo stub"
s = s[: m.start()] + fixed + s[m.end() :]
assert s.count("effectiveHeaders") >= 6, "helper call sites missing"
p.write_text(s, encoding="utf-8")
print("curlToGo restored from c7a6dca and deduped via effectiveHeaders")
print("PATCH V2 OK")
