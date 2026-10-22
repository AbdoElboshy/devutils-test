import type { AuthProvider, CollectionsRepository, FavoritesRepository, PinnedToolsRepository, PresetRepository, RecentToolsRepository, Unsubscribe, WorkflowRepository } from "./contracts";
import type { Collection, CollectionItem, Favorite, PinnedTool, RecentTool, SavedPreset, SavedWorkflow, User } from "./models";

type SubscribableRepository<T> = { subscribe(listener: (items: T[]) => void): Unsubscribe };
type ScopedFavoritesRepository = FavoritesRepository & { setUserScope?: (userId: string | null) => void };

class AdaptiveBase<T> {
  protected listeners = new Set<(items: T[]) => void>();
  protected authenticated = false;
  private sourceUnsubscribe: Unsubscribe | null = null;
  private latest: T[] | null = null;
  private scopeKey: string | null | undefined;

  constructor(
    protected auth: AuthProvider,
    protected local: SubscribableRepository<T>,
    protected cloud: SubscribableRepository<T> | null,
    private readonly onAuthScopeChange?: (user: User | null) => void,
  ) {
    auth.subscribe((user) => {
      // Update repository-specific cache scope before binding a source that may
      // immediately start an HTTP request.
      this.onAuthScopeChange?.(user);
      const nextAuthenticated = Boolean(user && cloud);
      const nextScopeKey = nextAuthenticated ? user!.id : null;
      if (this.authenticated === nextAuthenticated && this.scopeKey === nextScopeKey) return;
      this.authenticated = nextAuthenticated;
      this.scopeKey = nextScopeKey;
      this.latest = null;
      // Clear previous-account UI immediately while the new source is loading.
      this.listeners.forEach((listener) => listener([]));
      this.bind();
    });
    this.bind();
  }

  protected source(): SubscribableRepository<T> { return this.authenticated && this.cloud ? this.cloud : this.local; }

  protected bind(): void {
    this.sourceUnsubscribe?.();
    this.latest = null;
    this.sourceUnsubscribe = this.source().subscribe((items) => {
      this.latest = items;
      this.listeners.forEach((listener) => listener(items));
    });
  }

  subscribe(listener: (items: T[]) => void): Unsubscribe {
    this.listeners.add(listener);
    if (this.latest !== null) listener(this.latest);
    return () => { this.listeners.delete(listener); };
  }
}

export class AdaptiveFavoritesRepository extends AdaptiveBase<Favorite> implements FavoritesRepository {
  declare protected local: FavoritesRepository;
  declare protected cloud: FavoritesRepository | null;

  constructor(auth: AuthProvider, local: FavoritesRepository, cloud: ScopedFavoritesRepository | null) {
    super(auth, local, cloud, (user) => cloud?.setUserScope?.(user?.id ?? null));
  }

  async list(): Promise<Favorite[]> { return this.authenticated && this.cloud ? this.cloud.list() : this.local.list(); }
  async toggle(kind: Favorite["kind"], targetId: string): Promise<Favorite[]> { return this.authenticated && this.cloud ? this.cloud.toggle(kind, targetId) : this.local.toggle(kind, targetId); }
}

