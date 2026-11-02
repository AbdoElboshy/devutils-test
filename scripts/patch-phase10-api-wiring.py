#!/usr/bin/env python3
# Phase 10 sub-track B Batch 1 wiring: build script + index.mjs mount.
# Idempotent: aborts if "api-v1" present in index.mjs or build:server-ops in package.json.
import json
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent


def one(s, old, new, n=1):
    c = s.count(old)
    assert c == n, "anchor found {}x (expected {}): {!r}".format(c, n, old[:70])
    return s.replace(old, new, n)


# 1. package.json scripts
p = root / "package.json"
data = json.loads(p.read_text(encoding="utf-8"))
if "build:server-ops" in data["scripts"]:
    print("ABORT: package.json already wired")
    sys.exit(1)
data["scripts"]["build:server-ops"] = "node scripts/build-server-ops.mjs"
data["scripts"]["build"] = "vite build && npm run build:server-ops"
p.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
print("package.json: build chains build:server-ops")

# 2. index.mjs mount — inserted before the /api 404 catch-all so /api/v1
# routes register at startup (dynamic import; the app has not started
# listening yet at this point in the file).
p = root / "server/index.mjs"
s = p.read_text(encoding="utf-8")
if "api-v1" in s:
    print("ABORT: index.mjs already wired")
    sys.exit(1)
s = one(
    s,
    'app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));',
    'import("./api-v1.mjs").then(({ mountApiV1 }) => mountApiV1(app, { service })).catch((error) => console.error("[DevUtils] /api/v1 mount failed:", error instanceof Error ? error.message : error));\n\napp.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));',
    1,
)
p.write_text(s, encoding="utf-8")
print("index.mjs: mountApiV1 mounted before the /api 404 catch-all")
print("PATCH 10.3A OK — run: npm run build && npm run test:server")
