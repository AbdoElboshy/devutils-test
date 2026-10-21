/**
 * Privacy-conscious analytics client.
 *
 * Only allowlisted event names and short identifiers leave the browser. Tool
 * input, output, tokens, and free-form payloads are never collected, and the
 * gateway rejects anything outside its allowlist.
 *
 * Anonymous collection is off by default and controlled by the visitor's
 * privacy preference. Authenticated account usage is recorded separately in
 * usage_records and is not affected by this flag.
 */
import { getPrivacyPreferences } from "../platform/privacy";
import { platformConfig } from "../platform/config";

export type AnalyticsEventName =
  | "tool_opened"
  | "tool_completed"
  | "tool_copied"
  | "tool_downloaded"
  | "search_used"
  | "category_visited"
  | "auth_success"
  | "auth_failure"
  | "tool_config_changed"
  | "tool_visibility_changed";

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  toolId?: string;
  categoryId?: string;
  outcome?: "success" | "failure";
};

let queue: AnalyticsEvent[] = [];
let timer: number | null = null;
let disabledReason: "static-build" | "preference" | null = null;

function collectionAllowed(): boolean {
  if (platformConfig.authMode !== "server") { disabledReason = "static-build"; return false; }
  if (!getPrivacyPreferences().analytics) { disabledReason = "preference"; return false; }
  disabledReason = null;
  return true;
}

async function flush(): Promise<void> {
  timer = null;
  if (!queue.length) return;
  const batch = queue.splice(0, 20);
  try {
    const { apiFetch } = await import("../platform/http");
    await apiFetch("/api/analytics/events", { method: "POST", body: JSON.stringify({ events: batch }) });
  } catch {
    // Analytics must never break a tool. Drop the batch rather than retrying
    // indefinitely or surfacing an error to the user.
  }
}

export function track(event: AnalyticsEvent): void {
  if (!collectionAllowed()) return;
  queue.push(event);
  if (queue.length >= 10 && !timer) { void flush(); return; }
  if (!timer) timer = window.setTimeout(() => { void flush(); }, 4000);
}

/** Reports why anonymous analytics are inactive, for honest admin/UI messaging. */
export function analyticsStatus(): { enabled: boolean; reason: string | null } {
  const allowed = collectionAllowed();
  return { enabled: allowed, reason: allowed ? null : disabledReason };
}
