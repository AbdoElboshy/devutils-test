/**
 * Admin API client. All calls are same-origin, cookie-authenticated, and
 * CSRF-protected via apiFetch. The gateway enforces administrator role
 * server-side; these helpers only shape requests and surface typed errors.
 */
import { apiFetch } from "./http";
import type { Category, Tool } from "../lib/registry";

export type ToolOverlay = Partial<Pick<Tool,
  "name" | "slug" | "route" | "description" | "longDescription" | "category" |
  "keywords" | "aliases" | "related" | "tags" | "featured">> & {
  id: string; order?: number; enabled?: boolean; visibility?: "published" | "draft" | "archived";
};
export type CategoryOverlay = Partial<Pick<Category, "name" | "slug" | "description" | "tagline">> & {
  id: string; order?: number; enabled?: boolean;
};

export type AdminRegistry = {
  tools: (Tool & { order: number; visibility: string; enabled: boolean; updatedAt?: string | null })[];
  categories: (Category & { order: number; enabled?: boolean })[];
  baseToolIds: string[];
  visibilityOptions: string[];
};

export type AdminAnalytics = {
  windowDays: number;
  since: string;
  available: { anonymousEvents: boolean; accountUsage: boolean };
  registeredUsers: number;
  newUsersInWindow: number;
  workflowRuns: number;
  authFailures: number;
  toolFailures: number;
  topTools: { toolId: string; name: string; count: number }[];
  leastUsedTools: { toolId: string; name: string; count: number }[];
  byCategory: { categoryId: string; count: number }[];
  collectedAt: string;
};

export type AdminHealth = {
  status: "ok" | "degraded";
  checks: Record<string, { ok: boolean; rows?: number; error?: string }>;
  migrationRequired: boolean;
};

export type AuditEntry = { id: number; user_id: string; action: string; metadata: Record<string, unknown>; created_at: string };

export async function fetchAdminRegistry(): Promise<AdminRegistry> {
  return apiFetch<AdminRegistry>("/api/admin/registry");
}
export async function saveToolOverride(id: string, patch: ToolOverlay): Promise<unknown> {
  return apiFetch(`/api/admin/tools/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(patch) });
}
export async function resetToolOverride(id: string): Promise<unknown> {
  return apiFetch(`/api/admin/tools/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export async function reorderTools(order: { id: string }[]): Promise<unknown> {
  return apiFetch("/api/admin/tools/reorder", { method: "POST", body: JSON.stringify({ order }) });
}
export async function saveCategoryOverride(id: string, patch: CategoryOverlay): Promise<unknown> {
  return apiFetch(`/api/admin/categories/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(patch) });
}
export async function exportRegistry(): Promise<{ version: number; tools: ToolOverlay[]; categories: CategoryOverlay[] }> {
  return apiFetch("/api/admin/export");
}
export async function importRegistry(payload: unknown, dryRun: boolean): Promise<{ ok: true; dryRun?: boolean; wouldWrite?: number; written?: number } | { errors: string[] }> {
  return apiFetch("/api/admin/import", { method: "POST", body: JSON.stringify({ ...(payload as object), dryRun }) });
}
export async function fetchAdminAnalytics(days = 30): Promise<AdminAnalytics> {
  return apiFetch<AdminAnalytics>(`/api/admin/analytics?days=${days}`);
}
export async function fetchAdminAudit(limit = 50): Promise<AuditEntry[]> {
  return apiFetch<AuditEntry[]>(`/api/admin/audit?limit=${limit}`);
}
export async function fetchAdminHealth(): Promise<AdminHealth> {
  return apiFetch<AdminHealth>("/api/admin/health");
}
export async function fetchAdminMe(): Promise<{ role: string; userId: string; email: string | null }> {
  return apiFetch("/api/admin/me");
}
