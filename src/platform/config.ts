export type PlatformConfig = {
  siteUrl: string;
  authMode: "server" | "disabled";
};

declare global {
  interface Window { __DEVUTILS_CONFIG__?: { authMode?: string; accountsEnabled?: boolean } }
}

export const platformConfig: PlatformConfig = Object.freeze({
  siteUrl: typeof window !== "undefined" ? window.location.origin : "https://devutils.app",
  authMode: typeof window !== "undefined" && window.__DEVUTILS_CONFIG__?.authMode === "server" ? "server" : "disabled",
});

export function isAccountBackendConfigured(): boolean {
  return platformConfig.authMode !== "disabled";
}