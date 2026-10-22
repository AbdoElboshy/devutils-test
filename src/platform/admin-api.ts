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

/* ---------------- Phase 6: user management ---------------- */

export type AdminUser = {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  suspended: boolean;
  role: string | null;
};
export type AdminUsersPage = { users: AdminUser[]; total: number; authTotal: number; page: number; pageSize: number };

export async function fetchAdminUsers(params: { query?: string; status?: string; page?: number; pageSize?: number } = {}): Promise<AdminUsersPage> {
  const qs = new URLSearchParams();
  if (params.query) qs.set("query", params.query);
  if (params.status && params.status !== "all") qs.set("status", params.status);
  qs.set("page", String(params.page ?? 1));
  qs.set("pageSize", String(params.pageSize ?? 25));
  return apiFetch<AdminUsersPage>(`/api/admin/users?${qs.toString()}`);
}
export async function suspendUser(id: string): Promise<unknown> {
  return apiFetch(`/api/admin/users/${encodeURIComponent(id)}/suspend`, { method: "POST" });
}
export async function reactivateUser(id: string): Promise<unknown> {
  return apiFetch(`/api/admin/users/${encodeURIComponent(id)}/reactivate`, { method: "POST" });
}
export async function revokeUserAccess(id: string): Promise<unknown> {
  return apiFetch(`/api/admin/users/${encodeURIComponent(id)}/revoke-access`, { method: "POST" });
}
export async function setUserRole(id: string, role: string): Promise<unknown> {
  return apiFetch(`/api/admin/users/${encodeURIComponent(id)}/role`, { method: "PUT", body: JSON.stringify({ role }) });
}
export async function revokeUserRole(id: string): Promise<unknown> {
  return apiFetch(`/api/admin/users/${encodeURIComponent(id)}/role`, { method: "DELETE" });
}

/* ---------------- Phase 6 WS C/D: flags + version history ---------------- */

export type AdminFlag = { key: string; enabled: boolean; defaultEnabled: boolean; overridden: boolean; updatedAt: string | null };
export type ToolVersion = { id: number; patch: Record<string, unknown>; change_kind: string; changed_by: string | null; created_at: string };

export async function fetchAdminFlags(): Promise<AdminFlag[]> {
  return apiFetch("/api/admin/flags");
}
export async function setFeatureFlag(key: string, enabled: boolean): Promise<unknown> {
  return apiFetch(`/api/admin/flags/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ enabled }) });
}
export async function fetchToolHistory(id: string): Promise<ToolVersion[]> {
  return apiFetch(`/api/admin/tools/${encodeURIComponent(id)}/history`);
}
export async function restoreToolVersion(id: string, versionId: number): Promise<unknown> {
  return apiFetch(`/api/admin/tools/${encodeURIComponent(id)}/restore`, { method: "POST", body: JSON.stringify({ versionId }) });
}
