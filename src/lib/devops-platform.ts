/* Deterministic DevOps/observability generators. No React, credentials or network calls. */

export type AlertOperator = ">" | ">=" | "<" | "<=" | "==" | "!=";

export function calculateMetric(input: { used: number; total: number; unit?: string }) {
  if (!Number.isFinite(input.used) || !Number.isFinite(input.total) || input.total <= 0 || input.used < 0) throw new Error("Used must be at least 0 and total must be greater than 0.");
  const percent = (input.used / input.total) * 100;
  return { percent, free: Math.max(0, input.total - input.used), used: input.used, total: input.total, unit: input.unit ?? "" };
}

export function buildThresholds(input: { warning: number; critical: number; direction: "above" | "below" }) {
  if (![input.warning, input.critical].every(Number.isFinite)) throw new Error("Thresholds must be numbers.");
  if (input.direction === "above" && input.warning >= input.critical) throw new Error("For high-is-bad metrics, warning must be below critical.");
  if (input.direction === "below" && input.warning <= input.critical) throw new Error("For low-is-bad metrics, warning must be above critical.");
  return {
    warning: { operator: input.direction === "above" ? ">=" : "<=", value: input.warning },
    critical: { operator: input.direction === "above" ? ">=" : "<=", value: input.critical },
  };
}

export type PromQueryInput = {
  metric: string;
  operation: "raw" | "rate" | "increase" | "sum" | "avg" | "max" | "min" | "count" | "histogram_quantile";
  window: string;
  labels: string;
  groupBy: string;
  without: boolean;
  quantile: number;
};

function validatePromMetric(metric: string): string {
  const value = metric.trim();
  if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(value)) throw new Error("Metric names may contain letters, digits, underscores and colons, and cannot begin with a digit.");
  return value;
}

function promLabels(labels: string): string {
  const value = labels.trim();
  if (!value) return "";
  const entries = value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean).map((item) => {
    const match = item.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(=~|!~|!=|=)\s*(.+)$/);
    if (!match) throw new Error(`Invalid label matcher "${item}". Example: job=api or status=~5..`);
    const raw = match[3].replace(/^['"]|['"]$/g, "");
    return `${match[1]}${match[2]}${JSON.stringify(raw)}`;
  });
  return `{${entries.join(",")}}`;
}

export function buildPromQl(input: PromQueryInput): string {
  const metric = `${validatePromMetric(input.metric)}${promLabels(input.labels)}`;
  const window = input.window.trim();
  if (!/^\d+(ms|s|m|h|d|w|y)$/.test(window)) throw new Error("Window must be a Prometheus duration such as 5m, 1h or 7d.");
  let expression = metric;
  if (input.operation === "rate" || input.operation === "increase") expression = `${input.operation}(${metric}[${window}])`;
  else if (input.operation === "histogram_quantile") {
    if (!(input.quantile > 0 && input.quantile < 1)) throw new Error("Quantile must be between 0 and 1.");
    const groups = ["le", ...input.groupBy.split(",").map((item) => item.trim()).filter(Boolean)];
    expression = `histogram_quantile(${input.quantile}, sum by (${groups.join(", ")}) (rate(${metric}[${window}])))`;
    return expression;
  } else if (input.operation !== "raw") expression = `${input.operation}(${metric})`;
  const groups = input.groupBy.split(",").map((item) => item.trim()).filter(Boolean);
  if (groups.length && ["sum", "avg", "max", "min", "count"].includes(input.operation)) expression = `${input.operation} ${input.without ? "without" : "by"} (${groups.join(", ")}) (${metric})`;
  else if (groups.length && (input.operation === "rate" || input.operation === "increase")) expression = `sum ${input.without ? "without" : "by"} (${groups.join(", ")}) (${expression})`;
  return expression;
}

export function formatPromQl(input: string): string {
  const value = input.trim().replace(/\s+/g, " ");
  if (!value) throw new Error("Paste a PromQL expression first.");
  let depth = 0;
  for (const char of value) { if (char === "(") depth++; if (char === ")") depth--; if (depth < 0) throw new Error("Unexpected closing parenthesis."); }
  if (depth) throw new Error("Unbalanced parentheses in PromQL expression.");
  return value
    .replace(/\s*(=~|!~|!=|>=|<=|==|>|<|\+|-|\*|\/)\s*/g, " $1 ")
    .replace(/,\s*/g, ", ")
    .replace(/\{\s*/g, "{").replace(/\s*\}/g, "}")
    .replace(/\(\s*/g, "(").replace(/\s*\)/g, ")");
}

export function prometheusSelector(labels: string): string { return promLabels(labels); }

export function prometheusScrapeConfig(input: { jobName: string; targets: string[]; interval: string }): string {
  if (!input.jobName.trim()) throw new Error("Job name is required.");
  if (!input.targets.length) throw new Error("Add at least one host:port target.");
  return `global:\n  scrape_interval: ${input.interval || "15s"}\n\nscrape_configs:\n  - job_name: ${JSON.stringify(input.jobName.trim())}\n    static_configs:\n      - targets:\n${input.targets.map((target) => `          - ${JSON.stringify(target.trim())}`).join("\n")}\n`;
}

