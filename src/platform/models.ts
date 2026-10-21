export type EntityId = string;

export type User = {
  id: EntityId;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  planId: PlanId;
  createdAt: string;
};

export type Profile = {
  userId: EntityId;
  displayName?: string;
  avatarUrl?: string;
  timezone?: string;
  locale?: string;
  theme?: "light" | "dark" | "system";
  preferences: Record<string, boolean | number | string>;
};

export type AccountSession = {
  id: string;
  userId: EntityId;
  createdAt: string | null;
  expiresAt: string | null;
  isCurrent: boolean;
};

export type FavoriteKind = "tool" | "toolkit" | "workflow" | "integration";

export type Favorite = {
  id: EntityId;
  kind: FavoriteKind;
  targetId: EntityId;
  createdAt: string;
};

export type RecentTool = {
  toolId: EntityId;
  openedAt: string;
};

export type WorkflowStep = {
  id: EntityId;
  operationId: string;
  label: string;
  config?: Record<string, boolean | number | string>;
};

export type SavedWorkflow = {
  id: EntityId;
  name: string;
  description: string;
  steps: WorkflowStep[];
  source: "template" | "custom";
  createdAt: string;
  updatedAt: string;
  version: 1;
};

export type SavedPreset = {
  id: EntityId;
  toolId: EntityId;
  name: string;
  // Presets are configuration only. Raw tool inputs are never accepted here.
  config: Record<string, boolean | number | string>;
  createdAt: string;
  updatedAt: string;
  version: 1;
};

export type ApiKeyScope = "tools:read" | "tools:execute" | "workflows:execute";

export type ApiKeyMetadata = {
  id: EntityId;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type UsageRecord = {
  id: EntityId;
  subjectId: EntityId;
  metric: UsageMetric;
  quantity: number;
  recordedAt: string;
};

export type UsageMetric = "tool_runs" | "workflow_runs" | "api_requests" | "integration_calls" | LimitKey;

export type UsageSummary = {
  toolRuns: number;
  workflowRuns: number;
  apiRequests: number;
  integrationCalls: number;
  periodStart: string;
};

export type ActivityType =
  | "logged_in"
  | "profile_updated"
  | "password_changed"
  | "api_key_created"
  | "api_key_revoked"
  | "workflow_created"
  | "integration_connected"
  | "integration_disconnected"
  | "account_deleted";

export type AuditLog = {
  id: EntityId;
  userId: EntityId;
  action: ActivityType;
  metadata: Record<string, boolean | number | string>;
  createdAt: string;
};

export type IntegrationStatus = "disconnected" | "connected" | "error";

export type IntegrationConnection = {
  id: EntityId;
  userId: EntityId;
  integrationId: string;
  displayName: string;
  endpoint: string | null;
  status: IntegrationStatus;
  capabilities: string[];
  createdAt: string;
  updatedAt: string;
  lastTestedAt: string | null;
};

export type IntegrationDefinition = {
  id: string;
  name: string;
  description: string;
  category: "monitoring" | "source-control" | "cloud" | "notification" | "automation";
  capabilities: string[];
  permissions: string[];
  secretStrategy: "server-vault" | "oauth" | "none";
};

export type TeamRole = "owner" | "admin" | "member";

export type TeamMember = {
  userId: EntityId;
  role: TeamRole;
  joinedAt: string;
};

export type Organization = {
  id: EntityId;
  name: string;
  slug: string;
  planId: PlanId;
};

export type Team = {
  id: EntityId;
  organizationId: EntityId;
  name: string;
  members: TeamMember[];
};

export type Feature =
  | "basic_tools"
  | "advanced_tools"
  | "local_workflows"
  | "saved_workflows"
  | "saved_presets"
  | "cloud_sync"
  | "api_access"
  | "higher_api_limits"
  | "batch_processing"
  | "team_workspaces"
  | "advanced_integrations";

export type LimitKey =
  | "requests_per_day"
  | "api_requests_per_month"
  | "maximum_input_bytes"
  | "batch_operations"
  | "saved_workflows"
  | "saved_presets"
  | "team_members";

export type PlanId = "anonymous" | "free" | "pro" | "team" | "enterprise";

export type Plan = {
  id: PlanId;
  name: string;
  features: readonly Feature[];
  limits: Readonly<Record<LimitKey, number | null>>;
};

export type SubscriptionStatus = "none" | "trialing" | "active" | "past_due" | "canceled";

export type Subscription = {
  id: EntityId;
  subjectId: EntityId;
  planId: PlanId;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
};