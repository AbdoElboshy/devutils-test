import type { ApiKeyRepository, AuditLogRepository, FavoritesRepository, PresetRepository, ProfileRepository, RecentToolsRepository, Unsubscribe, UsageService, WorkflowRepository } from "./contracts";
import type { ApiKeyMetadata, AuditLog, Favorite, Profile, RecentTool, SavedPreset, SavedWorkflow, UsageMetric } from "./models";
import { apiFetch } from "./http";

type Listener<T> = (items: T[]) => void;
class Channel<T> { listeners = new Set<Listener<T>>(); subscribe(listener: Listener<T>): Unsubscribe { this.listeners.add(listener); return () => this.listeners.delete(listener); } emit(value: T[]) { this.listeners.forEach((listener) => listener(value)); } }
const favorite = (row: Record<string, unknown>): Favorite => ({ id: String(row.id), kind: row.kind as Favorite["kind"], targetId: String(row.target_id), createdAt: String(row.created_at) });

export class HttpProfileRepository implements ProfileRepository {
  async get(): Promise<Profile | null> { const row = await apiFetch<Record<string, unknown> | null>("/api/account/profile"); return row ? { userId: String(row.user_id), displayName: String(row.display_name ?? ""), avatarUrl: String(row.avatar_url ?? ""), timezone: String(row.timezone ?? "UTC"), locale: String(row.locale ?? "en"), theme: row.theme as Profile["theme"], preferences: row.preferences as Profile["preferences"] ?? {} } : null; }
  async save(profile: Profile): Promise<Profile> { await apiFetch("/api/account/profile", { method: "PUT", body: JSON.stringify(profile) }); return profile; }
}
export class HttpFavoritesRepository implements FavoritesRepository {
  channel = new Channel<Favorite>();
  private cache: Favorite[] | null = null;
  private loading: Promise<Favorite[]> | null = null;
  private scopeId: string | null | undefined;
  private generation = 0;

  /** Scope the in-memory cache to one signed-in account. Never reuse one
   * account's favorites when authentication changes in the same browser. */
  setUserScope(userId: string | null): void {
    if (this.scopeId === userId) return;
    this.scopeId = userId;
    this.generation += 1;
    this.cache = null;
    this.loading = null;
  }

  async list(): Promise<Favorite[]> {
    if (this.cache !== null) return this.cache;
    if (this.loading) return this.loading;

    const generation = this.generation;
    let request: Promise<Favorite[]>;
    request = apiFetch<Record<string, unknown>[]>("/api/account/favorites")
      .then((rows) => {
        const next = rows.map(favorite);
        if (generation === this.generation) this.cache = next;
        return next;
      })
      .finally(() => {
        if (generation === this.generation && this.loading === request) this.loading = null;
      });
    this.loading = request;
    return request;
  }

  private async fetchFresh(generation: number): Promise<Favorite[]> {
    const rows = await apiFetch<Record<string, unknown>[]>("/api/account/favorites");
    const next = rows.map(favorite);
    if (generation === this.generation) this.cache = next;
    return next;
  }

  async toggle(kind: Favorite["kind"], targetId: string) {
    const generation = this.generation;
    await apiFetch("/api/account/favorites/toggle", {
      method: "POST",
      body: JSON.stringify({ kind, targetId }),
    });
    const next = await this.fetchFresh(generation);
    if (generation === this.generation) this.channel.emit(next);
    return next;
  }

