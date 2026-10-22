import type {
  CollectionsRepository,
  FavoritesRepository,
  PinnedToolsRepository,
  PresetRepository,
  RecentToolsRepository,
  Unsubscribe,
  WorkflowRepository,
} from "./contracts";
import type { Collection, CollectionItem, Favorite, PinnedTool, RecentTool, SavedPreset, SavedWorkflow } from "./models";

const STORAGE_VERSION = 1;
const KEYS = {
  favorites: "du:v1:favorites",
  recent: "du:v1:recent",
  workflows: "du:v1:workflows",
  presets: "du:v1:presets",
  pinned: "du:v1:pinned",
  collections: "du:v1:collections",
} as const;

type Listener<T> = (value: T) => void;

function read<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch { return fallback; }
}

function write<T>(key: string, value: T): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota/privacy mode */ }
}

function hasStorageKey(key: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try { return localStorage.getItem(key) !== null; } catch { return false; }
}

class Channel<T> {
  private listeners = new Set<Listener<T>>();
  constructor(private readonly load: () => T) {}

  subscribe(listener: Listener<T>): Unsubscribe {
    this.listeners.add(listener);
    listener(this.load());
    return () => this.listeners.delete(listener);
  }

  emit(value: T): void { this.listeners.forEach((listener) => listener(value)); }
}

const sensitiveKey = /(?:password|passwd|secret|token|jwt|private.?key|api.?key|certificate|pem|env.?value|authorization|cookie)/i;

function sanitizeConfig(config: Record<string, boolean | number | string>): Record<string, boolean | number | string> {
  const clean: Record<string, boolean | number | string> = {};
  Object.entries(config).forEach(([key, value]) => {
    if (!sensitiveKey.test(key) && String(value).length <= 2_000) clean[key] = value;
  });
  return clean;
}

function validWorkflow(value: SavedWorkflow): SavedWorkflow {
  return {
    ...value,
    version: STORAGE_VERSION,
    name: value.name.slice(0, 100),
    description: value.description.slice(0, 500),
    steps: value.steps.slice(0, 20).map((step) => ({
      ...step,
      label: step.label.slice(0, 100),
      config: step.config ? sanitizeConfig(step.config) : undefined,
    })),
  };
}

export class LocalStorageFavoritesRepository implements FavoritesRepository {
  private readonly channel = new Channel(() => this.snapshot());

  private snapshot(): Favorite[] {
    const current = read<Favorite[]>(KEYS.favorites, []);
    // Migrate the original array-of-tool-ids format without breaking favorites.
    if (current.length && typeof current[0] === "string") {
      return (current as unknown as string[]).map((targetId) => ({
        id: `tool:${targetId}`,
        kind: "tool" as const,
        targetId,
        createdAt: new Date(0).toISOString(),
      }));
    }
    if (hasStorageKey(KEYS.favorites)) return current;
    const legacy = read<string[]>("du:favs", []);
    return legacy.map((targetId) => ({ id: `tool:${targetId}`, kind: "tool", targetId, createdAt: new Date(0).toISOString() }));
  }

  async list(): Promise<Favorite[]> { return this.snapshot(); }

  async toggle(kind: Favorite["kind"], targetId: string): Promise<Favorite[]> {
    const current = this.snapshot();
    const exists = current.some((item) => item.kind === kind && item.targetId === targetId);
    const next = exists
      ? current.filter((item) => !(item.kind === kind && item.targetId === targetId))
      : [...current, { id: `${kind}:${targetId}`, kind, targetId, createdAt: new Date().toISOString() }];
    write(KEYS.favorites, next);
    this.channel.emit(next);
    return next;
  }

  subscribe(listener: Listener<Favorite[]>): Unsubscribe { return this.channel.subscribe(listener); }
}

export class LocalStorageRecentToolsRepository implements RecentToolsRepository {
  private readonly channel = new Channel(() => this.snapshot());

  private snapshot(): RecentTool[] {
    const current = read<RecentTool[]>(KEYS.recent, []);
    if (hasStorageKey(KEYS.recent)) return current;
    return read<string[]>("du:recent", []).map((toolId, index) => ({ toolId, openedAt: new Date(index).toISOString() }));
  }

  async list(): Promise<RecentTool[]> { return this.snapshot(); }

  async record(toolId: string): Promise<RecentTool[]> {
    const next = [{ toolId, openedAt: new Date().toISOString() }, ...this.snapshot().filter((item) => item.toolId !== toolId)].slice(0, 12);
    write(KEYS.recent, next);
    this.channel.emit(next);
    return next;
  }

