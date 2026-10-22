import { AnonymousAuthProvider, HttpAuthProvider } from "./auth";
import { platformConfig } from "./config";
import { capabilities } from "./features";
import { localCollections, localFavorites, localPinnedTools, localPresets, localRecentTools, localWorkflows } from "./local-repositories";
import { operations } from "./operations";
import { AdaptiveCollectionsRepository, AdaptiveFavoritesRepository, AdaptivePinnedToolsRepository, AdaptivePresetRepository, AdaptiveRecentToolsRepository, AdaptiveWorkflowRepository } from "./adaptive-repositories";
import { AccountMergeService } from "./account-sync";
import { HttpApiKeyRepository, HttpAuditRepository, HttpFavoritesRepository, HttpPresetRepository, HttpProfileRepository, HttpRecentToolsRepository, HttpUsageService, HttpWorkflowRepository } from "./http-repositories";
import type { IntegrationRepository } from "./contracts";

// Single composition root. Cloud repositories/providers can replace these bindings
// later without changing tool or workflow UI components.
const auth = platformConfig.authMode === "server" ? new HttpAuthProvider() : new AnonymousAuthProvider();
const integrations: IntegrationRepository | null = null;
const cloud = platformConfig.authMode === "server" ? {
  favorites: new HttpFavoritesRepository(), recentTools: new HttpRecentToolsRepository(), workflows: new HttpWorkflowRepository(), presets: new HttpPresetRepository(), profile: new HttpProfileRepository(), apiKeys: new HttpApiKeyRepository(), usage: new HttpUsageService(), audit: new HttpAuditRepository(), integrations: null,
} : null;

export const platform = Object.freeze({
  auth,
  capabilities,
  favorites: new AdaptiveFavoritesRepository(auth, localFavorites, cloud?.favorites ?? null),
  recentTools: new AdaptiveRecentToolsRepository(auth, localRecentTools, cloud?.recentTools ?? null),
  workflows: new AdaptiveWorkflowRepository(auth, localWorkflows, cloud?.workflows ?? null),
  presets: new AdaptivePresetRepository(auth, localPresets, cloud?.presets ?? null),
  // Cloud bindings for pinned/collections land with their HTTP repositories (step 3).
  pinned: new AdaptivePinnedToolsRepository(auth, localPinnedTools, null),
  collections: new AdaptiveCollectionsRepository(auth, localCollections, null),
  profile: cloud?.profile ?? null,
  apiKeys: cloud?.apiKeys ?? null,
  usage: cloud?.usage ?? null,
  audit: cloud?.audit ?? null,
  integrations: integrations as IntegrationRepository | null,
  merge: cloud ? new AccountMergeService(localFavorites, localRecentTools, localWorkflows, localPresets, cloud.favorites, cloud.recentTools, cloud.workflows, cloud.presets) : null,
  operations,
});

export * from "./contracts";
export * from "./features";
export * from "./models";