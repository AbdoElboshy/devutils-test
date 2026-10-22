import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, ArrowRight, Star, Clock, ShieldCheck, Zap, Heart, Code2, Container,
  TerminalSquare, Network, Lock, Binary, Database, Type, CalendarClock, Sparkles,
  ChevronRight, Braces, FileJson, Regex, FileCode, GitCompare, Dices, Ship, Boxes,
  KeyRound, GitBranch, Workflow, FileKey, CalendarClock as CronIcon, Hash, SquareTerminal,
  Plug, Gauge, Globe2, FileDigit, ArrowLeftRight, KeySquare, Fingerprint, ShieldAlert,
  Award, QrCode, Repeat, TableProperties, Braces as BracesIcon, ALargeSmall, Timer,
  Earth, CalendarDays, Siren, LayoutGrid, Activity, BarChart3, Cloud,
} from "lucide-react";
import { Header, Footer, CommandPalette } from "./components/chrome";
import { useEntityFavorite, useFavorites, useRecents, Panel } from "./components/ui";
import { TOOLS, CATEGORIES, TOOL_MAP, ROUTE_MAP, getCategory, getToolsByCategory, getRelated, getRegistryVersion, loadRegistryOverlays, subscribeRegistry, type Tool } from "./lib/registry";
import { AdminPage } from "./pages/admin";
import { cn } from "./utils/cn";
import { JsonTool, RegexTool, CodeFormatTool, CodeMinifyTool, DiffTool, GeneratorsTool, JsonSchemaTool, ErrorTool } from "./tools/tool-dev";
import { DockerTool, K8sTool, TerraformTool, GitTool, CicdTool, EnvTool, CronTool } from "./tools/tool-ops";
import { ChmodTool, LinuxCmdTool, SshTool, SystemdTool } from "./tools/tool-linux";
import { SubnetTool, IpTool, DnsTool, HttpTool, CurlTool, PortsTool } from "./tools/tool-network";
import { JwtTool, HashTool, SecretsTool, WebsecTool, CertTool } from "./tools/tool-security";
import { EncodeTool, QrTool } from "./tools/tool-encode";
import { ConverterTool, SqlTool } from "./tools/tool-data";
import { TextTool, TimestampTool, TimezoneTool, DateCalcTool } from "./tools/tool-texttime";
import { LogsTool } from "./tools/tool-logs";
import { WorkflowsPage } from "./pages/workflows";
import { WORKFLOW_TEMPLATES } from "./data/workflows";
import { ApiSchemaTool } from "./tools/tool-api-schema";
import { isFeatureEnabled } from "./platform/features";
import { CloudTool, InfrastructureTool } from "./tools/tool-observability";
import { GrafanaStandaloneTool, LoggingStandaloneTool, LokiStandaloneTool, MonitoringStandaloneTool, PrometheusStandaloneTool, ZabbixStandaloneTool } from "./tools/tool-devops-standalone";
import { CloudStandaloneTool } from "./tools/tool-cloud";
import { AuthPage } from "./pages/auth";
import { AccountPage } from "./pages/account";
import { classifyRoute } from "./lib/routes";

/* ---------- route aliases (clean URLs) ---------- */
const ALIASES: Record<string, string> = {
  "/base64": "/encode", "/jwt-decoder": "/jwt", "/subnet-calculator": "/subnet",
  "/curl-converter": "/curl", "/chmod-calculator": "/chmod", "/cron-generator": "/cron",
  "/timestamp-converter": "/timestamp", "/regex-tester": "/regex", "/json-formatter": "/json",
  "/jsonpath": "/json", "/uuid": "/generators", "/password-generator": "/secrets",
  "/chown": "/chmod", "/terraform-generator": "/terraform", "/github-actions": "/cicd",
  "/security-headers": "/security-headers", "/text": "/text", "/diff-tool": "/diff",
  "/monitoring": "/tools/monitoring-threshold-calculator", "/prometheus": "/tools/promql-builder",
  "/grafana": "/tools/grafana-dashboard-template-generator", "/zabbix": "/tools/zabbix-template-helper",
  "/loki": "/tools/logql-builder", "/observability": "/tools/slo-calculator",
  "/devops": "/categories/devops",
};