  async clear(): Promise<void> { write(KEYS.recent, []); this.channel.emit([]); }
  subscribe(listener: Listener<RecentTool[]>): Unsubscribe { return this.channel.subscribe(listener); }
}

export class LocalStorageWorkflowRepository implements WorkflowRepository {
  private readonly channel = new Channel(() => this.snapshot());
  private snapshot(): SavedWorkflow[] { return read<SavedWorkflow[]>(KEYS.workflows, []).map(validWorkflow); }
  async list(): Promise<SavedWorkflow[]> { return this.snapshot(); }
  async get(id: string): Promise<SavedWorkflow | null> { return this.snapshot().find((item) => item.id === id) ?? null; }

  async save(workflow: SavedWorkflow): Promise<SavedWorkflow> {
    const safe = validWorkflow({ ...workflow, updatedAt: new Date().toISOString() });
    const next = [safe, ...this.snapshot().filter((item) => item.id !== safe.id)];
    write(KEYS.workflows, next);
    this.channel.emit(next);
    return safe;
  }

  async remove(id: string): Promise<void> {
    const next = this.snapshot().filter((item) => item.id !== id);
    write(KEYS.workflows, next);
    this.channel.emit(next);
  }

  subscribe(listener: Listener<SavedWorkflow[]>): Unsubscribe { return this.channel.subscribe(listener); }
}

export class LocalStoragePresetRepository implements PresetRepository {
  private readonly channel = new Channel(() => this.snapshot());
  private snapshot(): SavedPreset[] { return read<SavedPreset[]>(KEYS.presets, []); }
  async list(toolId?: string): Promise<SavedPreset[]> { return this.snapshot().filter((item) => !toolId || item.toolId === toolId); }

  async save(preset: SavedPreset): Promise<SavedPreset> {
    const safe: SavedPreset = {
      ...preset,
      version: STORAGE_VERSION,
      name: preset.name.slice(0, 100),
      config: sanitizeConfig(preset.config),
      updatedAt: new Date().toISOString(),
    };
    const next = [safe, ...this.snapshot().filter((item) => item.id !== safe.id)];
    write(KEYS.presets, next);
    this.channel.emit(next);
    return safe;
  }

  async remove(id: string): Promise<void> {
    const next = this.snapshot().filter((item) => item.id !== id);
    write(KEYS.presets, next);
    this.channel.emit(next);
  }

  subscribe(listener: Listener<SavedPreset[]>): Unsubscribe { return this.channel.subscribe(listener); }
}

export const localFavorites = new LocalStorageFavoritesRepository();
export const localRecentTools = new LocalStorageRecentToolsRepository();
export const localWorkflows = new LocalStorageWorkflowRepository();
export const localPresets = new LocalStoragePresetRepository();

