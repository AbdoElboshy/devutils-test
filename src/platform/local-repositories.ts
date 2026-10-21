import type {
  FavoritesRepository,
  PresetRepository,
  RecentToolsRepository,
  Unsubscribe,
  WorkflowRepository,
} from "./contracts";
import type { Favorite, RecentTool, SavedPreset, SavedWorkflow } from "./models";

const STORAGE_VERSION = 1;
const KEYS = {
  favorites: "du:v1:favorites",
  recent: "du:v1:recent",
  workflows: "du:v1:workflows",
  presets: "du:v1:presets",
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