  subscribe(listener: Listener<Favorite>) {
    const generation = this.generation;
    const unsubscribe = this.channel.subscribe((items) => {
      if (generation === this.generation) listener(items);
    });
    void this.list()
      .then((items) => { if (generation === this.generation) listener(items); })
      .catch(() => { if (generation === this.generation) listener([]); });
    return unsubscribe;
  }
}
export class HttpRecentToolsRepository implements RecentToolsRepository {
  channel = new Channel<RecentTool>(); async list() { return (await apiFetch<Record<string, unknown>[]>("/api/account/recent")).map((row) => ({ toolId: String(row.tool_id), openedAt: String(row.opened_at) })); }
  async record(toolId: string) { await apiFetch("/api/account/recent", { method: "POST", body: JSON.stringify({ toolId }) }); const next = await this.list(); this.channel.emit(next); return next; }
  async clear() { await apiFetch("/api/account/recent", { method: "DELETE" }); this.channel.emit([]); }
  subscribe(listener: Listener<RecentTool>) { void this.list().then(listener).catch(() => listener([])); return this.channel.subscribe(listener); }
}
export class HttpWorkflowRepository implements WorkflowRepository {
  channel = new Channel<SavedWorkflow>();
  async list() { return (await apiFetch<Record<string, unknown>[]>("/api/account/workflows")).map((row) => ({ id: String(row.id), name: String(row.name), description: String(row.description ?? ""), steps: row.steps as SavedWorkflow["steps"] ?? [], source: row.source as SavedWorkflow["source"], createdAt: String(row.created_at), updatedAt: String(row.updated_at), version: 1 as const })); }
  async get(id: string) { return (await this.list()).find((item) => item.id === id) ?? null; }
  async save(value: SavedWorkflow) { await apiFetch(`/api/account/workflows/${encodeURIComponent(value.id)}`, { method: "PUT", body: JSON.stringify(value) }); const next = await this.list(); this.channel.emit(next); return next.find((item) => item.id === value.id) ?? value; }
  async remove(id: string) { await apiFetch(`/api/account/workflows/${encodeURIComponent(id)}`, { method: "DELETE" }); this.channel.emit(await this.list()); }
  subscribe(listener: Listener<SavedWorkflow>) { void this.list().then(listener).catch(() => listener([])); return this.channel.subscribe(listener); }
}
export class HttpPresetRepository implements PresetRepository {
  channel = new Channel<SavedPreset>();
  async list(toolId?: string) { const rows = await apiFetch<Record<string, unknown>[]>(`/api/account/presets${toolId ? `?toolId=${encodeURIComponent(toolId)}` : ""}`); return rows.map((row) => ({ id: String(row.id), toolId: String(row.tool_id), name: String(row.name), config: row.config as SavedPreset["config"] ?? {}, createdAt: String(row.created_at), updatedAt: String(row.updated_at), version: 1 as const })); }
  async save(value: SavedPreset) { await apiFetch(`/api/account/presets/${encodeURIComponent(value.id)}`, { method: "PUT", body: JSON.stringify(value) }); const next = await this.list(); this.channel.emit(next); return next.find((item) => item.id === value.id) ?? value; }
  async remove(id: string) { await apiFetch(`/api/account/presets/${encodeURIComponent(id)}`, { method: "DELETE" }); this.channel.emit(await this.list()); }
  subscribe(listener: Listener<SavedPreset>) { void this.list().then(listener).catch(() => listener([])); return this.channel.subscribe(listener); }
}
export class HttpApiKeyRepository implements ApiKeyRepository {
  async list() { return (await apiFetch<Record<string, unknown>[]>("/api/account/api-keys")).map((row) => ({ id: String(row.id), name: String(row.name), prefix: String(row.prefix), scopes: row.scopes as ApiKeyMetadata["scopes"], createdAt: String(row.created_at), lastUsedAt: row.last_used_at ? String(row.last_used_at) : null, revokedAt: row.revoked_at ? String(row.revoked_at) : null })); }
  async create(input: { userId: string; name: string; scopes: ApiKeyMetadata["scopes"] }) { return apiFetch<{ metadata: ApiKeyMetadata; secret: string }>("/api/account/api-keys", { method: "POST", body: JSON.stringify({ name: input.name, scopes: input.scopes }) }); }
  async revoke(id: string) { await apiFetch(`/api/account/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" }); }
}
export class HttpUsageService implements UsageService {
  async getUsage(_subject: string, metric: UsageMetric) { const summary = await this.summary(); const map: Record<string, number> = { tool_runs: summary.toolRuns, workflow_runs: summary.workflowRuns, api_requests: summary.apiRequests, integration_calls: summary.integrationCalls }; return map[metric] ?? 0; }
  async canConsume() { return true; }
  async consume(_subject: string, metric: UsageMetric, _quantity = 1, resourceId?: string) { if (metric === "tool_runs" || metric === "workflow_runs") await apiFetch("/api/account/usage", { method: "POST", body: JSON.stringify({ metric, resourceId }) }); }
  async summary() { const row = await apiFetch<Record<string, unknown>>("/api/account/usage"); return { toolRuns: Number(row.tool_runs ?? 0), workflowRuns: Number(row.workflow_runs ?? 0), apiRequests: Number(row.api_requests ?? 0), integrationCalls: Number(row.integration_calls ?? 0), periodStart: String(row.period_start ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()) }; }
}
export class HttpAuditRepository implements AuditLogRepository { async list() { return (await apiFetch<Record<string, unknown>[]>("/api/account/audit")).map((row) => ({ id: String(row.id), userId: String(row.user_id), action: row.action as AuditLog["action"], metadata: row.metadata as AuditLog["metadata"] ?? {}, createdAt: String(row.created_at) })); } }