const CAT_ICONS: Record<string, typeof Code2> = {
  development: Code2, devops: Container, linux: TerminalSquare, networking: Network,
  security: Lock, encoding: Binary, data: Database, text: Type, datetime: CalendarClock, cloud: Cloud,
};
const TOOL_ICONS: Record<string, typeof Braces> = {
  json: FileJson, regex: Regex, "code-format": FileCode, "code-minify": FileCode, diff: GitCompare,
  generators: Dices, docker: Ship, kubernetes: Boxes, terraform: KeyRound, git: GitBranch,
  cicd: Workflow, env: FileKey, cron: CronIcon, chmod: Hash, "linux-cmd": SquareTerminal,
  ssh: Plug, systemd: Gauge, subnet: Globe2, ip: FileDigit, dns: Globe2, http: ArrowLeftRight,
  curl: ArrowLeftRight, ports: Plug, jwt: KeySquare, hash: Fingerprint, secrets: Sparkles,
  websec: ShieldAlert, cert: Award, encode: Binary, qr: QrCode, converter: Repeat,
  jsonschema: BracesIcon, sql: TableProperties, text: ALargeSmall, timestamp: Timer,
  timezone: Earth, datecalc: CalendarDays, errors: Siren,
  logs: TerminalSquare,
  "api-schema": Globe2,
  monitoring: Gauge, prometheus: Activity, grafana: BarChart3, zabbix: Activity,
  loki: TerminalSquare, observability: Gauge, cloud: Cloud, infrastructure: Boxes,
};

const LOCAL_ROUTES = new Set(["/tools", "/devops", "/workflows", "/categories", "/about", "/admin", "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/account"]);

/** Consumes ?auth_next= exactly once so a reload cannot pin the user to it. */
function consumeAuthNext(): string | null {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("auth_next");
  if (!next) return null;
  params.delete("auth_next");
  const error = params.get("auth_error");
  params.delete("auth_error");
  const query = params.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  if (error) { try { sessionStorage.setItem("du:auth:error", error); } catch { /* private mode */ } }
  return ["/reset-password", "/verify-email", "/login", "/account"].includes(next) ? next : null;
}

function pathFromHash(): string {
  const h = window.location.hash;
  if (h.startsWith("#/")) return h.slice(1);
  const authNext = consumeAuthNext();
  if (authNext) return authNext;
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/" || ROUTE_MAP[pathname] || LOCAL_ROUTES.has(pathname) || pathname.startsWith("/categories/") || pathname.startsWith("/account/") || pathname.startsWith("/admin") || pathname.startsWith("/tools/")) return ALIASES[pathname] ?? pathname;
  return "/";
}
function titleFor(route: string): string {
  const t = ROUTE_MAP[route] ?? (ALIASES[route] ? ROUTE_MAP[ALIASES[route]] : undefined);
  if (t) return `${t.name} — DevUtils`;
  if (route === "/") return "DevUtils — Tiny technical problems. Solved instantly.";
  if (route === "/tools") return "All tools — DevUtils";
  if (route === "/categories") return "Categories — DevUtils";
  if (route.startsWith("/account")) return "Account — DevUtils";
  if (route.startsWith("/admin")) return "Administration — DevUtils";
  if (route === "/workflows") return "Local developer workflows — DevUtils";
  if (route.startsWith("/categories/")) {
    const c = getCategory(route.split("/")[2]);
    if (c) return `${c.name} tools — DevUtils`;
  }
  if (route === "/about") return "About & Privacy — DevUtils";
  return "Not found — DevUtils";
}