export function prometheusRule(input: { name: string; expression: string; duration: string; severity: string; summary: string; recording: boolean }): string {
  if (!input.name.trim() || !input.expression.trim()) throw new Error("Rule name and expression are required.");
  const key = input.recording ? "record" : "alert";
  return `groups:\n  - name: devutils.rules\n    rules:\n      - ${key}: ${input.name.trim()}\n        expr: ${input.expression.trim()}${input.recording ? "" : `\n        for: ${input.duration || "5m"}\n        labels:\n          severity: ${input.severity || "warning"}\n        annotations:\n          summary: ${JSON.stringify(input.summary || input.name)}`}\n`;
}

export type GrafanaPanelInput = { title: string; type: "timeseries" | "stat" | "gauge" | "barchart" | "table" | "logs" | "heatmap"; query: string; legend: string; unit: string; warning: number; critical: number };

export function grafanaPanel(input: GrafanaPanelInput, id = 1, gridPos = { x: 0, y: 0, w: 12, h: 8 }) {
  if (!input.title.trim()) throw new Error("Panel title is required.");
  if (!input.query.trim()) throw new Error("Panel query is required.");
  return {
    id,
    title: input.title.trim(),
    type: input.type,
    gridPos,
    datasource: { type: "prometheus", uid: "${DS_PROMETHEUS}" },
    targets: [{ refId: "A", expr: input.query.trim(), legendFormat: input.legend || "{{instance}}" }],
    fieldConfig: {
      defaults: {
        unit: input.unit || "short",
        thresholds: { mode: "absolute", steps: [{ color: "green", value: null }, { color: "yellow", value: input.warning }, { color: "red", value: input.critical }] },
      },
      overrides: [],
    },
    options: input.type === "stat" || input.type === "gauge" ? { reduceOptions: { calcs: ["lastNotNull"], fields: "", values: false } } : {},
  };
}

export function grafanaDashboard(input: { title: string; refresh: string; from: string; panels: GrafanaPanelInput[]; variables: string[]; tags: string[] }) {
  if (!input.title.trim()) throw new Error("Dashboard title is required.");
  const panels = input.panels.map((panel, index) => grafanaPanel(panel, index + 1, { x: (index % 2) * 12, y: Math.floor(index / 2) * 8, w: 12, h: 8 }));
  return {
    annotations: { list: [] }, editable: true, fiscalYearStartMonth: 0, graphTooltip: 0,
    links: [], liveNow: false, panels,
    refresh: input.refresh || "30s", schemaVersion: 39,
    tags: input.tags, templating: { list: input.variables.map((name) => ({ name, label: name, type: "query", datasource: { type: "prometheus", uid: "${DS_PROMETHEUS}" }, query: `label_values(${name})`, refresh: 1, includeAll: true, multi: true })) },
    time: { from: input.from || "now-6h", to: "now" }, timezone: "browser", title: input.title.trim(), uid: null, version: 1,
  };
}

export type GrafanaTemplateId = "linux" | "node-exporter" | "docker" | "kubernetes" | "nginx" | "postgresql" | "mysql" | "redis" | "prometheus";
export function grafanaTemplate(id: GrafanaTemplateId) {
  const templates: Record<GrafanaTemplateId, { title: string; variables: string[]; panels: GrafanaPanelInput[] }> = {
    linux: { title: "Linux Server Overview", variables: ["instance"], panels: [panel("CPU usage", "timeseries", '100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)', "percent"), panel("Memory usage", "gauge", "(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100", "percent"), panel("Disk usage", "gauge", '100 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes * 100)', "percent")] },
    "node-exporter": { title: "Node Exporter Overview", variables: ["job", "instance"], panels: [panel("Targets up", "stat", 'sum(up{job=~"$job"})', "short"), panel("Load 5m", "timeseries", 'node_load5{job=~"$job",instance=~"$instance"}', "short"), panel("Network receive", "timeseries", 'rate(node_network_receive_bytes_total{job=~"$job",instance=~"$instance",device!="lo"}[5m])', "Bps")] },
    docker: { title: "Docker Containers", variables: ["container"], panels: [panel("Container CPU", "timeseries", "rate(container_cpu_usage_seconds_total[5m]) * 100", "percent"), panel("Container memory", "timeseries", "container_memory_working_set_bytes", "bytes")] },
    kubernetes: { title: "Kubernetes Workloads", variables: ["namespace", "pod"], panels: [panel("Pod CPU", "timeseries", "sum by (pod) (rate(container_cpu_usage_seconds_total{namespace=~\"$namespace\",pod!=\"\"}[5m]))", "cores"), panel("Pod memory", "timeseries", "sum by (pod) (container_memory_working_set_bytes{namespace=~\"$namespace\",pod!=\"\"})", "bytes")] },
    nginx: { title: "Nginx Overview", variables: ["instance"], panels: [panel("Request rate", "timeseries", "sum(rate(nginx_http_requests_total[5m]))", "reqps"), panel("Connections", "stat", "sum(nginx_connections_active)", "short")] },
    postgresql: { title: "PostgreSQL Overview", variables: ["instance", "datname"], panels: [panel("Connections", "timeseries", "sum by (datname) (pg_stat_activity_count)", "short"), panel("Transaction rate", "timeseries", "sum(rate(pg_stat_database_xact_commit[5m]))", "ops")] },
    mysql: { title: "MySQL Overview", variables: ["instance"], panels: [panel("Connections", "timeseries", "mysql_global_status_threads_connected", "short"), panel("Queries/sec", "timeseries", "rate(mysql_global_status_queries[5m])", "qps"), panel("Buffer pool use", "gauge", "100 * mysql_global_status_innodb_buffer_pool_pages_data / mysql_global_status_innodb_buffer_pool_pages_total", "percent")] },
    redis: { title: "Redis Overview", variables: ["instance"], panels: [panel("Commands/sec", "timeseries", "rate(redis_commands_processed_total[5m])", "ops"), panel("Memory", "gauge", "redis_memory_used_bytes", "bytes")] },
    prometheus: { title: "Prometheus Self Monitoring", variables: ["instance"], panels: [panel("Ingestion rate", "timeseries", "rate(prometheus_tsdb_head_samples_appended_total[5m])", "ops"), panel("Active series", "stat", "prometheus_tsdb_head_series", "short"), panel("Rule evaluation failures", "timeseries", "rate(prometheus_rule_evaluation_failures_total[5m])", "ops")] },
  };
  const value = templates[id];
  return grafanaDashboard({ title: value.title, refresh: "30s", from: "now-6h", panels: value.panels, variables: value.variables, tags: [id, "devutils"] });
}
function panel(title: string, type: GrafanaPanelInput["type"], query: string, unit: string): GrafanaPanelInput { return { title, type, query, unit, legend: "{{instance}}", warning: 70, critical: 90 }; }

