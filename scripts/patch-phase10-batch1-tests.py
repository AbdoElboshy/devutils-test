#!/usr/bin/env python3
"""Phase 10 Batch 1 step B: add 13 p10b1 verify tests.

Anchors (branch af6c422):
- verify.ts: 'import { validateNginxConfig, validateApacheConfig, reviewIamPolicy, lintPromQl } from "../src/lib/config-validators";'
- verify.ts: '  throws("p9b3: promql lint rejects empty input", () => lintPromQl(" "));\n}'
Idempotent: aborts on "p10b1:".
"""
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent


def one(s, old, new, n=1):
    c = s.count(old)
    assert c == n, "anchor found {}x (expected {}): {!r}".format(c, n, old[:70])
    return s.replace(old, new, n)


p = root / "scripts/verify.ts"
s = p.read_text(encoding="utf-8")
if "p10b1:" in s:
    print("ABORT: verify.ts already patched")
    sys.exit(1)

s = one(
    s,
    'import { validateNginxConfig, validateApacheConfig, reviewIamPolicy, lintPromQl } from "../src/lib/config-validators";',
    'import { validateNginxConfig, validateApacheConfig, reviewIamPolicy, lintPromQl } from "../src/lib/config-validators";\nimport { validateOpenApi, listOpenApiOperations, lintGraphQL, inspectHar, evaluateAssertions } from "../src/lib/api-testing";',
    1,
)

TESTS = r'''
// --- P10 B1: OpenAPI / GraphQL / HAR / assertions ---
{
  const spec = { openapi: "3.0.0", info: { title: "Users", version: "1.0.0" }, paths: { "/users": { get: { operationId: "listUsers", responses: { "200": { description: "ok" } } }, post: { operationId: "createUser", responses: { "201": { description: "created" } } } } } };
  eq("p10b1: openapi valid spec passes", validateOpenApi(spec).ok, true);
  eq("p10b1: openapi catches missing responses", validateOpenApi({ openapi: "3.0.0", info: { title: "t", version: "1" }, paths: { "/users": { get: {} } } }).issues.some((i) => i.message.includes("responses")), true);
  eq("p10b1: openapi catches path without slash", validateOpenApi({ openapi: "3.0.0", info: { title: "t", version: "1" }, paths: { "users": { get: { responses: { "200": { description: "ok" } } } } } }).issues.some((i) => i.message.includes("must start with '/'")), true);
  eq("p10b1: openapi rejects swagger 2.1", validateOpenApi({ swagger: "2.1", info: { title: "t", version: "1" }, paths: {} }).issues.some((i) => i.message.includes("2.0")), true);
  const ops = listOpenApiOperations(spec);
  eq("p10b1: openapi lists operations", [ops.length, ops[0].method, ops[0].operationId, ops[1].method, ops[1].operationId], [2, "GET", "listUsers", "POST", "createUser"]);

  eq("p10b1: graphql lint passes valid query", lintGraphQL("query User($id: ID!) { user(id: $id) { name } }").ok, true);
  eq("p10b1: graphql lint catches undeclared variable", lintGraphQL("query { user(id: $id) { name } }").issues.some((i) => i.message.includes("never declared")), true);
  eq("p10b1: graphql lint catches unbalanced braces", lintGraphQL("query { user { name }").issues.some((i) => i.message.includes("braces")), true);

  const har = { log: { entries: [
    { request: { method: "GET", url: "https://api.example.com/users", headers: [{ name: "Accept", value: "application/json" }] } },
    { request: { method: "POST", url: "https://api.example.com/users", headers: [{ name: "Authorization", value: "Bearer SECRET" }] } },
  ] } };
  const harResult = inspectHar(har);
  eq("p10b1: har inspects requests", [harResult.requests.length, harResult.requests[0].method, harResult.requests[1].url], [2, "GET", "https://api.example.com/users"]);
  eq("p10b1: har flags credential headers with warning", [harResult.requests[1].hasCredentialHeaders, harResult.warning !== null], [true, true]);
  eq("p10b1: har summary never echoes header values", JSON.stringify(harResult).includes("SECRET"), false);

  const results = evaluateAssertions({ status: 200, body: { user: { id: 42, name: "maya" } }, assertions: [
    { kind: "statusEquals", expected: 200 },
    { kind: "bodyContains", expected: "maya" },
    { kind: "jsonPathEquals", expected: "user.id", actual: 42 },
    { kind: "jsonPathEquals", expected: "user.name", actual: "someone-else" },
  ] });
  eq("p10b1: assertions evaluate", [results.length, results[0].passed, results[1].passed, results[2].passed, results[3].passed], [4, true, true, true, false]);
  throws("p10b1: assertions require at least one", () => evaluateAssertions({ status: 200, assertions: [] }));
}
'''

s = one(
    s,
    '  throws("p9b3: promql lint rejects empty input", () => lintPromQl(" "));\n}',
    '  throws("p9b3: promql lint rejects empty input", () => lintPromQl(" "));\n}\n' + TESTS,
    1,
)
p.write_text(s, encoding="utf-8")
print("verify.ts: +13 api-testing regression tests")
print("PATCH 10.1B OK — expect 370 passed, 0 failed (357 + 13)")
