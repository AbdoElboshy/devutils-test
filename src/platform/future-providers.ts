import type { ApiKeyRepository, BatchProcessor, BillingProvider, ExperimentProvider, IntegrationAdapter, SyncProvider, UsageService } from "./contracts";

// These tokens establish dependency boundaries. No fake implementations or UI are shipped.
export type PlatformProviderTokens = {
  billing?: BillingProvider;
  apiKeys?: ApiKeyRepository;
  usage?: UsageService;
  integrations?: ReadonlyMap<string, IntegrationAdapter>;
  experiments?: ExperimentProvider;
  batch?: BatchProcessor;
  sync?: SyncProvider;
};

export const futureProviders: PlatformProviderTokens = Object.freeze({});