export function validateGrafanaDashboard(input: string): string[] {
  const errors: string[] = [];
  let value: unknown;
  try { value = JSON.parse(input); } catch (error) { return [`Invalid JSON: ${(error as Error).message}`]; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Dashboard root must be an object."];
  const root = value as Record<string, unknown>;
  if (typeof root.title !== "string" || !root.title.trim()) errors.push("$.title: non-empty dashboard title is required.");
  if (!Array.isArray(root.panels)) errors.push("$.panels: panels must be an array.");
  else root.panels.forEach((item, index) => {
    const panel = item as Record<string, unknown>;
    if (!panel || typeof panel !== "object") errors.push(`$.panels[${index}]: panel must be an object.`);
    else { if (typeof panel.title !== "string") errors.push(`$.panels[${index}].title: missing title.`); if (typeof panel.type !== "string") errors.push(`$.panels[${index}].type: missing type.`); if (!panel.gridPos) errors.push(`$.panels[${index}].gridPos: missing grid position.`); }
  });
  if (root.schemaVersion !== undefined && typeof root.schemaVersion !== "number") errors.push("$.schemaVersion: must be a number.");
  return errors;
}

export type ZabbixItemInput = { name: string; key: string; type: string; interval: string; valueType: string; units: string; history: string; trends: string; tags: string };
export function zabbixItem(input: ZabbixItemInput) {
  if (!input.name.trim() || !input.key.trim()) throw new Error("Item name and key are required.");
  if (!/^[a-zA-Z0-9_.-]+(?:\[[^\]]*\])?$/.test(input.key.trim())) throw new Error("Item key contains unsupported characters or unbalanced parameters.");
  return { name: input.name.trim(), key: input.key.trim(), type: input.type || "ZABBIX_PASSIVE", delay: input.interval || "1m", value_type: input.valueType || "FLOAT", units: input.units, history: input.history || "7d", trends: input.trends || "365d", tags: parseTags(input.tags) };
}

