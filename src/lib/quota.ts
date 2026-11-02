// Quota awareness - pure formatting of counts vs plan limits. No IO.
import { PLANS, capabilities } from "../platform/features";
import type { PlanId } from "../platform/models";

export type QuotaKind = "ok" | "near" | "over";

export type QuotaStatus = { metric: string; used: number; limit: number | null; kind: QuotaKind };

export type QuotaCounts = {
  savedWorkflows: number;
  workflowRuns: number;
  apiRequests: number;
};

const NEAR_THRESHOLD = 0.8;

function classify(used: number, limit: number | null): QuotaKind {
  if (limit === null) return "ok";
  if (used >= limit) return "over";
  if (limit > 0 && used / limit >= NEAR_THRESHOLD) return "near";
  return "ok";
}

/** Derive quota statuses from explicit counts and the effective plan. */
export function quotaStatus(counts: QuotaCounts, planId: PlanId | null): QuotaStatus[] {
  const plan = PLANS[planId ?? capabilities.getPlan(null)];
  const entries: { metric: string; used: number; limit: number | null }[] = [
    { metric: "workflows saved", used: counts.savedWorkflows, limit: plan.limits.saved_workflows },
    { metric: "workflow runs", used: counts.workflowRuns, limit: null },
    { metric: "API requests", used: counts.apiRequests, limit: plan.limits.api_requests_per_month },
  ];
  return entries.map((entry) => ({ ...entry, kind: classify(entry.used, entry.limit) }));
}

export function quotaLabel(entry: QuotaStatus): string {
  if (entry.limit === null) return `${entry.metric}: ${entry.used} (no cap)`;
  return `${entry.metric}: ${entry.used}/${entry.limit}`;
}
