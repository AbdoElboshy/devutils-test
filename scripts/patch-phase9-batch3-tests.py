#!/usr/bin/env python3
"""Phase 9 Batch 3 step B: add 14 p9b3 verify tests.

Anchors (branch 8d321d3):
- verify.ts: 'from "../src/lib/cloud-iac";'
- verify.ts: '  throws("p9b2: helm rejects zero replicas", ... ));\n}'
Idempotent: aborts on "p9b3:".
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
if "p9b3:" in s:
    print("ABORT: verify.ts already patched")
    sys.exit(1)

s = one(
    s,
    'import { buildCloudWatchQuery, buildCloudWatchAlarm, inspectTerraformPlan, buildRbacBinding, buildHelmValues } from "../src/lib/cloud-iac";',
    'import { buildCloudWatchQuery, buildCloudWatchAlarm, inspectTerraformPlan, buildRbacBinding, buildHelmValues } from "../src/lib/cloud-iac";\nimport { validateNginxConfig, validateApacheConfig, reviewIamPolicy, lintPromQl } from "../src/lib/config-validators";',
    1,
)

TESTS = r'''
// --- P9 B3: Nginx / Apache / IAM review / PromQL lint ---
{
  const nginxOk = validateNginxConfig("server {\n  listen 80;\n  server_name example.com;\n  location / {\n    proxy_pass http://app;\n  }\n}\n");
  eq("p9b3: nginx valid config passes", nginxOk.ok, true);
  const nginxBad = validateNginxConfig("server {\n  listen 80\n  server_name example.com\n}\n}\n");
  eq("p9b3: nginx catches missing semicolons and extra brace", [nginxBad.ok, nginxBad.issues.some((i) => i.message.includes("';'")), nginxBad.issues.some((i) => i.message.includes("Unbalanced"))], [false, true, true]);
  throws("p9b3: nginx rejects empty input", () => validateNginxConfig("   "));

  const apacheOk = validateApacheConfig("<VirtualHost *:80>\n  ServerName example.com\n</VirtualHost>\n");
  eq("p9b3: apache valid config passes", apacheOk.ok, true);
  const apacheBad = validateApacheConfig("<Directory /var/www>\n  AllowOverride None\n</Location>\n");
  eq("p9b3: apache catches mismatched tags", [apacheBad.ok, apacheBad.issues.some((i) => i.message.includes("does not match"))], [false, true]);
  eq("p9b3: apache catches unclosed tag", validateApacheConfig("<IfModule mod_rewrite.c>\n  RewriteEngine On\n").issues.some((i) => i.message.includes("Unclosed tag")), true);

  const review = reviewIamPolicy({ Statement: [
    { Effect: "Allow", Action: ["s3:GetObject"], Resource: "arn:aws:s3:::bucket/*" },
    { Effect: "Allow", Action: ["*"], Resource: "*" },
  ] });
  eq("p9b3: iam review counts statements and finds dangers", [review.statementCount, review.ok, review.findings.some((f) => f.severity === "danger" && f.statement === 2)], [2, false, true]);
  eq("p9b3: iam review leaves scoped statements clean", review.findings.some((f) => f.statement === 1 && f.severity === "danger"), false);
  throws("p9b3: iam review rejects non-policy input", () => reviewIamPolicy({}));

  eq("p9b3: promql lint passes valid expression", lintPromQl('sum(rate(http_requests_total{job="api"}[5m])) by (job)').ok, true);
  const promBad = lintPromQl('rate(http_requests_total{job="api"}');
  eq("p9b3: promql lint catches unbalanced parens and braces", [promBad.ok, promBad.issues.some((i) => i.message.includes("parentheses")), promBad.issues.some((i) => i.message.includes("matchers"))], [false, true, true]);
  eq("p9b3: promql lint catches bad range unit", lintPromQl("rate(x[5mins])").issues.some((i) => i.message.includes("Unknown range unit")), true);
  eq("p9b3: promql lint catches quantile out of range", lintPromQl("histogram_quantile(1.5, sum by (le) (rate(x[5m])))").issues.some((i) => i.message.includes("between 0 and 1")), true);
  throws("p9b3: promql lint rejects empty input", () => lintPromQl(" "));
}
'''

s = one(
    s,
    '  throws("p9b2: helm rejects zero replicas", () => buildHelmValues({ releaseName: "w", namespace: "apps", replicas: 0, imageRepository: "nginx", imageTag: "1", serviceType: "ClusterIP", servicePort: 80 }));\n}',
    '  throws("p9b2: helm rejects zero replicas", () => buildHelmValues({ releaseName: "w", namespace: "apps", replicas: 0, imageRepository: "nginx", imageTag: "1", serviceType: "ClusterIP", servicePort: 80 }));\n}\n' + TESTS,
    1,
)
p.write_text(s, encoding="utf-8")
print("verify.ts: +14 validator regression tests")
print("PATCH 9.3B OK — expect 357 passed, 0 failed (343 + 14)")
