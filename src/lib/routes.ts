/* Phase 4 — pure route classifier.
   Extracted verbatim from App.tsx RouteView so route classification is testable
   without a DOM (see the "P4: route classification" block in scripts/verify.ts).
   RouteView consumes this; behavior is unchanged. */
import { ROUTE_MAP, getCategory } from "./registry";
import { isFeatureEnabled } from "../platform/features";
import type { AccountSection } from "../pages/account";

export const ADMIN_SECTIONS = ["overview", "tools", "categories", "users", "analytics", "audit", "health"] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export const ACCOUNT_SECTIONS: AccountSection[] = [
  "dashboard", "profile", "favorites", "workflows", "presets",
  "api-keys", "usage", "billing", "security", "settings", "collections",
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