function newId(): string {
  const uuid = globalThis.crypto?.randomUUID;
  return uuid ? uuid.call(globalThis.crypto) : "col-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

export class LocalStoragePinnedToolsRepository implements PinnedToolsRepository {
  private readonly channel = new Channel(() => this.snapshot());

private snapshot(): PinnedTool[] {
    return read<PinnedTool[]>(KEYS.pinned, [])
      .map((item) => ({ toolId: String(item.toolId), sortOrder: Number(item.sortOrder) || 0, createdAt: String(item.createdAt) }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

async list(): Promise<PinnedTool[]> { return this.snapshot(); }

async pin(toolId: string): Promise<PinnedTool[]> {
    const current = this.snapshot();
    if (current.some((item) => item.toolId === toolId)) return current;
    const maxOrder = current.length ? Math.max(...current.map((item) => item.sortOrder)) : -1;
    const next = [...current, { toolId, sortOrder: maxOrder + 1, createdAt: new Date().toISOString() }];
    write(KEYS.pinned, next);
    this.channel.emit(next);
    return next;
  }

async unpin(toolId: string): Promise<PinnedTool[]> {
    const next = this.snapshot().filter((item) => item.toolId !== toolId);
    write(KEYS.pinned, next);
    this.channel.emit(next);
    return next;
  }

async reorder(toolIds: string[]): Promise<PinnedTool[]> {
    const current = this.snapshot();
    const byId = new Map(current.map((item) => [item.toolId, item]));
    const known = toolIds.filter((id) => byId.has(id));
    const next: PinnedTool[] = known.map((id, index) => ({ ...byId.get(id) as PinnedTool, sortOrder: index }))
      .concat(current.filter((item) => !known.includes(item.toolId)));
    write(KEYS.pinned, next);
    this.channel.emit(next);
    return next;
  }

subscribe(listener: Listener<PinnedTool[]>): Unsubscribe { return this.channel.subscribe(listener); }
}

type StoredCollection = { id: string; name: string; description: string; items: CollectionItem[]; createdAt: string; updatedAt: string };

export class LocalStorageCollectionsRepository implements CollectionsRepository {
  private readonly channel = new Channel(() => this.view());

private snapshot(): StoredCollection[] {
    return read<StoredCollection[]>(KEYS.collections, []).map((collection) => ({
      id: String(collection.id),
      name: String(collection.name ?? "").slice(0, 60),
      description: String(collection.description ?? "").slice(0, 200),
      items: Array.isArray(collection.items)
        ? collection.items.map((item) => ({ kind: item.kind, targetId: String(item.targetId), sortOrder: Number(item.sortOrder) || 0, addedAt: String(item.addedAt) }))
        : [],
      createdAt: String(collection.createdAt),
      updatedAt: String(collection.updatedAt),
    }));
  }

private view(): Collection[] {
    return this.snapshot().map((collection) => ({ id: collection.id, name: collection.name, description: collection.description, createdAt: collection.createdAt, updatedAt: collection.updatedAt }));
  }

private stored(id: string): StoredCollection {
    const found = this.snapshot().find((collection) => collection.id === id);
    if (!found) throw new Error("Collection not found.");
    return found;
  }

async list(): Promise<Collection[]> { return this.view(); }

async create(input: { name: string; description?: string }): Promise<Collection> {
    const name = input.name.trim().slice(0, 60);
    if (!name) throw new Error("Collection name cannot be empty.");
    if (this.snapshot().some((collection) => collection.name === name)) throw new Error("A collection with that name already exists.");
    const now = new Date().toISOString();
    const created: StoredCollection = { id: newId(), name, description: (input.description ?? "").slice(0, 200), items: [], createdAt: now, updatedAt: now };
    write(KEYS.collections, [created, ...this.snapshot()]);
    const view = this.view();
    this.channel.emit(view);
    return view.find((collection) => collection.id === created.id) as Collection;
  }

async update(id: string, patch: { name?: string; description?: string }): Promise<Collection> {
    const current = this.snapshot();
    const target = this.stored(id);
    const name = patch.name !== undefined ? patch.name.trim().slice(0, 60) : target.name;
    if (!name) throw new Error("Collection name cannot be empty.");
    if (patch.name !== undefined && current.some((collection) => collection.id !== id && collection.name === name)) throw new Error("A collection with that name already exists.");
    const description = patch.description !== undefined ? patch.description.slice(0, 200) : target.description;
    const next = current.map((collection) => collection.id === id ? { ...collection, name, description, updatedAt: new Date().toISOString() } : collection);
    write(KEYS.collections, next);
    const view = this.view();
    this.channel.emit(view);
    return view.find((collection) => collection.id === id) as Collection;
  }

async remove(id: string): Promise<void> {
    write(KEYS.collections, this.snapshot().filter((collection) => collection.id !== id));
    this.channel.emit(this.view());
  }

async items(collectionId: string): Promise<CollectionItem[]> {
    return this.stored(collectionId).items.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  }

async addItem(collectionId: string, kind: Favorite["kind"], targetId: string): Promise<CollectionItem[]> {
    const target = this.stored(collectionId);
    if (target.items.some((item) => item.targetId === targetId)) return target.items.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const maxOrder = target.items.length ? Math.max(...target.items.map((item) => item.sortOrder)) : -1;
    const added: CollectionItem = { kind, targetId, sortOrder: maxOrder + 1, addedAt: new Date().toISOString() };
    const next = this.snapshot().map((collection) => collection.id === collectionId ? { ...collection, items: [...collection.items, added], updatedAt: new Date().toISOString() } : collection);
    write(KEYS.collections, next);
    return [...target.items, added].sort((a, b) => a.sortOrder - b.sortOrder);
  }

async removeItem(collectionId: string, targetId: string): Promise<CollectionItem[]> {
    const target = this.stored(collectionId);
    const next = this.snapshot().map((collection) => collection.id === collectionId ? { ...collection, items: collection.items.filter((item) => item.targetId !== targetId), updatedAt: new Date().toISOString() } : collection);
    write(KEYS.collections, next);
    return target.items.filter((item) => item.targetId !== targetId).sort((a, b) => a.sortOrder - b.sortOrder);
  }

subscribe(listener: Listener<Collection[]>): Unsubscribe { return this.channel.subscribe(listener); }
}

export const localPinnedTools = new LocalStoragePinnedToolsRepository();
export const localCollections = new LocalStorageCollectionsRepository();
