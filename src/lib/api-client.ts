// API request builder helpers - pure functions for modeling, not sending.
// The page component owns the actual fetch() call; everything here is
// testable without a DOM or network (Phase 10 request-builder criteria).
export type EnvVars = Record<string, string>;

export type RequestHeader = { name: string; value: string };
export type AuthConfig = { type: "none" | "bearer" | "basic" | "apikey"; token?: string; username?: string; password?: string; headerName?: string };

export type ApiRequestModel = {
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  url: string;
  headers: RequestHeader[];
  query: { name: string; value: string }[];
  body: string;
  auth: AuthConfig;
};

export function emptyRequest(): ApiRequestModel {
  return { name: "New request", method: "GET", url: "", headers: [], query: [], body: "", auth: { type: "none" } };
}

/** Substitute {{var}} placeholders with environment values. Unknown vars are left as-is. */
export function interpolate(text: string, env: EnvVars): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (Object.prototype.hasOwnProperty.call(env, key) ? env[key] : whole));
}

/** Parse header lines: "Authorization: Bearer x"; "# comment" and blanks are skipped. */
export function parseHeaderLines(lines: string): RequestHeader[] {
  return lines
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf(":");
      if (index < 0) throw new Error(`Header line '${line}' is missing a colon - use 'Name: value'.`);
      return { name: line.slice(0, index).trim(), value: line.slice(index + 1).trim() };
    });
}

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/** Validate a request model and return the final URL with query string appended. */
export function buildRequestUrl(model: ApiRequestModel, env: EnvVars): string {
  const url = interpolate(model.url.trim(), env);
  if (!url) throw new Error("URL is required.");
  if (!/^https?:\/\//i.test(url)) throw new Error("URL must start with http:// or https:// (browser CORS applies either way).");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("URL is not valid - check the scheme, host and port."); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Only http and https URLs are supported.");
  for (const param of model.query) {
    if (param.name.trim()) parsed.searchParams.append(param.name.trim(), interpolate(param.value, env));
  }
  return parsed.toString();
}

/** Compute the final header list: user headers + auth header, interpolated. */
export function buildRequestHeaders(model: ApiRequestModel, env: EnvVars): RequestHeader[] {
  const headers = model.headers.map((header) => ({ name: header.name.trim(), value: interpolate(header.value, env) }));
  for (const header of headers) {
    if (!header.name) throw new Error("Every header needs a name.");
    if (header.name.toLowerCase() === "content-type" && !/^(application\/json|text\/plain|application\/x-www-form-urlencoded|application\/xml|text\/xml)(;.*)?$/i.test(header.value)) {
      throw new Error(`Unsupported Content-Type '${header.value}' - use application/json, text/plain, xml or urlencoded.`);
    }
  }
  const auth = model.auth;
  if (auth.type === "bearer") {
    if (!auth.token?.trim()) throw new Error("Bearer auth needs a token.");
    headers.push({ name: "Authorization", value: `Bearer ${interpolate(auth.token.trim(), env)}` });
  } else if (auth.type === "basic") {
    if (!auth.username?.trim() && !auth.password?.trim()) throw new Error("Basic auth needs a username or password.");
    headers.push({ name: "Authorization", value: `Basic ${b64encodeUtf8(`${auth.username ?? ""}:${auth.password ?? ""}`)}` });
  } else if (auth.type === "apikey") {
    if (!auth.token?.trim()) throw new Error("API-key auth needs a token.");
    headers.push({ name: auth.headerName?.trim() || "X-API-Key", value: interpolate(auth.token.trim(), env) });
  }
  return headers;
}

function b64encodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

/** Validate method + body consistency. Returns the final body string or null. */
export function buildRequestBody(model: ApiRequestModel, env: EnvVars): string | null {
  const method = model.method.toUpperCase() as ApiRequestModel["method"];
  if (!METHODS.has(method)) throw new Error(`Method '${model.method}' is not supported.`);
  const body = model.body.trim() ? interpolate(model.body, env) : null;
  if ((method === "GET" || method === "HEAD") && body) throw new Error("GET/HEAD requests cannot carry a body - use query parameters instead.");
  if (body) {
    const contentType = effectiveContentType(model);
    if (contentType.includes("json") && (body.trim().startsWith("{") || body.trim().startsWith("["))) JSON.parse(body);
  }
  return body;
}

function effectiveContentType(model: ApiRequestModel): string {
  const fromHeaders = model.headers.find((header) => header.name.trim().toLowerCase() === "content-type");
  return fromHeaders ? fromHeaders.value : "application/json";
}

export type ResponseSummary = {
  status: number;
  statusText: string;
  ok: boolean;
  durationMs: number;
  sizeBytes: number;
  contentType: string;
  headers: RequestHeader[];
  bodyPreview: string;
};

const MAX_PREVIEW = 64_000;

/** Summarize a fetched response for the viewer (body preview capped at 64 KB). */
export function summarizeResponse(response: { status: number; statusText: string; ok: boolean; headers: Record<string, string>; bodyText: string; durationMs: number }): ResponseSummary {
  const headerList = Object.entries(response.headers).map(([name, value]) => ({ name, value: String(value) }));
  const contentType = String(response.headers["content-type"] ?? response.headers["Content-Type"] ?? "");
  const bodyPreview = response.bodyText.length > MAX_PREVIEW ? response.bodyText.slice(0, MAX_PREVIEW) + "\n… (truncated)" : response.bodyText;
  return {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    durationMs: response.durationMs,
    sizeBytes: new TextEncoder().encode(response.bodyText).byteLength,
    contentType,
    headers: headerList,
    bodyPreview,
  };
}