export class AdaptiveRecentToolsRepository extends AdaptiveBase<RecentTool> implements RecentToolsRepository {
  declare protected local: RecentToolsRepository; declare protected cloud: RecentToolsRepository | null;
  async list(): Promise<RecentTool[]> { return this.authenticated && this.cloud ? this.cloud.list() : this.local.list(); }
  async record(id: string): Promise<RecentTool[]> { return this.authenticated && this.cloud ? this.cloud.record(id) : this.local.record(id); }
  async clear(): Promise<void> { return this.authenticated && this.cloud ? this.cloud.clear() : this.local.clear(); }
}
export class AdaptiveWorkflowRepository extends AdaptiveBase<SavedWorkflow> implements WorkflowRepository {
  declare protected local: WorkflowRepository; declare protected cloud: WorkflowRepository | null;
  async list(): Promise<SavedWorkflow[]> { return this.authenticated && this.cloud ? this.cloud.list() : this.local.list(); }
  async get(id: string): Promise<SavedWorkflow | null> { return this.authenticated && this.cloud ? this.cloud.get(id) : this.local.get(id); }
  async save(value: SavedWorkflow): Promise<SavedWorkflow> { return this.authenticated && this.cloud ? this.cloud.save(value) : this.local.save(value); }
  async remove(id: string): Promise<void> { return this.authenticated && this.cloud ? this.cloud.remove(id) : this.local.remove(id); }
}
export class AdaptivePresetRepository extends AdaptiveBase<SavedPreset> implements PresetRepository {
  declare protected local: PresetRepository; declare protected cloud: PresetRepository | null;
  async list(toolId?: string): Promise<SavedPreset[]> { return this.authenticated && this.cloud ? this.cloud.list(toolId) : this.local.list(toolId); }
  async save(value: SavedPreset): Promise<SavedPreset> { return this.authenticated && this.cloud ? this.cloud.save(value) : this.local.save(value); }
  async remove(id: string): Promise<void> { return this.authenticated && this.cloud ? this.cloud.remove(id) : this.local.remove(id); }
}

export class AdaptivePinnedToolsRepository extends AdaptiveBase<PinnedTool> implements PinnedToolsRepository {
  declare protected local: PinnedToolsRepository;
  declare protected cloud: PinnedToolsRepository | null;

  constructor(auth: AuthProvider, local: PinnedToolsRepository, cloud: (PinnedToolsRepository & { setUserScope?: (userId: string | null) => void }) | null) {
    super(auth, local, cloud, (user) => cloud?.setUserScope?.(user?.id ?? null));
  }

  async list(): Promise<PinnedTool[]> { return this.authenticated && this.cloud ? this.cloud.list() : this.local.list(); }
  async pin(toolId: string): Promise<PinnedTool[]> { return this.authenticated && this.cloud ? this.cloud.pin(toolId) : this.local.pin(toolId); }
  async unpin(toolId: string): Promise<PinnedTool[]> { return this.authenticated && this.cloud ? this.cloud.unpin(toolId) : this.local.unpin(toolId); }
  async reorder(toolIds: string[]): Promise<PinnedTool[]> { return this.authenticated && this.cloud ? this.cloud.reorder(toolIds) : this.local.reorder(toolIds); }
}

export class AdaptiveCollectionsRepository extends AdaptiveBase<Collection> implements CollectionsRepository {
  declare protected local: CollectionsRepository;
  declare protected cloud: CollectionsRepository | null;

  constructor(auth: AuthProvider, local: CollectionsRepository, cloud: (CollectionsRepository & { setUserScope?: (userId: string | null) => void }) | null) {
    super(auth, local, cloud, (user) => cloud?.setUserScope?.(user?.id ?? null));
  }

  async list(): Promise<Collection[]> { return this.authenticated && this.cloud ? this.cloud.list() : this.local.list(); }
  async create(input: { name: string; description?: string }): Promise<Collection> { return this.authenticated && this.cloud ? this.cloud.create(input) : this.local.create(input); }
  async update(id: string, patch: { name?: string; description?: string }): Promise<Collection> { return this.authenticated && this.cloud ? this.cloud.update(id, patch) : this.local.update(id, patch); }
  async remove(id: string): Promise<void> { return this.authenticated && this.cloud ? this.cloud.remove(id) : this.local.remove(id); }
  async items(collectionId: string): Promise<CollectionItem[]> { return this.authenticated && this.cloud ? this.cloud.items(collectionId) : this.local.items(collectionId); }
  async addItem(collectionId: string, kind: Favorite["kind"], targetId: string): Promise<CollectionItem[]> { return this.authenticated && this.cloud ? this.cloud.addItem(collectionId, kind, targetId) : this.local.addItem(collectionId, kind, targetId); }
  async removeItem(collectionId: string, targetId: string): Promise<CollectionItem[]> { return this.authenticated && this.cloud ? this.cloud.removeItem(collectionId, targetId) : this.local.removeItem(collectionId, targetId); }
}
