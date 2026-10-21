let csrfToken = "";

async function csrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const response = await fetch("/api/auth/csrf", { credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Could not initialize a secure request.");
  csrfToken = String((await response.json()).token ?? "");
  return csrfToken;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = String(init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("X-CSRF-Token", await csrf());
  let response = await fetch(path, { ...init, method, headers, credentials: "same-origin" });
  if (response.status === 403 && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    csrfToken = "";
    headers.set("X-CSRF-Token", await csrf());
    response = await fetch(path, { ...init, method, headers, credentials: "same-origin" });
  }
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `Request failed (${response.status}).`);
  return payload as T;
}