export default function App() {
  const [route, setRoute] = useState<string>(() => pathFromHash());
  const [palette, setPalette] = useState(false);
  const [, setRegistryVersion] = useState(getRegistryVersion);

  // Load administrator registry overlays once, then re-render on any change so
  // search, categories, home and routing all read the same merged catalogue.
  useEffect(() => {
    let active = true;
    void loadRegistryOverlays().then(() => { if (active) setRegistryVersion(getRegistryVersion()); });
    const unsubscribe = subscribeRegistry(() => setRegistryVersion(getRegistryVersion()));
    return () => { active = false; unsubscribe(); };
  }, []);

  const navigate = useCallback((p: string) => {
    const target = ALIASES[p] ?? p;

    try {
      // Normalize legacy deep-link paths to the app root.
      if (window.location.pathname !== "/") {
        window.history.replaceState(
          {},
          "",
          `/${window.location.search}${window.location.hash}`
        );
      }

      const nextHash = `#${target}`;
      if (window.location.hash !== nextHash) {
        window.location.hash = nextHash;
      }
    } catch {
      /* noop */
    }

    setRoute(target);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const title = titleFor(route);
    document.title = title;
    const meta = document.querySelector('meta[name="description"]');
    const t = ROUTE_MAP[route];
    const description = t?.longDescription ?? (route === "/workflows" ? "Run and save local developer workflows that connect deterministic DevUtils operations." : "Tiny technical problems solved instantly with fast, local-first developer tools.");
    if (meta) meta.setAttribute("content", description);
    const upsertMeta = (selector: string, attribute: "name" | "property", key: string, content: string) => {
      let element = document.querySelector<HTMLMetaElement>(selector);
      if (!element) { element = document.createElement("meta"); element.setAttribute(attribute, key); document.head.appendChild(element); }
      element.content = content;
    };
    upsertMeta('meta[property="og:title"]', "property", "og:title", title);
    upsertMeta('meta[property="og:description"]', "property", "og:description", description);
    upsertMeta('meta[property="og:type"]', "property", "og:type", "website");
    upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary");
    const canonicalUrl = `${window.location.origin}${route === "/" ? "/" : route}`;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
    canonical.href = canonicalUrl;
    upsertMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    let structured = document.querySelector<HTMLScriptElement>("#devutils-structured-data");
    if (!structured) { structured = document.createElement("script"); structured.id = "devutils-structured-data"; structured.type = "application/ld+json"; document.head.appendChild(structured); }
    structured.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": t ? "SoftwareApplication" : "WebApplication",
      name: t?.name ?? "DevUtils",
      description,
      url: canonicalUrl,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any",
      isAccessibleForFree: true,
      browserRequirements: "Requires JavaScript and a modern browser",
    });
  }, [route]);

  useEffect(() => {
    const onHash = () => setRoute(pathFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // global shortcuts + data-nav interception
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((v) => !v); }
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest("[data-nav]");
      if (el) {
        e.preventDefault();
        navigate(el.getAttribute("data-nav") || "/");
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <Header route={route} onNav={navigate} onOpenSearch={() => setPalette(true)} />
      <main>
        <RouteView route={route} onNav={navigate} onSearch={() => setPalette(true)} />
      </main>
      <Footer onNav={navigate} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} onNav={navigate} />
    </div>
  );
}

/* ================= router ================= */

function RouteView({ route, onNav, onSearch }: { route: string; onNav: (p: string) => void; onSearch: () => void }) {
  const c = classifyRoute(route);
  switch (c.kind) {
    case "tool": return <ToolView id={c.id} />;
    case "home": return <Home onNav={onNav} onSearch={onSearch} />;
    case "tools": return <AllTools onNav={onNav} />;
    case "workflows": return <WorkflowsPage onNav={onNav} />;
    case "auth": return <AuthPage mode={c.mode} onNav={onNav} />;
    case "admin": return <AdminPage section={c.section} onNav={onNav} />;
    case "account": return <AccountPage section={c.section} onNav={onNav} />;
    case "categories": return <AllCategories onNav={onNav} />;
    case "category": return <CategoryPage slug={c.slug} onNav={onNav} />;
    case "about": return <About />;
    case "not-found": return <NotFound onSearch={onSearch} onNav={onNav} />;
    default: return <NotFound onSearch={onSearch} onNav={onNav} />;
  }
}

