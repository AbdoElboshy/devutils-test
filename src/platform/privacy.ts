export type PrivacyPreferences = { analytics: boolean; recentHistory: boolean };
const key = "du:privacy";
export function getPrivacyPreferences(): PrivacyPreferences {
  try { return { analytics: false, recentHistory: true, ...JSON.parse(localStorage.getItem(key) ?? "{}") as Partial<PrivacyPreferences> }; }
  catch { return { analytics: false, recentHistory: true }; }
}
export function setPrivacyPreferences(value: PrivacyPreferences): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}