#!/usr/bin/env python3
"""Phase 10 Batch 1 step A: register 5 api-testing operations.

Anchors (branch 8ea8925):
- operations.ts: 'import { lintPromQl, reviewIamPolicy, validateApacheConfig, validateNginxConfig } from "../lib/config-validators";'
- operations.ts: '  .register({ id: "zabbix.expression", title: "Build Zabbix expression",'
Idempotent: aborts on "openapi.validate".
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
if "openapi.validate" in s:
    print("ABORT: operations.ts already has api-testing ops")
    sys.exit(1)

s = one(
    s,
    'import { lintPromQl, reviewIamPolicy, validateApacheConfig, validateNginxConfig } from "../lib/config-validators";',
    'import { lintPromQl, reviewIamPolicy, validateApacheConfig, validateNginxConfig } from "../lib/config-validators";\nimport { evaluateAssertions, inspectHar, lintGraphQL, listOpenApiOperations, validateOpenApi } from "../lib/api-testing";',
    1,
)

OPS = (
    '  .register({ id: "openapi.validate", title: "Validate OpenAPI", description: "Structurally validate an OpenAPI 3.x / Swagger 2.0 document.", clientSide: true, maximumInputBytes: 5_000_000, run: (input) => validateOpenApi(asObject(input)) })\n'
    '  .register({ id: "openapi.requests", title: "List OpenAPI operations", description: "List methods, paths and operationIds from an OpenAPI document for request generation.", clientSide: true, maximumInputBytes: 5_000_000, run: (input) => listOpenApiOperations(asObject(input)) })\n'
    '  .register({ id: "graphql.lint", title: "Lint GraphQL", description: "Check a GraphQL query or mutation for balance and variable-declaration errors.", clientSide: true, run: (input) => lintGraphQL(asText(input)) })\n'
    '  .register({ id: "har.inspect", title: "Inspect HAR", description: "Summarize requests from a HAR file with credential headers flagged (values never echoed).", clientSide: true, maximumInputBytes: 5_000_000, run: (input) => inspectHar(asObject(input)) })\n'
    '  .register({ id: "api.assert", title: "Evaluate API assertions", description: "Run status/body/JSON-path assertions against a captured response.", clientSide: true, run: (input) => evaluateAssertions(asObject(input) as never) })\n'
)

s = one(
    s,
    '  .register({ id: "zabbix.expression", title: "Build Zabbix expression",',
    OPS + '  .register({ id: "zabbix.expression", title: "Build Zabbix expression",',
    1,
)
p.write_text(s, encoding="utf-8")
print("operations.ts: +5 api-testing operations")