function ToolView({ id }: { id: string }) {
  if (id.startsWith("aws-") || id.startsWith("azure-") || id.startsWith("gcp-") || id.startsWith("gcloud-") || id === "cloud-cidr-planner" || id === "cloud-cli-converter") return <CloudStandaloneTool id={id} />;
  if (id === "grafana" || id.startsWith("grafana-")) return <GrafanaStandaloneTool id={id} />;
  if (id === "zabbix" || id.startsWith("zabbix-")) return <ZabbixStandaloneTool id={id} />;
  if (id === "prometheus" || id === "promql-formatter" || id.startsWith("prometheus-")) return <PrometheusStandaloneTool id={id} />;
  if (id === "loki" || id.startsWith("logql-") || id.startsWith("loki-label")) return <LokiStandaloneTool id={id} />;
  if (["monitoring", "resource-utilization-calculator", "availability-calculator", "observability", "error-budget-calculator", "percentile-helper"].includes(id)) return <MonitoringStandaloneTool id={id} />;
  if (["json-log-formatter", "log-cleaner", "log-level-extractor", "log-timestamp-normalizer", "stack-trace-formatter", "log-diff", "docker-log-formatter", "kubernetes-log-cleaner", "nginx-log-parser", "apache-log-parser", "syslog-parser"].includes(id)) return <LoggingStandaloneTool id={id} />;
  switch (id) {
    case "json": return <JsonTool />;
    case "regex": return <RegexTool />;
    case "code-format": return <CodeFormatTool />;
    case "code-minify": return <CodeMinifyTool />;
    case "diff": return <DiffTool />;
    case "generators": return <GeneratorsTool />;
    case "jsonschema": return <JsonSchemaTool />;
    case "errors": return <ErrorTool />;
    case "logs": return <LogsTool />;
    case "api-schema": return <ApiSchemaTool />;
    case "cloud": return <CloudTool />;
    case "infrastructure": return <InfrastructureTool />;
    case "docker": return <DockerTool />;
    case "kubernetes": return <K8sTool />;
    case "terraform": return <TerraformTool />;
    case "git": return <GitTool />;
    case "cicd": return <CicdTool />;
    case "env": return <EnvTool />;
    case "cron": return <CronTool />;
    case "chmod": return <ChmodTool />;
    case "linux-cmd": return <LinuxCmdTool />;
    case "ssh": return <SshTool />;
    case "systemd": return <SystemdTool />;
    case "subnet": return <SubnetTool />;
    case "ip": return <IpTool />;
    case "dns": return <DnsTool />;
    case "http": return <HttpTool />;
    case "curl": return <CurlTool />;
    case "ports": return <PortsTool />;
    case "jwt": return <JwtTool />;
    case "hash": return <HashTool />;
    case "secrets": return <SecretsTool />;
    case "websec": return <WebsecTool />;
    case "cert": return <CertTool />;
    case "encode": return <EncodeTool />;
    case "qr": return <QrTool />;
    case "converter": return <ConverterTool />;
    case "sql": return <SqlTool />;
    case "text": return <TextTool />;
    case "timestamp": return <TimestampTool />;
    case "timezone": return <TimezoneTool />;
    case "datecalc": return <DateCalcTool />;
    default: return <NotFound onSearch={() => {}} />;
  }
}

/* ================= shared cards ================= */