export function zabbixTrigger(input: { name: string; expression: string; severity: string; recovery: string; tags: string }) {
  if (!input.name.trim() || !input.expression.trim()) throw new Error("Trigger name and expression are required.");
  if (!/\/.+\/.+/.test(input.expression) && !/last\(|avg\(|min\(|max\(|nodata\(/.test(input.expression)) throw new Error("Expression should reference an item, e.g. avg(/Template/key,5m)>80.");
  return { name: input.name.trim(), expression: input.expression.trim(), recovery_mode: input.recovery.trim() ? "RECOVERY_EXPRESSION" : "EXPRESSION", recovery_expression: input.recovery.trim() || undefined, priority: input.severity || "WARNING", tags: parseTags(input.tags) };
}

function parseTags(value: string) { return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean).map((item) => { const [tag, ...rest] = item.split("="); return { tag: tag.trim(), value: rest.join("=").trim() }; }); }

export function zabbixExpression(requirement: "cpu" | "memory" | "disk" | "host" | "service", input: { host: string; threshold: number; duration: string; service?: string }) {
  const host = input.host.trim() || "Template Linux by DevUtils";
  const duration = input.duration || "5m";
  if (requirement === "cpu") return `avg(/${host}/system.cpu.util,${duration})>${input.threshold}`;
  if (requirement === "memory") return `avg(/${host}/vm.memory.utilization,${duration})>${input.threshold}`;
  if (requirement === "disk") return `min(/${host}/vfs.fs.size[/,pused],${duration})>${input.threshold}`;
  if (requirement === "host") return `nodata(/${host}/agent.ping,${duration})=1`;
  return `max(/${host}/proc.num[${input.service || "nginx"}],${duration})=0`;
}

export function zabbixTemplate(input: { name: string; group: string; items: ZabbixItemInput[]; triggers: { name: string; expression: string; severity: string; recovery: string; tags: string }[]; macros: string }) {
  const template = input.name.trim();
  if (!template) throw new Error("Template name is required.");
  return { zabbix_export: { version: "7.0", template_groups: [{ uuid: stableHex(`group:${input.group}`, 32), name: input.group || "Templates/DevUtils" }], templates: [{ uuid: stableHex(`template:${template}`, 32), template, name: template, groups: [{ name: input.group || "Templates/DevUtils" }], items: input.items.map(zabbixItem), macros: input.macros.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => { const [macro, ...value] = line.split("="); return { macro: normalizeMacro(macro), value: value.join("=") }; }), triggers: input.triggers.map(zabbixTrigger) }] } };
}

export function zabbixLinuxTemplate() {
  const name = "Linux by DevUtils agent";
  return zabbixTemplate({
    name,
    group: "Templates/Operating systems",
    macros: "CPU.WARN=80\nMEMORY.WARN=85\nDISK.CRIT=90",
    items: [
      { name: "CPU utilization", key: "system.cpu.util", type: "ZABBIX_PASSIVE", interval: "1m", valueType: "FLOAT", units: "%", history: "7d", trends: "365d", tags: "component=cpu" },
      { name: "Available memory", key: "vm.memory.size[pavailable]", type: "ZABBIX_PASSIVE", interval: "1m", valueType: "FLOAT", units: "%", history: "7d", trends: "365d", tags: "component=memory" },
      { name: "Root filesystem used", key: "vfs.fs.size[/,pused]", type: "ZABBIX_PASSIVE", interval: "1m", valueType: "FLOAT", units: "%", history: "7d", trends: "365d", tags: "component=storage" },
      { name: "Agent availability", key: "agent.ping", type: "ZABBIX_PASSIVE", interval: "1m", valueType: "UNSIGNED", units: "", history: "7d", trends: "365d", tags: "component=agent" },
    ],
    triggers: [
      { name: "High CPU utilization", expression: `avg(/${name}/system.cpu.util,5m)>80`, severity: "HIGH", recovery: `max(/${name}/system.cpu.util,5m)<70`, tags: "scope=performance" },
      { name: "Low available memory", expression: `min(/${name}/vm.memory.size[pavailable],5m)<15`, severity: "HIGH", recovery: `min(/${name}/vm.memory.size[pavailable],5m)>20`, tags: "scope=performance" },
      { name: "Root filesystem usage critical", expression: `min(/${name}/vfs.fs.size[/,pused],5m)>90`, severity: "DISASTER", recovery: `max(/${name}/vfs.fs.size[/,pused],5m)<85`, tags: "scope=capacity" },
      { name: "Agent unavailable", expression: `nodata(/${name}/agent.ping,5m)=1`, severity: "HIGH", recovery: "", tags: "scope=availability" },
    ],
  });
}

export type ZabbixTemplatePresetId = "linux" | "windows" | "docker" | "vmware" | "kubernetes" | "mysql" | "postgresql" | "nginx" | "apache" | "snmp-network";
export function zabbixTemplatePreset(id: ZabbixTemplatePresetId) {
  if (id === "linux") return zabbixLinuxTemplate();
  const presets: Record<Exclude<ZabbixTemplatePresetId, "linux">, { name: string; key: string; units: string; macro: string }> = {
    windows: { name: "Windows CPU utilization", key: 'perf_counter_en["\\Processor(_Total)\\% Processor Time",60]', units: "%", macro: "CPU.WARN=80" },
    docker: { name: "Docker daemon info", key: "docker.info", units: "", macro: "DOCKER.SOCKET=/var/run/docker.sock" },
    vmware: { name: "VMware hypervisor status", key: "vmware.hv.status[{$VMWARE.URL},{HOST.HOST}]", units: "", macro: "VMWARE.URL=https://vcenter.example.com/sdk" },
    kubernetes: { name: "Kubernetes API availability", key: "net.tcp.service[https,{$KUBE.API.HOST},{$KUBE.API.PORT}]", units: "", macro: "KUBE.API.HOST=kubernetes.default.svc\nKUBE.API.PORT=443" },
    mysql: { name: "MySQL ping", key: "mysql.ping[{$MYSQL.DSN}]", units: "", macro: "MYSQL.DSN=tcp://localhost:3306" },
    postgresql: { name: "PostgreSQL ping", key: "pgsql.ping[{$PG.URI}]", units: "", macro: "PG.URI=tcp://localhost:5432" },
    nginx: { name: "Nginx HTTP availability", key: "net.tcp.service[http,{$NGINX.HOST},{$NGINX.PORT}]", units: "", macro: "NGINX.HOST=localhost\nNGINX.PORT=80" },
    apache: { name: "Apache HTTP availability", key: "net.tcp.service[http,{$APACHE.HOST},{$APACHE.PORT}]", units: "", macro: "APACHE.HOST=localhost\nAPACHE.PORT=80" },
    "snmp-network": { name: "SNMP interface input octets", key: "net.if.in[ifHCInOctets.1]", units: "bps", macro: "SNMP.COMMUNITY=public" },
  };
  const preset = presets[id];
  const template = `${id.toUpperCase()} by DevUtils`;
  return zabbixTemplate({
    name: template,
    group: id === "snmp-network" ? "Templates/Network devices" : "Templates/Applications",
    macros: preset.macro,
    items: [{ name: preset.name, key: preset.key, type: id === "snmp-network" ? "SNMP_AGENT" : "ZABBIX_PASSIVE", interval: "1m", valueType: "UNSIGNED", units: preset.units, history: "7d", trends: "365d", tags: `component=${id}` }],
    triggers: [{ name: `${preset.name} unavailable`, expression: `nodata(/${template}/${preset.key},5m)=1`, severity: "HIGH", recovery: "", tags: "scope=availability" }],
  });
}

function stableHex(value: string, length: number): string { let h = 2166136261; for (const char of value) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h >>> 0).toString(16).padStart(8, "0").repeat(Math.ceil(length / 8)).slice(0, length); }
export function normalizeMacro(value: string): string { const name = value.trim().replace(/^\{\$|\}$/g, "").replace(/[^A-Za-z0-9_.]/g, "_").toUpperCase(); return `{$${name || "THRESHOLD"}}`; }

export function zabbixApiExample(input: { url: string; method: string; params: string; language: "curl" | "python" | "javascript" }): string {
  const endpoint = `${input.url.replace(/\/$/, "")}/api_jsonrpc.php`;
  let params: unknown = {};
  try { params = JSON.parse(input.params || "{}"); } catch { throw new Error("Params must be valid JSON."); }
  const payload = { jsonrpc: "2.0", method: input.method || "problem.get", params, id: 1 };
  if (input.language === "curl") return `curl -X POST ${JSON.stringify(endpoint)} \\\n+  -H 'Content-Type: application/json-rpc' \\\n+  -H 'Authorization: Bearer $ZABBIX_API_TOKEN' \\\n+  --data-raw '${JSON.stringify(payload)}'`;
  if (input.language === "python") return `import os, requests\n\npayload = ${JSON.stringify(payload, null, 2)}\nresponse = requests.post(${JSON.stringify(endpoint)}, json=payload, headers={"Authorization": f"Bearer {os.environ['ZABBIX_API_TOKEN']}"})\nresponse.raise_for_status()\nprint(response.json())`;
  return `const response = await fetch(${JSON.stringify(endpoint)}, {\n  method: "POST",\n  headers: { "Content-Type": "application/json-rpc", "Authorization": \`Bearer \${process.env.ZABBIX_API_TOKEN}\` },\n  body: JSON.stringify(${JSON.stringify(payload, null, 2)})\n});\nconsole.log(await response.json());`;
}

export function buildLogQl(input: { labels: string; filter: string; filterType: "contains" | "not-contains" | "regex" | "not-regex"; parser: "none" | "json" | "logfmt" | "regexp"; parserExpression: string; range: string; aggregation: "none" | "rate" | "count_over_time" | "bytes_rate" }) {
  const selector = promLabels(input.labels || "job=loki");
  const operators = { contains: "|=", "not-contains": "!=", regex: "|~", "not-regex": "!~" } as const;
  let query = selector;
  if (input.filter.trim()) query += ` ${operators[input.filterType]} ${JSON.stringify(input.filter.trim())}`;
  if (input.parser !== "none") query += input.parser === "regexp" ? ` | regexp ${JSON.stringify(input.parserExpression || "(?P<message>.*)")}` : ` | ${input.parser}`;
  if (input.aggregation !== "none") query = `${input.aggregation}(${query}[${input.range || "5m"}])`;
  return query;
}

export function formatLogQl(input: string): string {
  const value = input.trim().replace(/\s+/g, " ");
  if (!value) throw new Error("Paste a LogQL expression first.");
  let braces = 0, brackets = 0, quote = false, escaped = false;
  for (const char of value) {
    if (escaped) { escaped = false; continue; }
    if (char === "\\" && quote) { escaped = true; continue; }
    if (char === '"') { quote = !quote; continue; }
    if (quote) continue;
    if (char === "{") braces++; if (char === "}") braces--;
    if (char === "[") brackets++; if (char === "]") brackets--;
    if (braces < 0 || brackets < 0) throw new Error("Unexpected closing brace or bracket.");
  }
  if (quote || braces || brackets) throw new Error("Unbalanced string, brace or range selector.");
  return value.replace(/\s*(\|=|!=|\|~|!~|\|)\s*/g, " $1 ").replace(/,\s*/g, ", ").replace(/\{\s*/g, "{").replace(/\s*\}/g, "}");
}

export function calculateAvailability(input: { uptimeMinutes: number; downtimeMinutes: number }) {
  if (input.uptimeMinutes < 0 || input.downtimeMinutes < 0 || !Number.isFinite(input.uptimeMinutes + input.downtimeMinutes)) throw new Error("Uptime and downtime must be non-negative numbers.");
  const total = input.uptimeMinutes + input.downtimeMinutes;
  if (total <= 0) throw new Error("Total observed time must be greater than zero.");
  return { availability: (input.uptimeMinutes / total) * 100, totalMinutes: total, downtimeMinutes: input.downtimeMinutes };
}

export function calculateSlo(input: { target: number; days: number; requests?: number }) {
  if (!(input.target > 0 && input.target < 100)) throw new Error("SLO target must be between 0 and 100 percent.");
  if (!(input.days > 0 && input.days <= 366)) throw new Error("Period must be 1–366 days.");
  const budgetFraction = 1 - input.target / 100;
  const periodMs = input.days * 86400000;
  const budgetMs = periodMs * budgetFraction;
  return { budgetFraction, budgetMs, budgetSeconds: budgetMs / 1000, allowedFailures: input.requests === undefined ? null : Math.floor(input.requests * budgetFraction), targetSuccesses: input.requests === undefined ? null : Math.ceil(input.requests * input.target / 100) };
}

export function percentile(values: number[], p: number): number {
  if (!values.length || values.some((value) => !Number.isFinite(value))) throw new Error("Provide a list of numeric latency samples.");
  if (!(p > 0 && p <= 100)) throw new Error("Percentile must be in (0, 100].");
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank), upper = Math.ceil(rank), weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function parseArn(value: string) {
  const match = value.trim().match(/^arn:([^:]+):([^:]*):([^:]*):([^:]*):(.+)$/);
  if (!match) throw new Error("ARN must follow arn:partition:service:region:account-id:resource.");
  return { partition: match[1], service: match[2], region: match[3] || "(global)", account: match[4] || "(none)", resource: match[5], resourceType: match[5].split(/[/:]/)[0] };
}

export function buildArn(input: { partition: string; service: string; region: string; account: string; resource: string }): string {
  const partition = input.partition.trim() || "aws";
  const service = input.service.trim();
  const region = input.region.trim();
  const account = input.account.trim();
  const resource = input.resource.trim();
  if (!/^[a-z0-9-]+$/.test(partition) || !/^[a-z0-9-]+$/.test(service) || !resource || /\s/.test(resource)) throw new Error("Partition/service must be lowercase identifiers and resource cannot contain whitespace.");
  if (account && !/^\d{12}$/.test(account)) throw new Error("AWS account ID must contain 12 digits or be empty for global resources.");
  return `arn:${partition}:${service}:${region}:${account}:${resource}`;
}

export function buildIamPolicy(input: { effect: "Allow" | "Deny"; actions: string[]; resources: string[]; condition?: string }) {
  if (!input.actions.length || !input.resources.length) throw new Error("At least one action and resource are required.");
  let condition: unknown;
  if (input.condition?.trim()) { try { condition = JSON.parse(input.condition); } catch { throw new Error("Condition must be valid JSON."); } }
  const broad = input.effect === "Allow" && (input.actions.includes("*") || input.actions.some((action) => action.endsWith(":*"))) && input.resources.includes("*");
  return { policy: { Version: "2012-10-17", Statement: [{ Effect: input.effect, Action: input.actions, Resource: input.resources, ...(condition ? { Condition: condition } : {}) }] }, warnings: broad ? ["This Allow statement combines a wildcard action with Resource '*'. Scope actions and resources before production use."] : [] };
}

export function awsSecurityGroupRule(input: { direction: "ingress" | "egress"; protocol: string; fromPort: number; toPort: number; cidr: string; description: string }) {
  if (!Number.isInteger(input.fromPort) || !Number.isInteger(input.toPort) || input.fromPort < -1 || input.toPort > 65535 || input.fromPort > input.toPort) throw new Error("Ports must form a valid -1 or 0–65535 range.");
  const open = input.cidr === "0.0.0.0/0" || input.cidr === "::/0";
  const warnings = open && input.direction === "ingress" ? ["This inbound rule is open to the internet. Restrict the CIDR unless public access is required."] : [];
  return { rule: { IpProtocol: input.protocol, FromPort: input.fromPort, ToPort: input.toPort, IpRanges: input.cidr.includes(":") ? undefined : [{ CidrIp: input.cidr, Description: input.description }], Ipv6Ranges: input.cidr.includes(":") ? [{ CidrIpv6: input.cidr, Description: input.description }] : undefined }, warnings };
}

export function awsUserData(template: "docker-ubuntu" | "nginx-ubuntu" | "node-ubuntu" | "python-ubuntu" | "monitoring-amazon-linux"): string {
  const scripts = {
    "docker-ubuntu": "#!/bin/bash\nset -euxo pipefail\napt-get update\napt-get install -y ca-certificates curl\ninstall -m 0755 -d /etc/apt/keyrings\ncurl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc\nchmod a+r /etc/apt/keyrings/docker.asc\necho \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable\" > /etc/apt/sources.list.d/docker.list\napt-get update\napt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin\nsystemctl enable --now docker\n",
    "nginx-ubuntu": "#!/bin/bash\nset -euxo pipefail\napt-get update\napt-get install -y nginx\nsystemctl enable --now nginx\n",
    "node-ubuntu": "#!/bin/bash\nset -euxo pipefail\napt-get update\napt-get install -y ca-certificates curl\ncurl -fsSL https://deb.nodesource.com/setup_20.x | bash -\napt-get install -y nodejs\nnode --version\n",
    "python-ubuntu": "#!/bin/bash\nset -euxo pipefail\napt-get update\napt-get install -y python3 python3-venv python3-pip\npython3 -m venv /opt/app-venv\n",
    "monitoring-amazon-linux": "#!/bin/bash\nset -euxo pipefail\ndnf install -y amazon-cloudwatch-agent\nsystemctl enable amazon-cloudwatch-agent\n# Add /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json before starting.\n",
  } as const;
  return scripts[template];
}

export function parseS3Url(value: string) {
  const raw = value.trim();
  let bucket = "", key = "", region = "";
  if (raw.startsWith("s3://")) { const rest = raw.slice(5); const slash = rest.indexOf("/"); bucket = slash < 0 ? rest : rest.slice(0, slash); key = slash < 0 ? "" : rest.slice(slash + 1); }
  else {
    const url = new URL(raw);
    const virtual = url.hostname.match(/^(.+)\.s3(?:[.-]([a-z0-9-]+))?\.amazonaws\.com$/);
    if (virtual) { bucket = virtual[1]; region = virtual[2] ?? ""; key = decodeURIComponent(url.pathname.replace(/^\//, "")); }
    else if (/^s3[.-]/.test(url.hostname) || url.hostname === "s3.amazonaws.com") { const parts = url.pathname.replace(/^\//, "").split("/"); bucket = parts.shift() ?? ""; key = decodeURIComponent(parts.join("/")); region = url.hostname.match(/^s3[.-]([a-z0-9-]+)/)?.[1] ?? ""; }
    else throw new Error("Not a recognized s3://, virtual-hosted, or path-style S3 URL.");
  }
  if (!bucket) throw new Error("S3 bucket is missing.");
  return { bucket, key, region: region || "(not specified)", s3Uri: `s3://${bucket}${key ? `/${key}` : ""}`, virtualHostedUrl: `https://${bucket}.s3${region ? `.${region}` : ""}.amazonaws.com/${encodeURI(key)}` };
}

export function awsCliCommand(input: { service: string; operation: string; region: string; profile: string }): string {
  if (!/^[a-z0-9-]+$/.test(input.service.trim()) || !input.operation.trim()) throw new Error("Service and operation are required.");
  return `aws ${input.service.trim()} ${input.operation.trim()}${input.region.trim() ? ` --region ${input.region.trim()}` : ""}${input.profile.trim() ? ` --profile ${input.profile.trim()}` : ""}`;
}

export function ecrCommands(input: { region: string; account: string; repository: string; tag: string }) {
  if (!/^\d{12}$/.test(input.account)) throw new Error("AWS account must contain 12 digits.");
  const registry = `${input.account}.dkr.ecr.${input.region}.amazonaws.com`, image = `${registry}/${input.repository}:${input.tag || "latest"}`;
  return `aws ecr get-login-password --region ${input.region} | docker login --username AWS --password-stdin ${registry}\ndocker build -t ${input.repository}:${input.tag || "latest"} .\ndocker tag ${input.repository}:${input.tag || "latest"} ${image}\ndocker push ${image}\ndocker pull ${image}`;
}

export function lambdaEvent(type: "apigw-v2" | "s3" | "sqs" | "eventbridge" | "sns") {
  const events = {
    "apigw-v2": { version: "2.0", routeKey: "GET /hello", rawPath: "/hello", headers: { host: "example.execute-api.us-east-1.amazonaws.com" }, requestContext: { http: { method: "GET", path: "/hello" } }, isBase64Encoded: false },
    s3: { Records: [{ eventSource: "aws:s3", eventName: "ObjectCreated:Put", awsRegion: "us-east-1", s3: { bucket: { name: "example-bucket" }, object: { key: "uploads/example.json", size: 123 } } }] },
    sqs: { Records: [{ messageId: "example-id", body: "{\"hello\":true}", eventSource: "aws:sqs", awsRegion: "us-east-1" }] },
    eventbridge: { version: "0", id: "example-id", "detail-type": "Example Event", source: "devutils.example", time: new Date(0).toISOString(), region: "us-east-1", detail: { hello: true } },
    sns: { Records: [{ EventSource: "aws:sns", Sns: { MessageId: "example-id", TopicArn: "arn:aws:sns:us-east-1:123456789012:example", Message: "Hello" } }] },
  };
  return events[type];
}

export function parseAzureResourceId(value: string) {
  const parts = value.trim().split("/").filter(Boolean);
  const index = (name: string) => parts.findIndex((part) => part.toLowerCase() === name.toLowerCase());
  const sub = index("subscriptions"), group = index("resourceGroups"), providers = index("providers");
  if (sub < 0 || group < 0 || providers < 0 || !parts[sub + 1] || !parts[group + 1] || !parts[providers + 1]) throw new Error("Azure resource ID must include subscriptions, resourceGroups, and providers.");
  const resources = parts.slice(providers + 2);
  return { subscription: parts[sub + 1], resourceGroup: parts[group + 1], provider: parts[providers + 1], resourceType: resources.filter((_, i) => i % 2 === 0).join("/"), resourceName: resources.filter((_, i) => i % 2 === 1).join("/") };
}

export function azureCliCommand(input: { group: string; operation: string; resourceGroup: string; name: string; location: string }) {
  if (!input.group.trim() || !input.operation.trim()) throw new Error("Azure command group and operation are required.");
  return `az ${input.group.trim()} ${input.operation.trim()}${input.resourceGroup.trim() ? ` --resource-group ${JSON.stringify(input.resourceGroup.trim())}` : ""}${input.name.trim() ? ` --name ${JSON.stringify(input.name.trim())}` : ""}${input.location.trim() ? ` --location ${JSON.stringify(input.location.trim())}` : ""}`;
}

export function bicepTemplate(type: "storage" | "vnet" | "nsg" | "app-service" | "aks") {
  const body = {
    storage: "resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {\n  name: storageName\n  location: location\n  sku: { name: 'Standard_LRS' }\n  kind: 'StorageV2'\n}",
    vnet: "resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {\n  name: name\n  location: location\n  properties: { addressSpace: { addressPrefixes: ['10.0.0.0/16'] } }\n}",
    nsg: "resource nsg 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {\n  name: name\n  location: location\n  properties: { securityRules: [] }\n}",
    "app-service": "resource plan 'Microsoft.Web/serverfarms@2023-01-01' = { name: '${name}-plan' location: location sku: { name: 'B1' } }\nresource app 'Microsoft.Web/sites@2023-01-01' = { name: name location: location properties: { serverFarmId: plan.id httpsOnly: true } }",
    aks: "resource aks 'Microsoft.ContainerService/managedClusters@2024-01-01' = {\n  name: name\n  location: location\n  identity: { type: 'SystemAssigned' }\n  properties: { dnsPrefix: name agentPoolProfiles: [{ name: 'system' count: 2 vmSize: 'Standard_D2s_v5' mode: 'System' osType: 'Linux' }] }\n}",
  }[type];
  return `param name string\nparam location string = resourceGroup().location\n\n${body}\n`;
}

export function parseGcpResource(value: string) {
  const raw = value.trim().replace(/^\/\//, "");
  const parts = raw.split("/").filter(Boolean);
  const project = parts.indexOf("projects"), location = Math.max(parts.indexOf("locations"), parts.indexOf("zones"), parts.indexOf("regions"));
  if (project < 0 || !parts[project + 1]) throw new Error("GCP resource must include projects/{project-id}.");
  return { project: parts[project + 1], location: location >= 0 ? parts[location + 1] : "(global)", collection: parts[parts.length - 2] ?? "(none)", resource: parts[parts.length - 1], fullName: `//${raw}` };
}

export function gcloudCommand(input: { group: string; operation: string; name: string; project: string; region: string }) {
  if (!input.group.trim() || !input.operation.trim()) throw new Error("gcloud group and operation are required.");
  return `gcloud ${input.group.trim()} ${input.operation.trim()}${input.name.trim() ? ` ${JSON.stringify(input.name.trim())}` : ""}${input.project.trim() ? ` --project ${input.project.trim()}` : ""}${input.region.trim() ? ` --region ${input.region.trim()}` : ""}`;
}

export function infrastructureName(input: { environment: string; service: string; region: string; resource: string; pattern: string; provider: "aws" | "azure" | "gcp" | "kubernetes" | "terraform" }) {
  const parts: Record<string, string> = { environment: input.environment, env: input.environment, service: input.service, region: input.region, resource: input.resource };
  let name = (input.pattern || "{environment}-{service}-{region}-{resource}").replace(/\{([^}]+)\}/g, (_, key: string) => parts[key] ?? "");
  name = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const limits = { aws: 63, azure: 63, gcp: 63, kubernetes: 63, terraform: 64 };
  const max = limits[input.provider];
  const warnings: string[] = [];
  if (!name) throw new Error("Naming pattern produced an empty name.");
  if (name.length > max) { warnings.push(`${input.provider} target is limited here to ${max} characters; output was truncated.`); name = name.slice(0, max).replace(/-$/, ""); }
  if (/^\d/.test(name) && ["gcp", "terraform"].includes(input.provider)) warnings.push(`${input.provider} names/identifiers commonly cannot begin with a digit.`);
  return { name, warnings };
}