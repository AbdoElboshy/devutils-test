import { useMemo, useState } from "react";
import { TOOL_MAP } from "../lib/registry";
import {
  buildLogQl,
  buildPromQl,
  buildThresholds,
  calculateAvailability,
  calculateMetric,
  calculateSlo,
  formatLogQl,
  formatPromQl,
  grafanaPanel,
  grafanaTemplate,
  normalizeMacro,
  percentile,
  prometheusRule,
  prometheusScrapeConfig,
  prometheusSelector,
  validateGrafanaDashboard,
  zabbixApiExample,
  zabbixExpression,
  zabbixItem,
  zabbixTemplatePreset,
  zabbixTrigger,
  type GrafanaPanelInput,
  type GrafanaTemplateId,
  type PromQueryInput,
  type ZabbixItemInput,
  type ZabbixTemplatePresetId,
} from "../lib/devops-platform";
import { diffLogs, extractLogErrors, filterLogs, formatLogs, formatStackTraces, normalizeLogTimestamps, parseLogs, type LogLevel } from "../lib/logs";
import { formatJson, minifyJson } from "../lib/engine";
import { ToolScaffold, Panel, Field, TextInput, Select, Check, CodeArea, OutputBox, ErrorCallout, Split } from "../components/ui";

type Result = { ok: true; output: string } | { ok: false; error: string };
function run(fn: () => unknown): Result { try { const value = fn(); return { ok: true, output: typeof value === "string" ? value : JSON.stringify(value, null, 2) }; } catch (cause) { return { ok: false, error: cause instanceof Error ? cause.message : "Operation failed." }; } }
function ResultPane({ result, filename = "output.txt" }: { result: Result; filename?: string }) { return result.ok ? <OutputBox value={result.output} label="Output" filename={filename} rows={15} /> : <ErrorCallout title="Cannot process input" message={result.error} />; }

const defaultProm: PromQueryInput = { metric: "http_requests_total", operation: "rate", window: "5m", labels: "job=api", groupBy: "job", without: false, quantile: 0.95 };
function PromFields({ value, onChange }: { value: PromQueryInput; onChange: (value: PromQueryInput) => void }) {
  return <div className="space-y-3"><Field label="Metric"><TextInput value={value.metric} onChange={(e) => onChange({ ...value, metric: e.target.value })} className="font-mono" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Operation"><Select value={value.operation} onChange={(e) => onChange({ ...value, operation: e.target.value as PromQueryInput["operation"] })}>{["raw", "rate", "increase", "sum", "avg", "max", "min", "count", "histogram_quantile"].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Range"><TextInput value={value.window} onChange={(e) => onChange({ ...value, window: e.target.value })} className="font-mono" /></Field></div><Field label="Label matchers"><TextInput value={value.labels} onChange={(e) => onChange({ ...value, labels: e.target.value })} className="font-mono" /></Field><Field label="Group by"><TextInput value={value.groupBy} onChange={(e) => onChange({ ...value, groupBy: e.target.value })} className="font-mono" /></Field>{value.operation === "histogram_quantile" && <Field label="Quantile"><TextInput value={String(value.quantile)} onChange={(e) => onChange({ ...value, quantile: Number(e.target.value) })} /></Field>}</div>;
}