export function ToolCard({ tool, onNav }: { tool: Tool; onNav: (p: string) => void }) {
  const Icon = TOOL_ICONS[tool.id] ?? Braces;
  const { has, toggle } = useFavorites();
  return (
    <div className="group relative flex flex-col rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-emerald-500/60 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-600/60">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-lime-400 dark:bg-zinc-800 dark:text-lime-300">
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onNav(tool.route)} className="text-left text-[14px] font-bold leading-tight hover:text-emerald-700 dark:hover:text-emerald-300">
            {tool.name}
          </button>
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{tool.description}</p>
        </div>
        <button type="button" onClick={() => toggle(tool.id)} aria-label="Favorite" aria-pressed={has(tool.id)}
          className={cn("rounded-md p-1", has(tool.id) ? "text-amber-400" : "text-zinc-300 opacity-0 hover:text-zinc-500 group-hover:opacity-100 dark:text-zinc-600")}>
          <Star size={15} fill={has(tool.id) ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1">
        {tool.capabilities.slice(0, 4).map((c) => (
          <span key={c} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{c}</span>
        ))}
      </div>
    </div>
  );
}

/* ================= home ================= */

function Home({ onNav, onSearch }: { onNav: (p: string) => void; onSearch: () => void }) {
  const { favs } = useFavorites();
  const { recents } = useRecents();
  const popular = useMemo(() => TOOLS.filter((t) => t.featured), []);
  const recentTools = recents.map((id) => TOOL_MAP[id]).filter(Boolean).slice(0, 4);
  const favTools = favs.map((id) => TOOL_MAP[id]).filter(Boolean).slice(0, 4);

  return (
    <div>
      {/* hero */}
      <section className="relative overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
        <div className="hero-grid pointer-events-none absolute inset-0 text-zinc-900 dark:text-zinc-100" />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 pt-14 text-center sm:px-6 sm:pt-20">
          <p className="fade-up mx-auto inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12px] font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <Zap size={12} className="text-emerald-500" /> {TOOLS.length} tools · local-first · no account needed
          </p>
          <h1 className="fade-up mx-auto mt-4 max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ animationDelay: "60ms" }}>
            DevUtils
          </h1>
          <p className="fade-up mx-auto mt-3 max-w-xl text-[16px] leading-relaxed text-zinc-600 dark:text-zinc-400" style={{ animationDelay: "120ms" }}>
            Tiny technical problems.<br className="sm:hidden" /> <span className="font-semibold text-zinc-900 dark:text-zinc-100">Solved instantly.</span>
          </p>
          <div className="fade-up mx-auto mt-6 max-w-xl" style={{ animationDelay: "180ms" }}>
            <button type="button" onClick={onSearch}
              className="flex w-full items-center gap-3 rounded-2xl border border-zinc-300 bg-white px-4 py-3.5 text-left shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition hover:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-emerald-500">
              <Search size={18} className="shrink-0 text-zinc-400" />
              <span className="flex-1 truncate text-[14.5px] text-zinc-400">What do you need to do? Try “755”, “format json”…</span>
              <kbd className="kbd hidden sm:block">⌘K</kbd>
            </button>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {["format json", "755", "192.168.1.0/24", "every 15 minutes", "curl to python", "decode jwt"].map((s) => (
                <button key={s} type="button" onClick={onSearch}
                  className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-mono text-[11.5px] text-zinc-500 transition hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {(recentTools.length > 0 || favTools.length > 0) && (
          <section className="pt-8">
            <div className="grid gap-4 sm:grid-cols-2">
              {recentTools.length > 0 && (
                <div>
                  <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide text-zinc-500"><Clock size={13} /> Recent</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {recentTools.map((t) => <Chip key={t.id} label={t.name} onClick={() => onNav(t.route)} />)}
                  </div>
                </div>
              )}
              {favTools.length > 0 && (
                <div>
                  <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide text-zinc-500"><Star size={13} /> Favorites</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {favTools.map((t) => <Chip key={t.id} label={t.name} onClick={() => onNav(t.route)} />)}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* popular */}
        <section className="pt-10">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">Popular tools</h2>
              <p className="mt-1 text-[13.5px] text-zinc-500">The ones developers reach for daily.</p>
            </div>
            <button type="button" onClick={() => onNav("/tools")} className="hidden items-center gap-1 text-[13px] font-semibold text-emerald-700 sm:inline-flex dark:text-emerald-300">
              All {TOOLS.length} tools <ArrowRight size={14} />
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {popular.map((t) => <ToolCard key={t.id} tool={t} onNav={onNav} />)}
          </div>
        </section>

        {/* workflows */}
        {isFeatureEnabled("workflows") && <section className="pt-10">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">Developer workflows</h2>
              <p className="mt-1 text-[13.5px] text-zinc-500">Complete a sequence, not just a single operation. Inputs still stay local.</p>
            </div>
            <button type="button" onClick={() => onNav("/workflows")} className="hidden items-center gap-1 text-[13px] font-semibold text-emerald-700 sm:inline-flex dark:text-emerald-300">Explore workflows <ArrowRight size={14} /></button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {WORKFLOW_TEMPLATES.map((workflow) => (
              <button key={workflow.id} type="button" onClick={() => onNav("/workflows")} className="group rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-emerald-500/60 dark:border-zinc-800 dark:bg-zinc-950">
                <Workflow size={17} className="text-emerald-600 dark:text-emerald-400" />
                <p className="mt-2 text-[13.5px] font-bold group-hover:text-emerald-700 dark:group-hover:text-emerald-300">{workflow.name}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1 font-mono text-[10.5px] text-zinc-400">
                  {workflow.steps.map((step, index) => <span key={step.id} className="contents"><span>{step.label}</span>{index < workflow.steps.length - 1 && <span>→</span>}</span>)}
                </div>
              </button>
            ))}
          </div>
        </section>}

        {/* categories */}
        <section className="pt-10">
          <h2 className="text-xl font-extrabold tracking-tight">Categories</h2>
          <p className="mt-1 text-[13.5px] text-zinc-500">{CATEGORIES.length} curated categories. Tools stay focused and easy to discover.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((c) => {
              const Icon = CAT_ICONS[c.id] ?? LayoutGrid;
              const tools = getToolsByCategory(c.id);
              return (
                <button key={c.id} type="button" onClick={() => onNav(`/categories/${c.slug}`)}
                  className="group rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-emerald-500/60 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-600/60">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-700 dark:text-emerald-300"><Icon size={16} /></span>
                    <span className="text-[14.5px] font-bold">{c.name}</span>
                    <ChevronRight size={15} className="ml-auto text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-500" />
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{c.description}</p>
                  <p className="mt-2 font-mono text-[11px] text-zinc-400">{tools.map((t) => t.name.replace(" Toolkit", "")).slice(0, 5).join(" · ")}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* why */}
        <section className="py-12">
          <h2 className="text-xl font-extrabold tracking-tight">Why DevUtils?</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Zap, h: "Fast", p: "Most tools run instantly in your browser. No queues, no sign-in walls." },
              { icon: ShieldCheck, h: "Private", p: "Sensitive input stays local whenever possible — labeled on every tool." },
              { icon: Heart, h: "Simple", p: "No account required. Paste, process, copy, leave." },
              { icon: Code2, h: "Developer-first", p: "Built around real workflows — tools link to each other, like your brain does." },
            ].map((f) => (
              <Panel key={f.h} className="p-4">
                <f.icon size={18} className="text-emerald-600 dark:text-emerald-400" />
                <p className="mt-2 text-[14px] font-bold">{f.h}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{f.p}</p>
              </Panel>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" onClick={() => onNav("/tools")} className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-5 py-2.5 text-[14px] font-semibold text-white dark:bg-emerald-600">
              Browse all tools <ArrowRight size={15} />
            </button>
            <button type="button" onClick={onSearch} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 px-5 py-2.5 text-[14px] font-semibold dark:border-zinc-700">
              <Search size={15} /> Search with ⌘K
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12.5px] font-medium text-zinc-600 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
      {label}
    </button>
  );
}

/* ================= tools index ================= */

function AllTools({ onNav }: { onNav: (p: string) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const list = useMemo(() => {
    return TOOLS.filter((t) => (cat === "all" || t.category === cat) && (!q.trim() || `${t.name} ${t.description} ${t.keywords.join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  }, [q, cat]);
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">All tools</h1>
      <p className="mt-1 text-[14px] text-zinc-500">{TOOLS.length} integrated workbenches across {CATEGORIES.length} categories.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tools…" className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-sm dark:border-zinc-700 dark:bg-zinc-900" aria-label="Filter tools" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900" aria-label="Filter by category">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {CATEGORIES.map((c) => {
        const items = list.filter((t) => t.category === c.id);
        if (!items.length) return null;
        const Icon = CAT_ICONS[c.id] ?? LayoutGrid;
        return (
          <section key={c.id} className="mt-8">
            <button type="button" onClick={() => onNav(`/categories/${c.slug}`)} className="group flex items-center gap-2">
              <Icon size={17} className="text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-[17px] font-extrabold group-hover:text-emerald-700 dark:group-hover:text-emerald-300">{c.name}</h2>
              <ChevronRight size={15} className="text-zinc-400" />
            </button>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((t) => <ToolCard key={t.id} tool={t} onNav={onNav} />)}
            </div>
          </section>
        );
      })}
      {!list.length && <p className="mt-8 text-center text-sm text-zinc-500">No tools match. Try “json” or clear the filter.</p>}
    </div>
  );
}

/* ================= categories ================= */

function AllCategories({ onNav }: { onNav: (p: string) => void }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Categories</h1>
      <p className="mt-1 text-[14px] text-zinc-500">{CATEGORIES.length} curated categories — not hundreds of disconnected sections.</p>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {CATEGORIES.map((c) => {
          const Icon = CAT_ICONS[c.id] ?? LayoutGrid;
          return (
            <button key={c.id} type="button" onClick={() => onNav(`/categories/${c.slug}`)}
              className="rounded-2xl border border-zinc-200 bg-white p-5 text-left transition hover:border-emerald-500/60 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-300"><Icon size={19} /></span>
                <div><p className="text-[16px] font-extrabold">{c.name}</p><p className="text-[12.5px] text-zinc-500">{c.tagline}</p></div>
              </div>
              <p className="mt-3 text-[13.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{c.description}</p>
              <div className="mt-3 space-y-1.5">
                {c.groups.map((g) => (
                  <div key={g.name} className="flex items-center gap-2 text-[13px]">
                    <span className="font-semibold">{g.name}</span>
                    <span className="text-zinc-400">— {g.blurb}</span>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CategoryPage({ slug, onNav }: { slug: string; onNav: (p: string) => void }) {
  const cat = getCategory(slug)!;
  const Icon = CAT_ICONS[cat.id] ?? LayoutGrid;
  const favorite = useEntityFavorite("toolkit", cat.id);
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-[13px] text-zinc-500">
        <button type="button" onClick={() => onNav("/")} className="hover:text-zinc-900 dark:hover:text-zinc-100">Home</button>
        <ChevronRight size={13} /><button type="button" onClick={() => onNav("/categories")} className="hover:text-zinc-900 dark:hover:text-zinc-100">Categories</button>
        <ChevronRight size={13} /><span className="text-zinc-900 dark:text-zinc-100">{cat.name}</span>
      </nav>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-300"><Icon size={21} /></span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{cat.name}</h1>
          <p className="mt-0.5 text-[14px] text-zinc-500">{cat.tagline}</p>
        </div>
        <button type="button" onClick={favorite.toggle} aria-pressed={favorite.active} className={cn("ml-auto rounded-lg p-2 transition hover:bg-zinc-100 dark:hover:bg-zinc-800", favorite.active ? "text-amber-400" : "text-zinc-400")} title={favorite.active ? "Remove toolkit from favorites" : "Favorite this toolkit"}><Star size={18} fill={favorite.active ? "currentColor" : "none"} /></button>
      </div>
      <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{cat.description}</p>
      {cat.groups.map((g) => (
        <section key={g.name} className="mt-8">
          <h2 className="text-[16px] font-extrabold">{g.name}</h2>
          <p className="text-[13px] text-zinc-500">{g.blurb}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.tools.map((id) => TOOL_MAP[id]).filter(Boolean).map((t) => <ToolCard key={t.id} tool={t} onNav={onNav} />)}
          </div>
        </section>
      ))}
      <section className="mt-10">
        <h2 className="text-[16px] font-extrabold">Pairs well with</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {getToolsByCategory(cat.id).flatMap((t) => getRelated(t.id)).filter((t, i, a) => t.category !== cat.id && a.findIndex((x) => x.id === t.id) === i).slice(0, 6).map((t) => (
            <Chip key={t.id} label={t.name} onClick={() => onNav(t.route)} />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ================= about / 404 ================= */

function About() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">About DevUtils</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        DevUtils is a lightweight, local-first developer toolbox for developers, DevOps & SREs, sysadmins, network and security engineers, QA and students.
      </p>
      <div className="mt-6 space-y-4">
        {[
          ["What it is", "One fast place to solve tiny technical problems: format JSON, decode a JWT, compute a subnet, build a Dockerfile, explain CrashLoopBackOff — then copy the answer and leave. Tools are integrated workbenches (JSON Toolkit, Docker Toolkit…), not hundreds of thin pages."],
          ["Privacy philosophy", "Client-side whenever possible. JSON, JWT, Base64, hashes, passwords, .env files, certificates, regex and text never leave your browser. DevUtils stores only your theme, favorite/recent IDs, workflow step definitions and safe preset configuration in localStorage. Workflow inputs and tool contents are never persisted. Network tools are labeled clearly."],
          ["Accounts stay optional", "Public tools process input in-page without signing in. When the account backend is enabled, accounts sync IDs, workflow definitions and safe configuration only; sensitive tool input is never uploaded by default."],
          ["Why it exists", "Senior engineers keep the same 30 commands in shell history and the same 10 tabs pinned. DevUtils turns that scattered knowledge into instant, correct, copy-pasteable output — with errors that explain themselves (line, column, reason, fix) instead of “Invalid input”."],
          ["Honest limits", "DevUtils decodes JWTs but does not verify signatures. It parses certificates but does not validate TLS chains. It explains errors deterministically but does not pretend to be AI. Where a tool needs network, it says so."],
        ].map(([h, p]) => (
          <section key={h} className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-[15px] font-extrabold">{h}</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{p}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

function NotFound({ onSearch, onNav }: { onSearch: () => void; onNav?: (p: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 pb-24 pt-20 text-center sm:px-6">
      <p className="font-mono text-6xl font-bold text-zinc-200 dark:text-zinc-800">404</p>
      <h1 className="mt-2 text-2xl font-extrabold">This tool doesn't exist.</h1>
      <p className="mt-2 text-[14px] text-zinc-500">Try searching for what you need — “cron”, “subnet”, “jwt”…</p>
      <button type="button" onClick={onSearch} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white dark:bg-emerald-600">
        <Search size={15} /> Search DevUtils
      </button>
      {onNav && (
        <>
          <p className="mt-6 text-[12px] font-bold uppercase tracking-wide text-zinc-400">Browse categories</p>
      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
        {CATEGORIES.slice(0, 3).map((c) => <Chip key={c.id} label={c.name} onClick={() => onNav(`/categories/${c.slug}`)} />)}
      </div>
        </>
      )}
    </div>
  );
}
