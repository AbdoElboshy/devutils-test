import type { EntitlementService } from "./contracts";
import type { Feature, LimitKey, Plan, PlanId, User } from "./models";
import { isAccountBackendConfigured } from "./config";

export type FeatureFlag =
  | "new_search"
  | "accounts"
  | "pro"
  | "api"
  | "workflows"
  | "presets"
  | "teams"
  | "ai_explain"
  | "browser_extension"
  | "grafana_tools"
  | "zabbix_tools"
  | "prometheus_tools"
  | "loki_tools"
  | "observability_tools"
  | "cloud_tools";

export const FEATURE_FLAGS: Readonly<Record<FeatureFlag, boolean>> = Object.freeze({
  new_search: true,
  accounts: isAccountBackendConfigured(),
  pro: false,
  api: false,
  workflows: true,
  presets: true,
  teams: false,
  ai_explain: false,
  browser_extension: false,
  grafana_tools: true,
  zabbix_tools: true,
  prometheus_tools: true,
  loki_tools: true,
  observability_tools: true,
  cloud_tools: true,
});

const limits = (values: Partial<Record<LimitKey, number | null>>): Record<LimitKey, number | null> => ({
  requests_per_day: null,
  api_requests_per_month: 0,
  maximum_input_bytes: 5_000_000,
  batch_operations: 0,
  saved_workflows: 12,
  saved_presets: 30,
  team_members: 0,
  ...values,
});

export const PLANS: Readonly<Record<PlanId, Plan>> = Object.freeze({
  anonymous: {
    id: "anonymous",
    name: "Anonymous",
    features: ["basic_tools", "advanced_tools", "local_workflows", "saved_workflows", "saved_presets"],
    limits: limits({}),
  },
  free: {
    id: "free",
    name: "Free",
    features: ["basic_tools", "advanced_tools", "local_workflows", "saved_workflows", "saved_presets", "cloud_sync", "api_access"],
    limits: limits({ api_requests_per_month: 1_000, saved_workflows: 25, saved_presets: 60 }),
  },
  pro: {
    id: "pro",
    name: "Pro",
    features: ["basic_tools", "advanced_tools", "local_workflows", "saved_workflows", "saved_presets", "cloud_sync", "api_access", "higher_api_limits", "batch_processing", "advanced_integrations"],
    limits: limits({ api_requests_per_month: 50_000, maximum_input_bytes: 50_000_000, batch_operations: 100, saved_workflows: null, saved_presets: null }),
  },
  team: {
    id: "team",
    name: "Team",
    features: ["basic_tools", "advanced_tools", "local_workflows", "saved_workflows", "saved_presets", "cloud_sync", "api_access", "higher_api_limits", "batch_processing", "team_workspaces", "advanced_integrations"],
    limits: limits({ api_requests_per_month: 250_000, maximum_input_bytes: 100_000_000, batch_operations: 500, saved_workflows: null, saved_presets: null, team_members: 25 }),
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    features: ["basic_tools", "advanced_tools", "local_workflows", "saved_workflows", "saved_presets", "cloud_sync", "api_access", "higher_api_limits", "batch_processing", "team_workspaces", "advanced_integrations"],
    limits: limits({ api_requests_per_month: null, maximum_input_bytes: null, batch_operations: null, saved_workflows: null, saved_presets: null, team_members: null }),
  },
});

export class CapabilityService implements EntitlementService {
  getPlan(user: User | null): PlanId {
    return user?.planId && PLANS[user.planId] ? user.planId : "anonymous";
  }

  hasFeature(user: User | null, feature: Feature): boolean {
    return PLANS[this.getPlan(user)].features.includes(feature);
  }

  getLimit(user: User | null, limit: LimitKey): number | null {
    return PLANS[this.getPlan(user)].limits[limit];
  }
}

export const capabilities = new CapabilityService();

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  /* Phase 6 WS D: gateway-mediated flags (from runtime-config.js) win;
     the static table is the offline/failure fallback. */
  const gateway = typeof window !== "undefined"
    ? (window as unknown as { __DEVUTILS_CONFIG__?: { flags?: Partial<Record<FeatureFlag, boolean>> } }).__DEVUTILS_CONFIG__?.flags
    : undefined;
  if (gateway && flag in gateway) return Boolean(gateway[flag]);
  return FEATURE_FLAGS[flag];
}