import type {
  ApiKeyMetadata,
  AccountSession,
  AuditLog,
  Favorite,
  Feature,
  IntegrationConnection,
  LimitKey,
  PlanId,
  Profile,
  RecentTool,
  SavedPreset,
  SavedWorkflow,
  Subscription,
  UsageSummary,
  UsageMetric,
  User,
} from "./models";

export type Unsubscribe = () => void;

export interface AuthProvider {
  readonly enabled: boolean;
  getUser(): Promise<User | null>;
  getSession(): Promise<AccountSession | null>;
  signUp(input: { name: string; email: string; password: string; emailRedirectTo: string }): Promise<{ user: User; verificationRequired: boolean }>;
  signInWithPassword(input: { email: string; password: string; remember: boolean }): Promise<User>;
  signOut(scope?: "local" | "global" | "others"): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  updateEmail(email: string): Promise<void>;
  updateProfileMetadata(input: { displayName: string; avatarUrl?: string }): Promise<void>;
  resendVerification(email: string, redirectTo: string): Promise<void>;
  deleteAccount(): Promise<void>;
  subscribe(listener: (user: User | null) => void): Unsubscribe;
}

export interface ProfileRepository {
  get(userId: string): Promise<Profile | null>;
  save(profile: Profile): Promise<Profile>;
}

export interface SessionRepository {
  current(): Promise<AccountSession | null>;
  revokeOthers(): Promise<void>;
  revokeAll(): Promise<void>;
}

export interface FavoritesRepository {
  list(): Promise<Favorite[]>;
  toggle(kind: Favorite["kind"], targetId: string): Promise<Favorite[]>;
  subscribe(listener: (favorites: Favorite[]) => void): Unsubscribe;
}

export interface RecentToolsRepository {
  list(): Promise<RecentTool[]>;
  record(toolId: string): Promise<RecentTool[]>;
  clear(): Promise<void>;
  subscribe(listener: (recent: RecentTool[]) => void): Unsubscribe;
}

export interface WorkflowRepository {
  list(): Promise<SavedWorkflow[]>;
  get(id: string): Promise<SavedWorkflow | null>;
  save(workflow: SavedWorkflow): Promise<SavedWorkflow>;
  remove(id: string): Promise<void>;
  subscribe(listener: (workflows: SavedWorkflow[]) => void): Unsubscribe;
}

export interface PresetRepository {
  list(toolId?: string): Promise<SavedPreset[]>;
  save(preset: SavedPreset): Promise<SavedPreset>;
  remove(id: string): Promise<void>;
  subscribe(listener: (presets: SavedPreset[]) => void): Unsubscribe;
}

export interface EntitlementService {
  hasFeature(user: User | null, feature: Feature): boolean;
  getLimit(user: User | null, limit: LimitKey): number | null;
  getPlan(user: User | null): PlanId;
}

export interface BillingProvider {
  getSubscription(subjectId: string): Promise<Subscription | null>;
  createCheckout(input: { subjectId: string; planId: PlanId; returnUrl: string }): Promise<{ url: string }>;
  cancelSubscription(subscriptionId: string): Promise<Subscription>;
  changePlan(subscriptionId: string, planId: PlanId): Promise<Subscription>;
}

export interface ApiKeyRepository {
  list(userId: string): Promise<ApiKeyMetadata[]>;
  create(input: { userId: string; name: string; scopes: ApiKeyMetadata["scopes"] }): Promise<{ metadata: ApiKeyMetadata; secret: string }>;
  revoke(id: string): Promise<void>;
}

export interface UsageService {
  getUsage(subjectId: string, metric: UsageMetric): Promise<number>;
  canConsume(subjectId: string, metric: UsageMetric, quantity?: number): Promise<boolean>;
  consume(subjectId: string, metric: UsageMetric, quantity?: number, resourceId?: string): Promise<void>;
  summary(subjectId: string): Promise<UsageSummary>;
}

export interface AuditLogRepository {
  list(userId: string, limit?: number): Promise<AuditLog[]>;
}

export interface IntegrationAdapter<TConfig = unknown> {
  readonly id: string;
  readonly name: string;
  connect(config: TConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;
}

export interface IntegrationRepository {
  list(): Promise<IntegrationConnection[]>;
  disconnect(id: string): Promise<void>;
}

export type ToolOperation<I = unknown, O = unknown> = {
  id: string;
  title: string;
  description: string;
  clientSide: boolean;
  maximumInputBytes?: number;
  run(input: I, config?: Record<string, boolean | number | string>): Promise<O> | O;
};

export interface ToolOperationRegistry {
  get(id: string): ToolOperation | undefined;
  list(): ToolOperation[];
  execute<TOutput = unknown>(id: string, input: unknown, config?: Record<string, boolean | number | string>): Promise<TOutput>;
}

export type SafeAnalyticsEvent =
  | { name: "tool_opened"; toolId: string }
  | { name: "tool_completed"; toolId: string; operationId: string; durationMs?: number }
  | { name: "tool_copied"; toolId: string; operationId?: string }
  | { name: "tool_downloaded"; toolId: string; fileType?: string }
  | { name: "search_used"; resultKind?: string; hadResults: boolean };

export interface AnalyticsProvider {
  // Event contracts intentionally contain no arbitrary payload or input value.
  track(event: SafeAnalyticsEvent): void;
}

export interface ExperimentProvider {
  // Returns "control" when an experiment is unknown. Assignment belongs in the
  // provider so UI components never implement bucketing or business rules.
  getVariant(experimentId: string, subjectId?: string): Promise<string>;
}

export type BatchItem = { id: string; operationId: string; input: unknown; config?: Record<string, boolean | number | string> };
export type BatchResult = { id: string; ok: true; output: unknown } | { id: string; ok: false; error: string };

export interface BatchProcessor {
  process(items: BatchItem[], options?: { concurrency?: number; signal?: AbortSignal }): Promise<BatchResult[]>;
}

export interface SyncProvider {
  push(scope: "favorites" | "workflows" | "presets" | "preferences", records: unknown[]): Promise<void>;
  pull(scope: "favorites" | "workflows" | "presets" | "preferences"): Promise<unknown[]>;
}