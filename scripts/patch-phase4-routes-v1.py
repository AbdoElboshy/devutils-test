#!/usr/bin/env python3
"""Phase 4 patch v1 — route classification seam + 404 regression tests.

1. Creates src/lib/routes.ts (pure classifyRoute extracted from App.tsx RouteView).
2. Rewires App.tsx RouteView to consume classifyRoute (no behavior change).
3. Adds 12 assertions ("P4: route classification") to scripts/verify.ts.

Idempotent: re-running is safe. Aborts loudly (exit 1) if any anchor is missing.
Expected result: tsc silent, verify 223 passed / 0 failed, build + test:server unchanged.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_PATH = ROOT / "src" / "App.tsx"
ROUTES_PATH = ROOT / "src" / "lib" / "routes.ts"
VERIFY_PATH = ROOT / "scripts" / "verify.ts"

ROUTES_SRC = """/* Phase 4 — pure route classifier.
   Extracted verbatim from App.tsx RouteView so route classification is testable
   without a DOM (see the "P4: route classification" block in scripts/verify.ts).
   RouteView consumes this; behavior is unchanged. */
import { ROUTE_MAP, getCategory } from "./registry";
import { isFeatureEnabled } from "../platform/features";
import type { AccountSection } from "../pages/account";

export const ADMIN_SECTIONS = ["overview", "tools", "categories", "analytics", "audit", "health"] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export const ACCOUNT_SECTIONS: AccountSection[] = [
  "dashboard", "profile", "favorites", "workflows", "presets",
  "api-keys", "usage", "billing", "security", "settings",
];

const AUTH_ROUTES: Record<string, "login" | "signup" | "forgot" | "reset" | "verify"> = {
  "/login": "login",
  "/signup": "signup",
  "/forgot-password": "forgot",
  "/reset-password": "reset",
  "/verify-email": "verify",
};

export type RouteClassification =
  | { kind: "tool"; id: string }
  | { kind: "home" }
  | { kind: "tools" }
  | { kind: "workflows" }
  | { kind: "auth"; mode: "login" | "signup" | "forgot" | "reset" | "verify" }
  | { kind: "admin"; section: AdminSection }
  | { kind: "account"; section: AccountSection }
  | { kind: "categories" }
  | { kind: "category"; slug: string }
  | { kind: "about" }
  | { kind: "not-found" };

