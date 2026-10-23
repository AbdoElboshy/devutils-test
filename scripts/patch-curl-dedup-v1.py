#!/usr/bin/env python3
"""Phase 7 Batch 2, part 1: dedupe Content-Type/Authorization across cURL converters.

Fixes:
- PHP output lists Content-Type twice when the curl command had -H "Content-Type: ...".
- Python/fetch silently overwrite instead of dedup (same root cause).
- Go DROPS Content-Type entirely when set via --json.
- buildCurl emits the Content-Type -H flag twice.

Approach: one shared effectiveHeaders(r) helper used by all five call sites
(curlToPython, curlToJs, curlToGo, curlToPhp, buildCurl), plus 10 regression
tests in scripts/verify.ts (expect 257 passed, 0 failed).

Idempotency: aborts if effectiveHeaders is already present.
"""
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent

# ---------------- src/lib/blueprints.ts ----------------
p = root / "src/lib/blueprints.ts"
s = p.read_text(encoding="utf-8")
if "effectiveHeaders" in s:
    print("ABORT: effectiveHeaders already present in blueprints.ts")
    sys.exit(1)


def one(old, new, n=1):
    c = s.count(old)
    assert c == n, f"anchor found {c}x (expected {n}): {old[:70]!r}"
    return s.replace(old, new, n)


# python + fetch: swap 3-line header build for helper (2 occurrences each)
s = one("  const h = [...r.headers];", "  const h = effectiveHeaders(r);", 2)
s = one('  if (r.contentType) h.push({ k: "Content-Type", v: r.contentType });\n', "", 2)
s = one(
    '  if (r.auth && !r.auth.startsWith("Basic ")) h.push({ k: "Authorization", v: `Bearer ${r.auth}` });\n',
    "",
    2,
)

# go: use helper, drop the separate auth ternary line
s = one("r.headers.map((h) =>", "effectiveHeaders(r).map((h) =>", 1)
lines = s.split("\n")
bad = [l for l in lines if 'req.Header.Set("Authorization"' in l]
assert len(bad) == 1, f"go auth line found {len(bad)}x"
s = "\n".join(l for l in lines if 'req.Header.Set("Authorization"' not in l)

# php: replace the whole inline array spread with the helper
s2 = re.sub(
    r"\$\{\[\.\.\.r\.headers.*?\.map\(",
    "${effectiveHeaders(r).map(",
    s,
    count=1,
    flags=re.S,
)
assert s2 != s, "php anchor not found"
s = s2

# buildCurl: emit each header once via helper
s = one("r.headers.forEach((h) =>", "effectiveHeaders(r).forEach((h) =>", 1)
lines = s.split("\n")
bad = [l for l in lines if "Authorization: Bearer ${r.auth}" in l and "parts.push" in l]
assert len(bad) == 1, f"buildCurl auth line found {len(bad)}x"
s = "\n".join(
    l for l in lines if not ("Authorization: Bearer ${r.auth}" in l and "parts.push" in l)
)
lines = s.split("\n")
bad = [l for l in lines if "Content-Type: ${r.contentType}" in l and "parts.push" in l]
assert len(bad) == 1, f"buildCurl content-type line found {len(bad)}x"
s = "\n".join(
    l for l in lines if not ("Content-Type: ${r.contentType}" in l and "parts.push" in l)
)

# insert shared helper before curlToPython
anchor = "export function curlToPython(r: HttpReq): string {"
helper = (
    "export function effectiveHeaders(r: HttpReq): { k: string; v: string }[] {\n"
    "  const h = [...r.headers];\n"
    '  if (r.contentType && !h.some((x) => x.k.toLowerCase() === "content-type")) h.push({ k: "Content-Type", v: r.contentType });\n'
    '  if (r.auth && !r.auth.startsWith("Basic ")) h.push({ k: "Authorization", v: `Bearer ${r.auth}` });\n'
    "  return h;\n"
    "}\n"
)
s = one(anchor, helper + anchor, 1)
p.write_text(s, encoding="utf-8")
print("blueprints.ts: effectiveHeaders() added, 5 call sites deduped")

# ---------------- scripts/verify.ts ----------------
p = root / "scripts/verify.ts"
s = p.read_text(encoding="utf-8")
s = one(
    "parseCurl, curlToPython, dockerRun",
    "parseCurl, curlToPython, curlToJs, curlToGo, curlToPhp, buildCurl, effectiveHeaders, dockerRun",
    1,
)

anchor = "// --- G2: SQL format / minify ---"
assert s.count(anchor) == 1, f"verify anchor found {s.count(anchor)}x"
tests = """// --- G2: cURL converters header dedup (phase7 batch2) ---
{
  const r = parseCurl('curl -X POST https://api.example.com/users -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN" --data-raw \\'{"name":"maya"}\\'');
  eq("curl php content-type once", curlToPhp(r).split("Content-Type").length - 1, 1);
  eq("curl python content-type once", curlToPython(r).split("Content-Type").length - 1, 1);
  eq("curl js content-type once", curlToJs(r).split("Content-Type").length - 1, 1);
  eq("curl go content-type once", curlToGo(r).split("Content-Type").length - 1, 1);
  eq("curl build content-type once", buildCurl(r).split("Content-Type").length - 1, 1);
  eq("curl php auth once", curlToPhp(r).split("Authorization").length - 1, 1);
  const r2 = parseCurl('curl https://example.com --json \\'{"a":1}\\'');
  eq("curl go keeps content-type from --json", curlToGo(r2).includes("Content-Type"), true);
  eq("curl php keeps content-type from --json", curlToPhp(r2).split("Content-Type").length - 1, 1);
  const eh = effectiveHeaders({ method: "POST", url: "https://x.dev", headers: [{ k: "content-type", v: "text/plain" }], auth: "", body: "", contentType: "text/plain" });
  eq("effectiveHeaders dedupes case-insensitively", eh.length, 1);
}

"""
s = s.replace(anchor, tests + anchor, 1)
p.write_text(s, encoding="utf-8")
print("verify.ts: +10 curl dedup regression tests")
print("PATCH OK")
