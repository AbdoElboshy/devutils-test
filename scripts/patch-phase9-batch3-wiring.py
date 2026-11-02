#!/usr/bin/env python3
"""Phase 9 Batch 3 step A: register 4 validator operations.

Anchors (branch 62eb5c5):
- cloud-iac import line in operations.ts
- '  .register({ id: "zabbix.expression", title: "Build Zabbix expression",'
Idempotent: aborts on "nginx.validate".
"""
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent


def one(s, old, new, n=1):
    c = s.count(old)
    assert c == n, "anchor found {}x (expected {}): {!r}".format(c, n, old[:70])
    return s.replace(old, new, n)


p = root / "src/platform/operations.ts"
s = p.read_text(encoding="utf-8")
if "nginx.validate" in s:
    print("ABORT: operations.ts already has validator ops")
    sys.exit(1)

s = one(
    s,
    'type RbacBindingInput } from "../lib/cloud-iac";',
    'type RbacBindingInput } from "../lib/cloud-iac";\nimport { lintPromQl, reviewIamPolicy, validateApacheConfig, validateNginxConfig } from "../lib/config-validators";',
    1,
)

OPS = (
    '  .register({ id: "nginx.validate", title: "Validate nginx config", description: "Check nginx configuration for unbalanced braces and missing semicolons.", clientSide: true, maximumInputBytes: 5_000_000, run: (input) => validateNginxConfig(asText(input)) })\n'
    '  .register({ id: "apache.validate", title: "Validate Apache config", description: "Check Apache configuration for mismatched or unclosed tags.", clientSide: true, maximumInputBytes: 5_000_000, run: (input) => validateApacheConfig(asText(input)) })\n'
    '  .register({ id: "iam.review", title: "Review IAM policy", description: "Review an IAM policy document for wildcards and privileged grants.", clientSide: true, maximumInputBytes: 5_000_000, run: (input) => reviewIamPolicy(asObject(input)) })\n'
    '  .register({ id: "promql.lint", title: "Lint PromQL", description: "Check a PromQL expression for unbalanced braces, bad ranges and common mistakes.", clientSide: true, run: (input) => lintPromQl(asText(input)) })\n'
)

s = one(
    s,
    '  .register({ id: "zabbix.expression", title: "Build Zabbix expression",',
    OPS + '  .register({ id: "zabbix.expression", title: "Build Zabbix expression",',
    1,
)
p.write_text(s, encoding="utf-8")
print("operations.ts: +4 validator operations")
