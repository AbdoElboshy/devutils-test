import type { FavoritesRepository, PresetRepository, RecentToolsRepository, WorkflowRepository } from "./contracts";

export type LocalMergePreview = {
  favorites: number;
  recentTools: number;
  workflows: number;
  presets: number;
};

export class AccountMergeService {
  constructor(
    private localFavorites: FavoritesRepository,
    private localRecent: RecentToolsRepository,
    private localWorkflows: WorkflowRepository,
    private localPresets: PresetRepository,
    private cloudFavorites: FavoritesRepository,
    private cloudRecent: RecentToolsRepository,
    private cloudWorkflows: WorkflowRepository,
    private cloudPresets: PresetRepository,
  ) {}

  async preview(): Promise<LocalMergePreview> {
    const [favorites, recent, workflows, presets] = await Promise.all([this.localFavorites.list(), this.localRecent.list(), this.localWorkflows.list(), this.localPresets.list()]);
    return { favorites: favorites.length, recentTools: recent.length, workflows: workflows.length, presets: presets.length };
  }

  // Merge is explicit and additive. Existing cloud records are never deleted or
  // silently overwritten; matching workflows/presets receive a new local-* id.
  async merge(): Promise<LocalMergePreview> {
    const [localFavorites, localRecent, localWorkflows, localPresets, cloudWorkflows, cloudPresets] = await Promise.all([
      this.localFavorites.list(), this.localRecent.list(), this.localWorkflows.list(), this.localPresets.list(), this.cloudWorkflows.list(), this.cloudPresets.list(),
    ]);
    const cloudFavorites = await this.cloudFavorites.list();
    for (const favorite of localFavorites) {
      if (!cloudFavorites.some((item) => item.kind === favorite.kind && item.targetId === favorite.targetId)) await this.cloudFavorites.toggle(favorite.kind, favorite.targetId);
    }
    for (const recent of localRecent) await this.cloudRecent.record(recent.toolId);
    for (const workflow of localWorkflows) {
      const id = cloudWorkflows.some((item) => item.id === workflow.id) ? `local-${crypto.randomUUID()}` : workflow.id;
      await this.cloudWorkflows.save({ ...workflow, id, name: id === workflow.id ? workflow.name : `${workflow.name} (local)` });
    }
    for (const preset of localPresets) {
      const id = cloudPresets.some((item) => item.id === preset.id) ? crypto.randomUUID() : preset.id;
      await this.cloudPresets.save({ ...preset, id, name: id === preset.id ? preset.name : `${preset.name} (local)` });
    }
    return { favorites: localFavorites.length, recentTools: localRecent.length, workflows: localWorkflows.length, presets: localPresets.length };
  }
}