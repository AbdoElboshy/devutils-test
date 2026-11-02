#!/usr/bin/env python3
"""Phase 10 Batch 2 wiring part A: feature flag, route, App.tsx registration.

Anchors (branch 40275ac):
- features.ts: '  | "cloud_tools";'  and  '  cloud_tools: true,'
- routes.ts: '  | { kind: "workflows" }'
- routes.ts: '  workflowsEnabled: boolean = isFeatureEnabled("workflows"),\n): RouteClassification {'
- routes.ts: '  if (route === "/workflows") return workflowsEnabled ? { kind: "workflows" } : { kind: "not-found" };'
- App.tsx: 'import { WorkflowsPage } from "./pages/workflows";'
- App.tsx: 'const LOCAL_ROUTES = new Set(["/tools",'
- App.tsx: '    case "workflows": return <WorkflowsPage onNav={onNav} />;'
- App.tsx: '  if (route === "/workflows") return "Local developer workflows — DevUtils";'
Idempotent: aborts on 'api_testing' in features.ts / App.tsx.
"""
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent


def one(s, old, new, n=1):
    c = s.count(old)
    assert c == n, "anchor found {}x (expected {}): {!r}".format(c, n, old[:70])
    return s.replace(old, new, n)


# 1. feature flag
p = root / "src/platform/features.ts"
s = p.read_text(encoding="utf-8")
if "api_testing" in s:
    print("ABORT: features.ts already has api_testing")
    sys.exit(1)
s = one(s, '  | "cloud_tools";', '  | "cloud_tools"\n  | "api_testing";', 1)
s = one(s, '  cloud_tools: true,', '  cloud_tools: true,\n  api_testing: true,', 1)
p.write_text(s, encoding="utf-8")
print("features.ts: api_testing flag on by default")

# 2. route classifier (third parameter, default from the flag)
p = root / "src/lib/routes.ts"
s = p.read_text(encoding="utf-8")
if '"api_testing"' in s.replace("api_testing flag", ""):
    pass
if "kind: \"api_testing\"" in s:
    print("ABORT: routes.ts already patched")
    sys.exit(1)
s = one(s, '  | { kind: "workflows" }', '  | { kind: "workflows" }\n  | { kind: "api_testing" }', 1)
s = one(
    s,
    '  workflowsEnabled: boolean = isFeatureEnabled("workflows"),\n): RouteClassification {',
    '  workflowsEnabled: boolean = isFeatureEnabled("workflows"),\n  apiTestingEnabled: boolean = isFeatureEnabled("api_testing"),\n): RouteClassification {',
    1,
)
s = one(
    s,
    '  if (route === "/workflows") return workflowsEnabled ? { kind: "workflows" } : { kind: "not-found" };',
    '  if (route === "/workflows") return workflowsEnabled ? { kind: "workflows" } : { kind: "not-found" };\n  if (route === "/api-testing") return apiTestingEnabled ? { kind: "api_testing" } : { kind: "not-found" };',
    1,
)
p.write_text(s, encoding="utf-8")
print("routes.ts: /api-testing classified (feature-gated via third parameter)")

# 3. App.tsx routing
p = root / "src/App.tsx"
s = p.read_text(encoding="utf-8")
if "/api-testing" in s:
    print("ABORT: App.tsx already patched")
    sys.exit(1)
s = one(s, 'import { WorkflowsPage } from "./pages/workflows";', 'import { WorkflowsPage } from "./pages/workflows";\nimport { ApiTestingPage } from "./pages/api-testing";', 1)
s = one(s, 'const LOCAL_ROUTES = new Set(["/tools",', 'const LOCAL_ROUTES = new Set(["/tools", "/api-testing",', 1)
s = one(s, '    case "workflows": return <WorkflowsPage onNav={onNav} />;', '    case "workflows": return <WorkflowsPage onNav={onNav} />;\n    case "api_testing": return <ApiTestingPage onNav={onNav} />;', 1)
s = one(
    s,
    '  if (route === "/workflows") return "Local developer workflows — DevUtils";',
    '  if (route === "/workflows") return "Local developer workflows — DevUtils";\n  if (route === "/api-testing") return "API request builder — DevUtils";',
    1,
)
s = one(
    s,
    'const description = t?.longDescription ?? (route === "/workflows" ? "Run and save local developer workflows that connect deterministic DevUtils operations." : "Tiny technical problems solved instantly with fast, local-first developer tools.");',
    'const description = t?.longDescription ?? (route === "/workflows" ? "Run and save local developer workflows that connect deterministic DevUtils operations." : route === "/api-testing" ? "Build, send and inspect HTTP requests directly from your browser." : "Tiny technical problems solved instantly with fast, local-first developer tools.");',
    1,
)
p.write_text(s, encoding="utf-8")
print("App.tsx: /api-testing route registered")
print("PATCH 10.2A OK")