export function classifyRoute(
  route: string,
  workflowsEnabled: boolean = isFeatureEnabled("workflows"),
): RouteClassification {
  const tool = ROUTE_MAP[route];
  if (tool) return { kind: "tool", id: tool.id };
  if (route === "/") return { kind: "home" };
  if (route === "/tools") return { kind: "tools" };
  if (route === "/workflows") return workflowsEnabled ? { kind: "workflows" } : { kind: "not-found" };
  const auth = AUTH_ROUTES[route];
  if (auth) return { kind: "auth", mode: auth };
  if (route === "/admin" || route.startsWith("/admin/")) {
    const requested = route.split("/")[2] || "overview";
    return {
      kind: "admin",
      section: (ADMIN_SECTIONS as readonly string[]).includes(requested)
        ? (requested as AdminSection)
        : "overview",
    };
  }
  if (route === "/account" || route.startsWith("/account/")) {
    const requested = route.split("/")[2] || "dashboard";
    return {
      kind: "account",
      section: ACCOUNT_SECTIONS.includes(requested as AccountSection)
        ? (requested as AccountSection)
        : "dashboard",
    };
  }
  if (route === "/categories") return { kind: "categories" };
  if (route.startsWith("/categories/")) {
    const cat = getCategory(route.split("/")[2]);
    if (cat) return { kind: "category", slug: cat.slug };
    return { kind: "not-found" };
  }
  if (route === "/about") return { kind: "about" };
  return { kind: "not-found" };
}
"""

NEW_ROUTEVIEW = """function RouteView({ route, onNav, onSearch }: { route: string; onNav: (p: string) => void; onSearch: () => void }) {
  const c = classifyRoute(route);
  switch (c.kind) {
    case "tool": return <ToolView id={c.id} />;
    case "home": return <Home onNav={onNav} onSearch={onSearch} />;
    case "tools": return <AllTools onNav={onNav} />;
    case "workflows": return <WorkflowsPage onNav={onNav} />;
    case "auth": return <AuthPage mode={c.mode} onNav={onNav} />;
    case "admin": return <AdminPage section={c.section} onNav={onNav} />;
    case "account": return <AccountPage section={c.section} onNav={onNav} />;
    case "categories": return <AllCategories onNav={onNav} />;
    case "category": return <CategoryPage slug={c.slug} onNav={onNav} />;
    case "about": return <About />;
    case "not-found": return <NotFound onSearch={onSearch} />;
    default: return <NotFound onSearch={onSearch} />;
  }
}"""

P4_BLOCK = """
// --- P4: route classification (404 regression) ---
{
  const c = (r: string, w = true) => classifyRoute(r, w);
  eq("routes: known tool route -> tool", c(TOOLS[0]!.route).kind, "tool");
  eq("routes: home -> home", c("/").kind, "home");
  eq("routes: tools index -> tools", c("/tools").kind, "tools");
  eq("routes: workflows enabled -> workflows", c("/workflows", true).kind, "workflows");
  eq("404: workflows disabled -> not-found", c("/workflows", false).kind, "not-found");
  eq("routes: login -> auth", c("/login").kind, "auth");
  const adminC = c("/admin/nonsense");
  if (adminC.kind !== "admin") throw new Error("expected admin classification");
  eq("routes: admin invalid section falls back to overview", adminC.section, "overview");
  const accountC = c("/account/nonsense");
  if (accountC.kind !== "account") throw new Error("expected account classification");
  eq("routes: account invalid section falls back to dashboard", accountC.section, "dashboard");
  eq("routes: known category -> category", c(`/categories/${CATEGORIES[0]!.slug}`).kind, "category");
  eq("404: unknown category slug -> not-found", c("/categories/not-a-real-category").kind, "not-found");
  eq("404: bogus route -> not-found", c("/no-such-tool-xyz").kind, "not-found");
  eq("routes: about still resolves", c("/about").kind, "about");
}
"""


def die(msg: str) -> None:
    print(f"ABORT: {msg}")
    sys.exit(1)


def main() -> None:
    # 1) routes.ts
    if ROUTES_PATH.exists():
        print("1: src/lib/routes.ts already present (idempotent)")
    else:
        ROUTES_PATH.write_text(ROUTES_SRC, encoding="utf-8")
        print("1: wrote src/lib/routes.ts")

    # 2) App.tsx
    app = APP_PATH.read_text(encoding="utf-8")
    if "classifyRoute" in app:
        print("2: App.tsx already patched (idempotent)")
    else:
        m = re.search(
            r"function RouteView\(\{ route, onNav, onSearch \}.*?return <NotFound onSearch=\{onSearch\} />;\n\}",
            app,
            re.S,
        )
        if not m:
            die("RouteView block not found in App.tsx")
        old = m.group(0)
        for frag in ('isFeatureEnabled("workflows")', "AdminPage", "AccountPage", "CategoryPage", "getCategory"):
            if frag not in old:
                die(f"unexpected RouteView body (missing '{frag}')")
        app = app[: m.start()] + NEW_ROUTEVIEW + app[m.end():]

        anchor = 'import { AccountPage, type AccountSection } from "./pages/account";'
        if anchor not in app:
            die("AccountPage import anchor not found in App.tsx")
        app = app.replace(anchor, anchor + "\n" + 'import { classifyRoute } from "./lib/routes";', 1)

        if app.count("isFeatureEnabled(") == 0:
            feat_import = 'import { isFeatureEnabled } from "./platform/features";\n'
            if feat_import not in app:
                die("isFeatureEnabled import line not found for cleanup")
            app = app.replace(feat_import, "", 1)
            print("2b: removed now-unused isFeatureEnabled import")
        if app.count("AccountSection") == 1:
            app = app.replace(anchor, 'import { AccountPage } from "./pages/account";', 1)
            print("2b: removed now-unused AccountSection type import")

        APP_PATH.write_text(app, encoding="utf-8")
        print("2: RouteView rewired to classifyRoute")

    # 3) verify.ts
    ver = VERIFY_PATH.read_text(encoding="utf-8")
    if "P4: route classification" in ver:
        print("3: verify.ts already patched (idempotent)")
    else:
        imp_anchor = 'import { AnonymousAuthProvider } from "../src/platform/auth";'
        if imp_anchor not in ver:
            die("verify.ts import anchor not found")
        ver = ver.replace(
            imp_anchor,
            imp_anchor + "\n" + 'import { classifyRoute } from "../src/lib/routes";',
            1,
        )
        tally = "console.log(`\\n${pass} passed, ${fail} failed`);"
        if tally not in ver:
            die("verify.ts tally anchor not found")
        ver = ver.replace(tally, P4_BLOCK + "\n" + tally, 1)
        VERIFY_PATH.write_text(ver, encoding="utf-8")
        print("3: verify.ts P4 block added (12 new assertions)")

    print("patch complete: expect tsc silent + 223 passed / 0 failed")


if __name__ == "__main__":
    main()