export function GrafanaStandaloneTool({ id }: { id: string }) {
  const tool = TOOL_MAP[id];
  const [input, setInput] = useState('{"title":"Service Overview","schemaVersion":39,"panels":[]}');
  const [jsonOperation, setJsonOperation] = useState<"format" | "minify" | "validate">(id === "grafana-dashboard-json-validator" ? "validate" : "format");
  const [panel, setPanel] = useState<GrafanaPanelInput>({ title: "Request rate", type: "timeseries", query: "sum(rate(http_requests_total[5m]))", legend: "{{job}}", unit: "reqps", warning: 70, critical: 90 });
  const [query, setQuery] = useState(defaultProm);
  const [variable, setVariable] = useState({ name: "instance", label: "instance", metric: "up", datasource: "${DS_PROMETHEUS}", multi: true, includeAll: true });
  const [threshold, setThreshold] = useState({ warning: 70, critical: 90, mode: "absolute" });
  const [template, setTemplate] = useState<GrafanaTemplateId>("linux");
  const result = useMemo<Result>(() => run(() => {
    if (id === "grafana-dashboard-json-formatter") {
      if (jsonOperation === "format") return formatJson(input);
      if (jsonOperation === "minify") return minifyJson(input);
      const errors = validateGrafanaDashboard(input); return errors.length ? errors.map((error) => `ERROR ${error}`).join("\n") : "Dashboard JSON structure is valid.";
    }
    if (id === "grafana-dashboard-json-validator") { const errors = validateGrafanaDashboard(input); return errors.length ? errors.map((error) => `ERROR ${error}`).join("\n") : "Dashboard JSON structure is valid.\n\nValidation covers title, panels, panel types/grid positions and schemaVersion type. It does not claim compatibility with every Grafana release."; }
    if (id === "grafana-panel-json-generator") return grafanaPanel(panel);
    if (id === "grafana-promql-helper") return buildPromQl(query);
    if (id === "grafana-variable-generator") return { name: variable.name.replace(/^\$/, ""), label: variable.label, type: "query", datasource: { type: "prometheus", uid: variable.datasource }, query: `label_values(${variable.metric}, ${variable.label})`, refresh: 1, multi: variable.multi, includeAll: variable.includeAll };
    if (id === "grafana-threshold-helper") { if (threshold.warning >= threshold.critical) throw new Error("Warning must be lower than critical."); return { mode: threshold.mode, steps: [{ color: "green", value: null }, { color: "yellow", value: threshold.warning }, { color: "red", value: threshold.critical }] }; }
    return grafanaTemplate(template);
  }), [id, input, jsonOperation, panel, query, variable, threshold, template]);
  let form: React.ReactNode;
  if (id.includes("json-formatter") || id.includes("json-validator")) form = <div>{id.includes("json-formatter") && <Field label="Operation" className="mb-3"><Select value={jsonOperation} onChange={(e) => setJsonOperation(e.target.value as typeof jsonOperation)}><option value="format">Format</option><option value="minify">Minify</option><option value="validate">Validate structure</option></Select></Field>}<CodeArea label="Grafana dashboard JSON" value={input} onChange={setInput} rows={15} accept=".json" onFile={(text) => setInput(text)} /></div>;
  else if (id === "grafana-panel-json-generator") form = <PanelFields panel={panel} onChange={setPanel} />;
  else if (id === "grafana-promql-helper") form = <PromFields value={query} onChange={setQuery} />;
  else if (id === "grafana-variable-generator") form = <div className="space-y-3"><div className="grid grid-cols-2 gap-3"><Field label="Variable name"><TextInput value={variable.name} onChange={(e) => setVariable({ ...variable, name: e.target.value })} /></Field><Field label="Label"><TextInput value={variable.label} onChange={(e) => setVariable({ ...variable, label: e.target.value })} /></Field></div><Field label="Metric"><TextInput value={variable.metric} onChange={(e) => setVariable({ ...variable, metric: e.target.value })} className="font-mono" /></Field><Field label="Datasource UID"><TextInput value={variable.datasource} onChange={(e) => setVariable({ ...variable, datasource: e.target.value })} className="font-mono" /></Field><div className="flex gap-2"><Check label="Multi-value" checked={variable.multi} onChange={(value) => setVariable({ ...variable, multi: value })} /><Check label="Include All" checked={variable.includeAll} onChange={(value) => setVariable({ ...variable, includeAll: value })} /></div></div>;
  else if (id === "grafana-threshold-helper") form = <div className="space-y-3"><Field label="Mode"><Select value={threshold.mode} onChange={(e) => setThreshold({ ...threshold, mode: e.target.value })}><option value="absolute">absolute</option><option value="percentage">percentage</option></Select></Field><div className="grid grid-cols-2 gap-3"><Field label="Warning"><TextInput value={String(threshold.warning)} onChange={(e) => setThreshold({ ...threshold, warning: Number(e.target.value) })} /></Field><Field label="Critical"><TextInput value={String(threshold.critical)} onChange={(e) => setThreshold({ ...threshold, critical: Number(e.target.value) })} /></Field></div></div>;
  else form = <Field label="Starter template"><Select value={template} onChange={(e) => setTemplate(e.target.value as GrafanaTemplateId)}>{["linux", "node-exporter", "docker", "kubernetes", "nginx", "postgresql", "mysql", "redis", "prometheus"].map((value) => <option key={value}>{value}</option>)}</Select></Field>;
  return <ToolScaffold tool={tool} next={tool.related.slice(0, 3).map((related) => ({ label: TOOL_MAP[related]?.name ?? related, to: TOOL_MAP[related]?.route ?? "/tools" }))}><Panel className="p-4"><Split left={form} right={<ResultPane result={result} filename={id.includes("promql") ? "query.promql" : "grafana.json"} />} />{id === "grafana-dashboard-json-formatter" && result.ok && <p className="mt-3 text-[12px] text-zinc-500">Minified size: {minifyJson(input).length.toLocaleString()} characters.</p>}</Panel></ToolScaffold>;
}
function PanelFields({ panel, onChange }: { panel: GrafanaPanelInput; onChange: (panel: GrafanaPanelInput) => void }) { return <div className="space-y-3"><Field label="Title"><TextInput value={panel.title} onChange={(e) => onChange({ ...panel, title: e.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Panel type"><Select value={panel.type} onChange={(e) => onChange({ ...panel, type: e.target.value as GrafanaPanelInput["type"] })}>{["timeseries", "stat", "gauge", "table", "barchart", "logs"].map((type) => <option key={type}>{type}</option>)}</Select></Field><Field label="Unit"><TextInput value={panel.unit} onChange={(e) => onChange({ ...panel, unit: e.target.value })} /></Field></div><Field label="Query"><textarea value={panel.query} onChange={(e) => onChange({ ...panel, query: e.target.value })} rows={5} className="w-full rounded-lg border border-zinc-300 bg-white p-3 font-mono text-[12px] dark:border-zinc-700 dark:bg-zinc-900" /></Field><Field label="Legend"><TextInput value={panel.legend} onChange={(e) => onChange({ ...panel, legend: e.target.value })} className="font-mono" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Warning"><TextInput value={String(panel.warning)} onChange={(e) => onChange({ ...panel, warning: Number(e.target.value) })} /></Field><Field label="Critical"><TextInput value={String(panel.critical)} onChange={(e) => onChange({ ...panel, critical: Number(e.target.value) })} /></Field></div></div>; }

const defaultItem: ZabbixItemInput = { name: "CPU utilization", key: "system.cpu.util", type: "ZABBIX_PASSIVE", interval: "1m", valueType: "FLOAT", units: "%", history: "7d", trends: "365d", tags: "component=cpu" };
export function ZabbixStandaloneTool({ id }: { id: string }) {
  const tool = TOOL_MAP[id]; const [host, setHost] = useState("Template Linux by DevUtils"); const [kind, setKind] = useState<"cpu" | "memory" | "disk" | "host" | "service">("cpu"); const [threshold, setThreshold] = useState("80"); const [duration, setDuration] = useState("5m"); const [item, setItem] = useState(defaultItem); const [macro, setMacro] = useState("CPU.WARN"); const [macroValue, setMacroValue] = useState("80"); const [templatePreset, setTemplatePreset] = useState<ZabbixTemplatePresetId>("linux"); const [api, setApi] = useState({ url: "https://zabbix.example.com", method: "problem.get", params: '{"output":"extend","recent":true}', language: "curl" as "curl" | "python" | "javascript" });
  const expression = useMemo(() => resultOfExpression(kind, host, threshold, duration), [kind, host, threshold, duration]);
  const result = useMemo<Result>(() => run(() => {
    if (id === "zabbix-item-key-helper") return item.key;
    if (id === "zabbix-trigger-expression-builder") return expression;
    if (id === "zabbix-macro-generator") return `${normalizeMacro(macro)}=${macroValue}`;
    if (id === "zabbix-item-generator") return zabbixItem(item);
    if (id === "zabbix-trigger-generator") return zabbixTrigger({ name: `${kind.toUpperCase()} condition`, expression, severity: "HIGH", recovery: "", tags: "source=devutils" });
    if (id === "zabbix-discovery-helper") return { name: "Filesystem discovery", key: "vfs.fs.discovery", type: "ZABBIX_PASSIVE", delay: "1h", item_prototypes: [{ name: "Disk use on {#FSNAME}", key: "vfs.fs.size[{#FSNAME},pused]", value_type: "FLOAT", units: "%" }], trigger_prototypes: [{ name: "Disk use high on {#FSNAME}", expression: `min(/${host}/vfs.fs.size[{#FSNAME},pused],5m)>90`, priority: "HIGH" }] };
    if (id === "zabbix-api-request-builder") return zabbixApiExample({ ...api });
    return zabbixTemplatePreset(templatePreset);
  }), [id, item, expression, macro, macroValue, kind, host, api, templatePreset]);
  let form: React.ReactNode;
  if (id === "zabbix-item-key-helper") form = <ZabbixItemFields item={item} onChange={setItem} />;
  else if (id === "zabbix-macro-generator") form = <div className="space-y-3"><Field label="Macro name"><TextInput value={macro} onChange={(e) => setMacro(e.target.value)} className="font-mono" /></Field><Field label="Value"><TextInput value={macroValue} onChange={(e) => setMacroValue(e.target.value)} className="font-mono" /></Field></div>;
  else if (id === "zabbix-item-generator") form = <ZabbixItemFields item={item} onChange={setItem} />;
  else if (id === "zabbix-api-request-builder") form = <div className="space-y-3"><Field label="Server URL"><TextInput value={api.url} onChange={(e) => setApi({ ...api, url: e.target.value })} className="font-mono" /></Field><Field label="Operation"><Select value={api.method} onChange={(e) => setApi({ ...api, method: e.target.value })}>{["user.login", "host.get", "item.get", "problem.get", "trigger.get"].map((value) => <option key={value}>{value}</option>)}</Select></Field><CodeArea label="Params JSON" value={api.params} onChange={(value) => setApi({ ...api, params: value })} rows={5} /><Field label="Language"><Select value={api.language} onChange={(e) => setApi({ ...api, language: e.target.value as typeof api.language })}><option>curl</option><option>python</option><option>javascript</option></Select></Field></div>;
  else if (id === "zabbix") form = <Field label="Implemented starter template"><Select value={templatePreset} onChange={(e) => setTemplatePreset(e.target.value as ZabbixTemplatePresetId)}>{["linux", "windows", "docker", "vmware", "kubernetes", "mysql", "postgresql", "nginx", "apache", "snmp-network"].map((value) => <option key={value}>{value}</option>)}</Select></Field>;
  else form = <ZabbixExpressionFields host={host} setHost={setHost} kind={kind} setKind={setKind} threshold={threshold} setThreshold={setThreshold} duration={duration} setDuration={setDuration} />;
  return <ToolScaffold tool={tool} next={tool.related.slice(0, 3).map((related) => ({ label: TOOL_MAP[related]?.name ?? related, to: TOOL_MAP[related]?.route ?? "/tools" }))}><Panel className="p-4"><Split left={form} right={<ResultPane result={result} filename={id.includes("api") ? `zabbix.${api.language === "python" ? "py" : api.language === "javascript" ? "js" : "sh"}` : "zabbix.json"} />} /><p className="mt-3 text-[12px] text-zinc-500">Code generation only. This tool never connects to a Zabbix server and stores no token.</p></Panel></ToolScaffold>;
}
function resultOfExpression(kind: "cpu" | "memory" | "disk" | "host" | "service", host: string, threshold: string, duration: string) { return zabbixExpression(kind, { host, threshold: Number(threshold), duration, service: "nginx" }); }
function ZabbixExpressionFields(props: { host: string; setHost: (v: string) => void; kind: "cpu" | "memory" | "disk" | "host" | "service"; setKind: (v: "cpu" | "memory" | "disk" | "host" | "service") => void; threshold: string; setThreshold: (v: string) => void; duration: string; setDuration: (v: string) => void }) { return <div className="space-y-3"><Field label="Host / template"><TextInput value={props.host} onChange={(e) => props.setHost(e.target.value)} /></Field><Field label="Condition"><Select value={props.kind} onChange={(e) => props.setKind(e.target.value as typeof props.kind)}><option value="cpu">CPU high</option><option value="memory">Memory high</option><option value="disk">Disk usage high</option><option value="host">Host unavailable</option><option value="service">Service down</option></Select></Field><div className="grid grid-cols-2 gap-3"><Field label="Threshold"><TextInput value={props.threshold} onChange={(e) => props.setThreshold(e.target.value)} /></Field><Field label="Duration"><TextInput value={props.duration} onChange={(e) => props.setDuration(e.target.value)} /></Field></div></div>; }
function ZabbixItemFields({ item, onChange }: { item: ZabbixItemInput; onChange: (item: ZabbixItemInput) => void }) { return <div className="space-y-3"><Field label="Common key"><Select value={item.key} onChange={(e) => onChange({ ...item, key: e.target.value })}>{["system.cpu.util", "vm.memory.size[pavailable]", "vfs.fs.size[/,pused]", "agent.ping", "proc.num[nginx]", "net.tcp.service[http]", "system.uptime"].map((key) => <option key={key}>{key}</option>)}</Select></Field><Field label="Item name"><TextInput value={item.name} onChange={(e) => onChange({ ...item, name: e.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Type"><Select value={item.type} onChange={(e) => onChange({ ...item, type: e.target.value })}><option>ZABBIX_PASSIVE</option><option>ZABBIX_ACTIVE</option><option>SNMP_AGENT</option><option>HTTP_AGENT</option></Select></Field><Field label="Interval"><TextInput value={item.interval} onChange={(e) => onChange({ ...item, interval: e.target.value })} /></Field></div><div className="grid grid-cols-3 gap-2"><Field label="Units"><TextInput value={item.units} onChange={(e) => onChange({ ...item, units: e.target.value })} /></Field><Field label="History"><TextInput value={item.history} onChange={(e) => onChange({ ...item, history: e.target.value })} /></Field><Field label="Trends"><TextInput value={item.trends} onChange={(e) => onChange({ ...item, trends: e.target.value })} /></Field></div></div>; }

export function PrometheusStandaloneTool({ id }: { id: string }) {
  const tool = TOOL_MAP[id]; const [query, setQuery] = useState(defaultProm); const [raw, setRaw] = useState("sum(rate(http_requests_total{job=\"api\"}[5m])) by (job)"); const [name, setName] = useState("HighErrorRate"); const [expression, setExpression] = useState("sum(rate(http_requests_total{status=~\"5..\"}[5m])) > 1"); const [targets, setTargets] = useState("localhost:9090\nnode:9100"); const [labels, setLabels] = useState("job=node,instance=~server-.+");
  const result = useMemo<Result>(() => run(() => {
    if (id === "prometheus") return buildPromQl(query);
    if (id === "promql-formatter") return formatPromQl(raw);
    if (id === "prometheus-alert-rule-generator") return prometheusRule({ name, expression, duration: "5m", severity: "warning", summary: `${name} firing`, recording: false });
    if (id === "prometheus-recording-rule-generator") return prometheusRule({ name: name.replace(/[^a-zA-Z0-9_:]/g, "_").toLowerCase(), expression, duration: "", severity: "", summary: "", recording: true });
    if (id === "prometheus-config-helper") return prometheusScrapeConfig({ jobName: "devutils", targets: targets.split(/\r?\n/).filter(Boolean), interval: "15s" });
    return prometheusSelector(labels);
  }), [id, query, raw, name, expression, targets, labels]);
  const form = id === "prometheus" ? <PromFields value={query} onChange={setQuery} /> : id === "promql-formatter" ? <CodeArea label="PromQL" value={raw} onChange={setRaw} rows={10} /> : id.includes("rule-generator") ? <div className="space-y-3"><Field label="Rule name"><TextInput value={name} onChange={(e) => setName(e.target.value)} className="font-mono" /></Field><Field label="Expression"><textarea value={expression} onChange={(e) => setExpression(e.target.value)} rows={5} className="w-full rounded-lg border border-zinc-300 bg-white p-3 font-mono text-[12px] dark:border-zinc-700 dark:bg-zinc-900" /></Field></div> : id === "prometheus-config-helper" ? <CodeArea label="Targets (host:port)" value={targets} onChange={setTargets} rows={8} /> : <Field label="Label matchers"><TextInput value={labels} onChange={(e) => setLabels(e.target.value)} className="font-mono" /></Field>;
  return <ToolScaffold tool={tool} next={tool.related.slice(0, 3).map((related) => ({ label: TOOL_MAP[related]?.name ?? related, to: TOOL_MAP[related]?.route ?? "/tools" }))}><Panel className="p-4"><Split left={form} right={<ResultPane result={result} filename={id.includes("rule") || id.includes("config") ? "prometheus.yml" : "query.promql"} />} /></Panel></ToolScaffold>;
}

export function LokiStandaloneTool({ id }: { id: string }) {
  const tool = TOOL_MAP[id]; const [labels, setLabels] = useState("job=nginx,namespace=production"); const [filter, setFilter] = useState("error"); const [parser, setParser] = useState<"none" | "json" | "logfmt" | "regexp">("json"); const [aggregation, setAggregation] = useState<"none" | "rate" | "count_over_time" | "bytes_rate">("none"); const [raw, setRaw] = useState('{job="nginx"}|="error"|json');
  const result = useMemo<Result>(() => run(() => id === "logql-formatter" ? formatLogQl(raw) : id === "loki-label-selector-builder" ? prometheusSelector(labels) : buildLogQl({ labels, filter, filterType: "contains", parser, parserExpression: "", range: "5m", aggregation })), [id, raw, labels, filter, parser, aggregation]);
  const form = id === "logql-formatter" ? <CodeArea label="LogQL" value={raw} onChange={setRaw} rows={10} /> : id === "loki-label-selector-builder" ? <Field label="Label matchers"><TextInput value={labels} onChange={(e) => setLabels(e.target.value)} className="font-mono" /></Field> : <div className="space-y-3"><Field label="Label matchers"><TextInput value={labels} onChange={(e) => setLabels(e.target.value)} className="font-mono" /></Field><Field label="Line contains"><TextInput value={filter} onChange={(e) => setFilter(e.target.value)} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Parser"><Select value={parser} onChange={(e) => setParser(e.target.value as typeof parser)}><option>none</option><option>json</option><option>logfmt</option><option>regexp</option></Select></Field><Field label="Aggregation"><Select value={aggregation} onChange={(e) => setAggregation(e.target.value as typeof aggregation)}><option>none</option><option>rate</option><option>count_over_time</option><option>bytes_rate</option></Select></Field></div></div>;
  return <ToolScaffold tool={tool} next={tool.related.slice(0, 3).map((related) => ({ label: TOOL_MAP[related]?.name ?? related, to: TOOL_MAP[related]?.route ?? "/tools" }))}><Panel className="p-4"><Split left={form} right={<ResultPane result={result} filename="query.logql" />} /></Panel></ToolScaffold>;
}

export function MonitoringStandaloneTool({ id }: { id: string }) {
  const tool = TOOL_MAP[id]; const [warning, setWarning] = useState("70"); const [critical, setCritical] = useState("90"); const [used, setUsed] = useState("7.2"); const [total, setTotal] = useState("16"); const [uptime, setUptime] = useState("43190"); const [downtime, setDowntime] = useState("10"); const [target, setTarget] = useState("99.9"); const [days, setDays] = useState("30"); const [requests, setRequests] = useState("1000000"); const [samples, setSamples] = useState("42,55,61,72,88,95,120,180,250,490");
  const result = useMemo<Result>(() => run(() => {
    if (id === "monitoring") return buildThresholds({ warning: Number(warning), critical: Number(critical), direction: "above" });
    if (id === "resource-utilization-calculator") return calculateMetric({ used: Number(used), total: Number(total), unit: "GiB" });
    if (id === "availability-calculator") return calculateAvailability({ uptimeMinutes: Number(uptime), downtimeMinutes: Number(downtime) });
    if (id === "percentile-helper") { const values = samples.split(/[,\s]+/).filter(Boolean).map(Number); return { p50: percentile(values, 50), p90: percentile(values, 90), p95: percentile(values, 95), p99: percentile(values, 99), "p99.9": percentile(values, 99.9) }; }
    const value = calculateSlo({ target: Number(target), days: Number(days), requests: Number(requests) });
    return { target: `${target}%`, periodDays: Number(days), allowedDowntimeSeconds: value.budgetSeconds, allowedFailures: value.allowedFailures, errorBudgetPercent: value.budgetFraction * 100 };
  }), [id, warning, critical, used, total, uptime, downtime, target, days, requests, samples]);
  const form = id === "monitoring" ? <div className="grid grid-cols-2 gap-3"><Field label="Warning %"><TextInput value={warning} onChange={(e) => setWarning(e.target.value)} /></Field><Field label="Critical %"><TextInput value={critical} onChange={(e) => setCritical(e.target.value)} /></Field></div> : id === "resource-utilization-calculator" ? <div className="grid grid-cols-2 gap-3"><Field label="Used"><TextInput value={used} onChange={(e) => setUsed(e.target.value)} /></Field><Field label="Total"><TextInput value={total} onChange={(e) => setTotal(e.target.value)} /></Field></div> : id === "availability-calculator" ? <div className="grid grid-cols-2 gap-3"><Field label="Uptime minutes"><TextInput value={uptime} onChange={(e) => setUptime(e.target.value)} /></Field><Field label="Downtime minutes"><TextInput value={downtime} onChange={(e) => setDowntime(e.target.value)} /></Field></div> : id === "percentile-helper" ? <CodeArea label="Latency samples" value={samples} onChange={setSamples} rows={9} /> : <div className="space-y-3"><Field label="SLO target %"><TextInput value={target} onChange={(e) => setTarget(e.target.value)} /></Field><Field label="Period days"><TextInput value={days} onChange={(e) => setDays(e.target.value)} /></Field><Field label="Requests"><TextInput value={requests} onChange={(e) => setRequests(e.target.value)} /></Field></div>;
  return <ToolScaffold tool={tool} next={tool.related.slice(0, 3).map((related) => ({ label: TOOL_MAP[related]?.name ?? related, to: TOOL_MAP[related]?.route ?? "/tools" }))}><Panel className="p-4"><Split left={form} right={<ResultPane result={result} filename="monitoring.json" />} /></Panel></ToolScaffold>;
}

export function LoggingStandaloneTool({ id }: { id: string }) {
  const tool = TOOL_MAP[id]; const [input, setInput] = useState(tool.example?.value ?? '{"timestamp":"2026-01-01T00:00:00Z","level":"error","message":"database unavailable"}'); const [other, setOther] = useState(""); const [levels, setLevels] = useState<LogLevel[]>(["warn", "error", "fatal"]);
  const result = useMemo<Result>(() => run(() => {
    if (id === "json-log-formatter" || id === "docker-log-formatter" || id === "nginx-log-parser" || id === "apache-log-parser" || id === "syslog-parser") return formatLogs(input);
    if (id === "log-cleaner" || id === "kubernetes-log-cleaner") return formatStackTraces(input);
    if (id === "log-level-extractor") return filterLogs(input, levels);
    if (id === "log-timestamp-normalizer") return normalizeLogTimestamps(input);
    if (id === "stack-trace-formatter") return formatStackTraces(input);
    if (id === "log-diff") return diffLogs(input, other);
    return extractLogErrors(input);
  }), [id, input, other, levels]);
  return <ToolScaffold tool={tool} next={tool.related.slice(0, 3).map((related) => ({ label: TOOL_MAP[related]?.name ?? related, to: TOOL_MAP[related]?.route ?? "/tools" }))}><Panel className="p-4">{id === "log-level-extractor" && <div className="mb-3 flex flex-wrap gap-2">{(["trace", "debug", "info", "warn", "error", "fatal", "unknown"] as LogLevel[]).map((level) => <Check key={level} label={level} checked={levels.includes(level)} onChange={() => setLevels((current) => current.includes(level) ? current.filter((value) => value !== level) : [...current, level])} />)}</div>}<Split left={<div><CodeArea label="Log input" value={input} onChange={setInput} rows={id === "log-diff" ? 8 : 15} accept=".log,.txt,.json" onFile={(text) => setInput(text)} />{id === "log-diff" && <div className="mt-3"><CodeArea label="Comparison logs" value={other} onChange={setOther} rows={8} /></div>}<p className="mt-2 text-[11.5px] text-zinc-400">Parsed entries: {parseLogs(input).length}. Processing is local.</p></div>} right={<ResultPane result={result} filename={id === "log-diff" ? "logs.diff" : "processed.log"} />} /></Panel></ToolScaffold>;
}