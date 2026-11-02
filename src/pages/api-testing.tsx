// Phase 10 Batch 2 — API request builder / response viewer.
// Requests are sent directly from the user's browser via fetch(). This page
// says so honestly: CORS, mixed-content and private-network limits apply.
import { useMemo, useState } from "react";
import {
  buildRequestBody, buildRequestHeaders, buildRequestUrl, emptyRequest, parseHeaderLines, summarizeResponse,
  type ApiRequestModel, type AuthConfig, type EnvVars, type ResponseSummary,
} from "../lib/api-client";

type SavedRequest = { id: string; name: string; model: ApiRequestModel; headerText: string };

const COLLECTIONS_KEY = "du:api-collections";
const ENV_KEY = "du:api-env";
const TIMEOUT_MS = 20_000;
const METHODS: ApiRequestModel["method"][] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const AUTH_TYPES: AuthConfig["type"][] = ["none", "bearer", "basic", "apikey"];

function loadJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function saveJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full/private mode */ }
}
function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const input = "w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900";
const label = "mb-1 block text-[12px] font-semibold uppercase tracking-wide text-zinc-500";
const card = "rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950";
const button = "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500";

export function ApiTestingPage({ onNav }: { onNav: (path: string) => void }) {
  const [model, setModel] = useState<ApiRequestModel>(emptyRequest);
  const [headerText, setHeaderText] = useState("");
  const [envRows, setEnvRows] = useState<{ key: string; value: string }[]>(loadJson(ENV_KEY, [] as { key: string; value: string }[]));
  const [collections, setCollections] = useState<SavedRequest[]>(loadJson(COLLECTIONS_KEY, [] as SavedRequest[]));
  const [response, setResponse] = useState<ResponseSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const env: EnvVars = useMemo(() => {
    const map: EnvVars = {};
    for (const row of envRows) if (row.key.trim()) map[row.key.trim()] = row.value;
    return map;
  }, [envRows]);

  const setAuth = (patch: Partial<AuthConfig>) => setModel((m) => ({ ...m, auth: { ...m.auth, ...patch } }));
  const hasBody = model.method !== "GET" && model.method !== "HEAD";

  async function send(): Promise<void> {
    setError(null);
    setResponse(null);
    setBusy(true);
    try {
      const headers = buildRequestHeaders({ ...model, headers: parseHeaderLines(headerText) }, env);
      const url = buildRequestUrl(model, env);
      const body = buildRequestBody(model, env);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const started = performance.now();
      let result: Response;
      try {
        result = await fetch(url, {
          method: model.method,
          headers: Object.fromEntries(headers.map((header) => [header.name, header.value])),
          body: body ?? undefined,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const bodyText = await result.text();
      const headerRecord: Record<string, string> = {};
      result.headers.forEach((value, name) => { headerRecord[name] = value; });
      setResponse(summarizeResponse({ status: result.status, statusText: result.statusText, ok: result.ok, headers: headerRecord, bodyText, durationMs: Math.round(performance.now() - started) }));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (message.includes("abort") || (caught instanceof DOMException && caught.name === "AbortError")) setError(`Request timed out after ${TIMEOUT_MS / 1000}s.`);
      else if (message.toLowerCase().includes("failed to fetch")) setError("The browser blocked this request (network error, CORS, mixed content or the host is unreachable). DevUtils never proxies requests.");
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  function saveRequest(): void {
    const entry: SavedRequest = { id: newId(), name: model.name.trim() || `${model.method} ${model.url.slice(0, 40)}`, model, headerText };
    const next = [...collections, entry];
    setCollections(next);
    saveJson(COLLECTIONS_KEY, next);
  }

  function deleteRequest(id: string): void {
    const next = collections.filter((entry) => entry.id !== id);
    setCollections(next);
    saveJson(COLLECTIONS_KEY, next);
  }

  function loadRequest(entry: SavedRequest): void {
    setModel(entry.model);
    setHeaderText(entry.headerText);
    setResponse(null);
    setError(null);
  }

  function saveEnv(): void {
    saveJson(ENV_KEY, envRows);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">API request builder</h1>
        <button type="button" onClick={() => onNav("/tools")} className="ml-auto text-[13px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">← All tools</button>
      </div>
      <p className="mt-2 max-w-3xl text-[14px] text-zinc-600 dark:text-zinc-400">Build, send and inspect HTTP requests. Saved requests and environment variables stay in this browser's localStorage.</p>
      <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>Honest limits:</strong> requests are sent directly from your browser — not through a proxy. Target servers must allow CORS, mixed content is blocked, and private IP ranges may be refused by the browser. Timeouts after 20s.
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {/* request editor */}
        <div className={card}>
          <div className="flex gap-2">
            <select className={input} style={{ width: 104 }} value={model.method} onChange={(e) => setModel({ ...model, method: e.target.value as ApiRequestModel["method"] })} aria-label="Method">
              {METHODS.map((method) => <option key={method}>{method}</option>)}
            </select>
            <input className={input} placeholder="https://api.example.com/{{host}}/users" value={model.url} onChange={(e) => setModel({ ...model, url: e.target.value })} aria-label="URL" />
          </div>
          <input className={`${input} mt-3`} placeholder="Request name (for saved collections)" value={model.name} onChange={(e) => setModel({ ...model, name: e.target.value })} aria-label="Request name" />

          <p className={`${label} mt-4`}>Query parameters</p>
          {model.query.map((param, index) => (
            <div key={index} className="mb-1.5 flex gap-2">
              <input className={input} placeholder="name" value={param.name} onChange={(e) => setModel({ ...model, query: model.query.map((p, i) => i === index ? { ...p, name: e.target.value } : p) })} aria-label="Query name" />
              <input className={input} placeholder="value (supports {{var}})" value={param.value} onChange={(e) => setModel({ ...model, query: model.query.map((p, i) => i === index ? { ...p, value: e.target.value } : p) })} aria-label="Query value" />
              <button type="button" className="rounded-lg px-2 text-zinc-400 hover:text-red-500" onClick={() => setModel({ ...model, query: model.query.filter((_, i) => i !== index) })} aria-label="Remove query parameter">×</button>
            </div>
          ))}
          <button type="button" className="text-[13px] text-emerald-600 hover:underline dark:text-emerald-400" onClick={() => setModel({ ...model, query: [...model.query, { name: "", value: "" }] })}>+ parameter</button>

          <p className={`${label} mt-4`}>Headers (one per line: Name: value)</p>
          <textarea className={`${input} font-mono`} rows={4} placeholder={"Content-Type: application/json\nX-Trace-Id: {{traceId}}"} value={headerText} onChange={(e) => setHeaderText(e.target.value)} aria-label="Headers" />

          <p className={`${label} mt-4`}>Authentication</p>
          <select className={input} value={model.auth.type} onChange={(e) => setAuth({ type: e.target.value as AuthConfig["type"] })} aria-label="Auth type">
            {AUTH_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
          {model.auth.type === "bearer" && <input className={`${input} mt-2`} type="password" placeholder="Bearer token (supports {{var}})" value={model.auth.token ?? ""} onChange={(e) => setAuth({ token: e.target.value })} aria-label="Bearer token" />}
          {model.auth.type === "basic" && (
            <div className="mt-2 flex gap-2">
              <input className={input} placeholder="username" value={model.auth.username ?? ""} onChange={(e) => setAuth({ username: e.target.value })} aria-label="Basic username" />
              <input className={input} type="password" placeholder="password" value={model.auth.password ?? ""} onChange={(e) => setAuth({ password: e.target.value })} aria-label="Basic password" />
            </div>
          )}
          {model.auth.type === "apikey" && (
            <div className="mt-2 flex gap-2">
              <input className={input} placeholder="Header name (default X-API-Key)" value={model.auth.headerName ?? ""} onChange={(e) => setAuth({ headerName: e.target.value })} aria-label="API key header name" />
              <input className={input} type="password" placeholder="API key (supports {{var}})" value={model.auth.token ?? ""} onChange={(e) => setAuth({ token: e.target.value })} aria-label="API key" />
            </div>
          )}

          {hasBody && (
            <>
              <p className={`${label} mt-4`}>Body (JSON is validated before sending)</p>
              <textarea className={`${input} font-mono`} rows={6} placeholder='{"name": "maya"}' value={model.body} onChange={(e) => setModel({ ...model, body: e.target.value })} aria-label="Request body" />
            </>
          )}

          <div className="mt-5 flex gap-2">
            <button type="button" className={button} disabled={busy || !model.url.trim()} onClick={() => void send()}>{busy ? "Sending…" : "Send request"}</button>
            <button type="button" className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800" onClick={saveRequest}>Save to collection</button>
          </div>
          {error && <p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-[13px] text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
        </div>

        {/* response viewer */}
        <div className={card}>
          <h2 className="text-[15px] font-extrabold">Response</h2>
          {!response && <p className="mt-2 text-[13px] text-zinc-500">Nothing yet — send a request to inspect it here.</p>}
          {response && (
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-3 text-[13px]">
                <span className={`rounded-lg px-2.5 py-1 font-bold ${response.ok ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>{response.status} {response.statusText}</span>
                <span className="text-zinc-500">{response.durationMs} ms</span>
                <span className="text-zinc-500">{(response.sizeBytes / 1024).toFixed(1)} KB</span>
                <span className="text-zinc-500">{response.contentType || "no content-type"}</span>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">Response headers ({response.headers.length})</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-zinc-100 p-3 text-[12px] dark:bg-zinc-900">{response.headers.map((header) => `${header.name}: ${header.value}`).join("\n")}</pre>
              </details>
              <pre className="mt-3 max-h-[420px] overflow-auto rounded-lg bg-zinc-100 p-3 text-[12px] leading-relaxed dark:bg-zinc-900">{response.bodyPreview || "(empty body)"}</pre>
            </div>
          )}
        </div>
      </div>

      {/* collections + env */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className={card}>
          <h2 className="text-[15px] font-extrabold">Saved collections</h2>
          <p className="mt-1 text-[13px] text-zinc-500">Local to this browser (localStorage). Never uploaded.</p>
          {collections.length === 0 && <p className="mt-3 text-[13px] text-zinc-500">No saved requests yet.</p>}
          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            {collections.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 py-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => loadRequest(entry)}>
                  <span className="block truncate text-[13.5px] font-semibold">{entry.name}</span>
                  <span className="block truncate font-mono text-[12px] text-zinc-500">{entry.model.method} {entry.model.url}</span>
                </button>
                <button type="button" className="rounded-lg px-2 py-1 text-[12px] text-zinc-400 hover:text-red-500" onClick={() => deleteRequest(entry.id)} aria-label={`Delete ${entry.name}`}>delete</button>
              </li>
            ))}
          </ul>
        </div>

        <div className={card}>
          <h2 className="text-[15px] font-extrabold">Environment variables</h2>
          <p className="mt-1 text-[13px] text-zinc-500">Use {"{{name}}"} in URLs, headers, query values and bodies.</p>
          {envRows.map((row, index) => (
            <div key={index} className="mb-1.5 mt-2 flex gap-2">
              <input className={input} placeholder="name" value={row.key} onChange={(e) => setEnvRows(envRows.map((r, i) => i === index ? { ...r, key: e.target.value } : r))} aria-label="Variable name" />
              <input className={input} placeholder="value" value={row.value} onChange={(e) => setEnvRows(envRows.map((r, i) => i === index ? { ...r, value: e.target.value } : r))} aria-label="Variable value" />
              <button type="button" className="rounded-lg px-2 text-zinc-400 hover:text-red-500" onClick={() => setEnvRows(envRows.filter((_, i) => i !== index))} aria-label="Remove variable">×</button>
            </div>
          ))}
          <div className="mt-3 flex gap-2">
            <button type="button" className="text-[13px] text-emerald-600 hover:underline dark:text-emerald-400" onClick={() => setEnvRows([...envRows, { key: "", value: "" }] )}>+ variable</button>
            <button type="button" className="ml-auto text-[13px] text-zinc-500 hover:underline" onClick={saveEnv}>Save environment</button>
          </div>
        </div>
      </div>
    </div>
  );
}
