// API-testing helpers - pure inspection and assertion functions.
// No network calls, no credential echo. HAR values of sensitive headers are
// redacted before any output leaves this module (Phase 10 safety criteria).
export type ApiIssue = { line?: number; message: string };
export type ApiReport = { ok: boolean; issues: ApiIssue[] };

const SENSITIVE_HEADERS = new Set(["authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key", "x-auth-token", "x-csrf-token"]);

function asDoc(input: unknown, label: string): Record<string, unknown> {
  const doc = typeof input === "string" ? JSON.parse(input) as Record<string, unknown> : input as Record<string, unknown>;
  if (!doc || typeof doc !== "object") throw new Error(`${label} must be a JSON object.`);
  return doc;
}

/** Structurally validate an OpenAPI 3.x / Swagger 2.0 document. */
export function validateOpenApi(input: unknown): ApiReport {
  const doc = asDoc(input, "OpenAPI document");
  const issues: ApiIssue[] = [];
  const version = String(doc.openapi ?? doc.swagger ?? "");
  if (!doc.openapi && !doc.swagger) issues.push({ message: "Missing required 'openapi' (3.x) or 'swagger' (2.0) version field." });
  else if (doc.openapi && !/^3\.\d+\.\d+$/.test(version)) issues.push({ message: `openapi version '${version}' must match 3.x.y.` });
  else if (doc.swagger && !/^2\.0$/.test(version)) issues.push({ message: `swagger version '${version}' must be exactly 2.0.` });

  const info = doc.info as Record<string, unknown> | undefined;
  if (!info || typeof info !== "object") issues.push({ message: "Missing required 'info' object." });
  else {
    if (!String(info.title ?? "").trim()) issues.push({ message: "info.title is required." });
    if (!String(info.version ?? "").trim()) issues.push({ message: "info.version is required." });
  }

  const paths = doc.paths;
  if (!paths || typeof paths !== "object" || Array.isArray(paths) || Object.keys(paths).length === 0) {
    issues.push({ message: "Missing required non-empty 'paths' object." });
  } else {
    for (const path of Object.keys(paths)) {
      if (!path.startsWith("/")) issues.push({ message: `Path '${path}' must start with '/'.` });
      const item = (paths as Record<string, unknown>)[path];
      if (!item || typeof item !== "object") { issues.push({ message: `Path item '${path}' must be an object.` }); continue; }
      const methods = Object.keys(item).filter((key) => key !== "parameters" && key !== "servers" && key !== "summary" && key !== "description");
      for (const method of methods) {
        if (!["get", "put", "post", "delete", "options", "head", "patch", "trace"].includes(method)) {
          issues.push({ message: `Unknown operation '${method}' under path '${path}'.` });
          continue;
        }
        const op = (item as Record<string, unknown>)[method] as Record<string, unknown> | undefined;
        if (!op || typeof op !== "object") { issues.push({ message: `Operation ${method.toUpperCase()} ${path} must be an object.` }); continue; }
        if (!op.responses || typeof op.responses !== "object" || Object.keys(op.responses as object).length === 0) {
          issues.push({ message: `Operation ${method.toUpperCase()} ${path} is missing required 'responses'.` });
        }
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

export type OpenApiOperation = { method: string; path: string; operationId?: string; summary?: string };

/** List operations from an OpenAPI document for request generation. */
export function listOpenApiOperations(input: unknown): OpenApiOperation[] {
  const doc = asDoc(input, "OpenAPI document");
  const paths = doc.paths;
  if (!paths || typeof paths !== "object") throw new Error("The document has no 'paths' object.");
  const result: OpenApiOperation[] = [];
  for (const path of Object.keys(paths)) {
    const item = (paths as Record<string, unknown>)[path] as Record<string, unknown> | undefined;
    if (!item || typeof item !== "object") continue;
    for (const method of ["get", "put", "post", "delete", "options", "head", "patch", "trace"]) {
      const op = item[method] as Record<string, unknown> | undefined;
      if (op && typeof op === "object") {
        result.push({ method: method.toUpperCase(), path, operationId: op.operationId ? String(op.operationId) : undefined, summary: op.summary ? String(op.summary) : undefined });
      }
    }
  }
  return result;
}

/** Lint a GraphQL query/mutation for common mistakes. */
export function lintGraphQL(input: string): ApiReport {
  const value = input.trim();
  if (!value) throw new Error("Paste a GraphQL query or mutation first.");
  const issues: ApiIssue[] = [];
  if (!/^(query|mutation|subscription|fragment|\{)/i.test(value)) issues.push({ message: "Operations must start with query, mutation, subscription, fragment or '{'." });
  const braces = (value.match(/{/g) ?? []).length - (value.match(/}/g) ?? []).length;
  const parens = (value.match(/\(/g) ?? []).length - (value.match(/\)/g) ?? []).length;
  if (braces !== 0) issues.push({ message: "Unbalanced braces in GraphQL document." });
  if (parens !== 0) issues.push({ message: "Unbalanced parentheses in GraphQL document." });
  const declared = new Set((value.match(/\$(\w+)\s*:/g) ?? []).map((match) => match.slice(1, -1).replace(/\s*:$/, "")));
  for (const used of value.match(/\$(\w+)/g) ?? []) {
    if (!declared.has(used.slice(1))) issues.push({ message: `Variable '${used}' is used but never declared with a type.` });
  }
  const queryWord = value.match(/\b(query|mutation|subscription)\b/i);
  if (queryWord) {
    const operationName = value.slice(queryWord.index! + queryWord[0].length).match(/^(\w+)/);
    if (!operationName && !/^(query|mutation|subscription)\s*\{/i.test(value)) issues.push({ message: "Operation name or '{' expected after the operation keyword." });
  }
  return { ok: issues.length === 0, issues };
}

export type HarRequestSummary = { method: string; url: string; hasCredentialHeaders: boolean; headerCount: number };

/** Inspect a HAR file safely: summarize requests, redact credential values. */
export function inspectHar(input: unknown): { requests: HarRequestSummary[]; warning: string | null } {
  const doc = asDoc(input, "HAR file");
  const log = doc.log as Record<string, unknown> | undefined;
  const entries = log && Array.isArray(log.entries) ? log.entries : null;
  if (!entries) throw new Error("Paste a HAR file with a 'log.entries' array.");
  const requests: HarRequestSummary[] = [];
  for (const entry of entries) {
    const record = entry as Record<string, unknown>;
    const request = record.request as Record<string, unknown> | undefined;
    if (!request || typeof request !== "object") continue;
    const method = String(request.method ?? "?");
    const url = String(request.url ?? "?");
    const headers = Array.isArray(request.headers) ? request.headers as Record<string, unknown>[] : [];
    const hasCredentialHeaders = headers.some((header) => SENSITIVE_HEADERS.has(String(header.name ?? "").toLowerCase()));
    requests.push({ method, url, hasCredentialHeaders, headerCount: headers.length });
  }
  const warning = requests.some((request) => request.hasCredentialHeaders)
    ? "This HAR contains Authorization/Cookie/API-key headers. Values were redacted in this summary - scrub the original file before sharing it."
    : null;
  return { requests, warning };
}

export type AssertionSpec = { kind: "statusEquals" | "bodyContains" | "jsonPathEquals"; expected?: string | number; actual?: unknown };
export type AssertionResult = { name: string; passed: boolean; detail: string };

function readJsonPath(body: unknown, path: string): unknown {
  const parts = path.replace(/^\$?\./, "").split(".");
  let current: unknown = body;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else return undefined;
  }
  return current;
}

/** Evaluate assertions against a captured API response (status, headers, body). */
export function evaluateAssertions(input: { status?: number; body?: unknown; assertions: AssertionSpec[] }): AssertionResult[] {
  if (!Array.isArray(input.assertions) || input.assertions.length === 0) throw new Error("Provide at least one assertion.");
  return input.assertions.map((assertion) => {
    if (assertion.kind === "statusEquals") {
      const passed = input.status !== undefined && Number(assertion.expected) === input.status;
      return { name: `status equals ${assertion.expected}`, passed, detail: passed ? "Matched." : `Expected status ${assertion.expected} but the response has ${input.status ?? "no status"}.` };
    }
    if (assertion.kind === "bodyContains") {
      const haystack = typeof input.body === "string" ? input.body : JSON.stringify(input.body ?? null);
      const passed = haystack.includes(String(assertion.expected ?? ""));
      return { name: `body contains '${String(assertion.expected).slice(0, 40)}'`, passed, detail: passed ? "Found." : "Not found in the response body." };
    }
    if (assertion.kind === "jsonPathEquals") {
      const body = typeof input.body === "string" ? JSON.parse(input.body) as unknown : input.body;
      const actual = readJsonPath(body, String(assertion.expected ?? ""));
      const passed = JSON.stringify(actual) === JSON.stringify(assertion.actual);
      return { name: `json path '${assertion.expected}'`, passed, detail: passed ? "Matched." : `Expected ${JSON.stringify(assertion.actual)} but found ${JSON.stringify(actual) ?? "undefined"}.` };
    }
    return { name: `unknown assertion '${String(assertion.kind)}'`, passed: false, detail: "Unknown assertion kind." };
  });
}
