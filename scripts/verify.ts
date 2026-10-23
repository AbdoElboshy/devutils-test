// DevUtils verification — critical functionality per spec §43 + acceptance scenarios.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  formatJson, minifyJson, sortJson, flattenJson, unflattenJson, queryJsonPath, queryJsonPointer, applyJsonPatch, applyJsonMergePatch,
  jsonToYaml, yamlToJson, jsonToCsv, csvToJson, jsonToToml, tomlToJson, jsonToSchema, formatSql, minifySql, genSqlSampleData, explainRegex, jsonToXml, formatXml,
  b64encode, b64decode, hexEncode, hexDecode, md5hex, sha1hex, sha3hex,
  decodeJwt, calcSubnet, splitSubnet, calcSupernet, numToSymbolic, symbolicToNum, umaskResult,
  parseTimestamp, describeCron, nextCronRuns, humanToCron, diffLines,
  CASES, textStats, parseCron, expandIpv6, compressIpv6, asciiEncode, asciiDecode, utf8BytesEncode, utf8BytesDecode, isoWeekNumber,
} from "../src/lib/engine";
import { cspBuild, robotsBuild, securityTxt, inspectPem, pemFormat } from "../src/lib/blueprints";
import { inspectCertificateDocument } from "../src/lib/certificates";
import { genPassword, genPassphrase, genToken, genUuid, genHex, passwordStrength, formatInZone, dateDiff, addToDate, businessDays, calcAge } from "../src/lib/engine";
import { searchTools, TOOLS, CATEGORIES, applyRegistryOverlays, resetRegistry } from "../src/lib/registry";
import { parseCurl, curlToPython, curlToJs, curlToGo, curlToPhp, buildCurl, effectiveHeaders, dockerRun, k8sDeployment, ERROR_DB, buildGrep } from "../src/lib/blueprints";
import { searchDiscovery, suggestFallback } from "../src/lib/search";
import { analyzeErrorText } from "../src/lib/error-explorer";
import { deduplicateLogs, detectLogFormat, extractLogErrors, logSummary, normalizeLogTimestamps } from "../src/lib/logs";
import { formatGraphql, openApiClientSkeleton, openApiToTypeScript, validateGraphql, validateOpenApi } from "../src/lib/api-schema";
import { executeWorkflow } from "../src/platform/workflows";
import { WORKFLOW_TEMPLATES } from "../src/data/workflows";
import { capabilities, isFeatureEnabled } from "../src/platform/features";
import { awsCliCommand, awsSecurityGroupRule, buildArn, buildIamPolicy, buildLogQl, buildPromQl, calculateMetric, calculateSlo, grafanaDashboard, grafanaTemplate, infrastructureName, parseArn, parseAzureResourceId, parseGcpResource, parseS3Url, percentile, prometheusRule, prometheusScrapeConfig, validateGrafanaDashboard, zabbixApiExample, zabbixExpression, zabbixItem, zabbixLinuxTemplate, zabbixTemplate, zabbixTrigger } from "../src/lib/devops-platform";
import { AnonymousAuthProvider } from "../src/platform/auth";
import { AdaptivePinnedToolsRepository } from "../src/platform/adaptive-repositories";
import { localPinnedTools, localCollections, localPresets } from "../src/platform/local-repositories";
import { parsePresetExport } from "../src/lib/preset-io";
import type { AuthProvider, PinnedToolsRepository } from "../src/platform/contracts";
import { classifyRoute } from "../src/lib/routes";

let pass = 0, fail = 0;
function eq(name: string, a: unknown, b: unknown) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) { pass++; /* console.log(`ok  ${name}`); */ }
  else { fail++; console.log(`FAIL ${name}\n  got:    ${x}\n  expect: ${y}`); }
}
function throws(name: string, fn: () => void) {
  try { fn(); fail++; console.log(`FAIL ${name} — did not throw`); }
  catch { pass++; }
}

// --- JSON ---
eq("json format", formatJson('{"b":2,"a":1}'), '{\n  "a": 1,\n  "b": 2\n}'.replace('"a": 1,\n  "b": 2', '"b": 2,\n  "a": 1'));
eq("json minify", minifyJson('{ "a" : [1, 2] }'), '{"a":[1,2]}');
eq("json sort", JSON.parse(sortJson('{"b":1,"a":2}')).a, 2);
eq("json flatten", flattenJson('{"a":{"b":[1,2]}}'), { "a.b.0": 1, "a.b.1": 2 });
eq("json unflatten", unflattenJson({ "a.b.0": 1, "a.b.1": 2 }), { a: { b: [1, 2] } });
eq("jsonpath", queryJsonPath('{"a":{"b":[10,20]}}', "$.a.b[1]"), 20);
eq("json pointer", queryJsonPointer('{"a/b":{"~key":42}}', "/a~1b/~0key"), 42);
// RFC 6902 replace = remove + add, so key order legitimately changes; compare semantically.
{
  const patched = JSON.parse(applyJsonPatch('{"a":1,"items":["a"]}', '[{"op":"replace","path":"/a","value":2},{"op":"add","path":"/items/-","value":"b"}]')) as Record<string, unknown>;
  eq("json patch", { a: patched.a, items: patched.items }, { a: 2, items: ["a", "b"] });
}
eq("json merge patch", JSON.parse(applyJsonMergePatch('{"a":1,"b":{"x":1,"y":2}}', '{"a":null,"b":{"y":3}}')), { b: { x: 1, y: 3 } });
throws("json invalid", () => formatJson("{bad}"));
eq("json->yaml", jsonToYaml('{"a":1,"b":[1,2]}'), "a: 1\nb:\n  - 1\n  - 2");
eq("yaml roundtrip", JSON.parse(yamlToJson(jsonToYaml('{"a":1,"s":"x","n":null,"arr":[1,"two",true]}'))), { a: 1, s: "x", n: null, arr: [1, "two", true] });
eq("json->csv", jsonToCsv('[{"a":1,"b":"x"},{"a":2,"b":"y"}]'), "a,b\n1,x\n2,y");
eq("csv->json", JSON.parse(csvToJson('a,b\n1,x\n2,y')), [{ a: 1, b: "x" }, { a: 2, b: "y" }]);
{
  const rt = JSON.parse(tomlToJson(jsonToToml('{"title":"t","owner":{"name":"n","n":1},"ports":[80,443]}')));
  eq("json->toml->json", [rt.title, rt.owner.name, rt.owner.n, rt.ports], ["t", "n", 1, [80, 443]]);
}
eq("json schema", JSON.parse(jsonToSchema('{"a":1}')).type, "object");

// --- encoding ---
eq("b64", b64decode(b64encode("Hello, 世界!")), "Hello, 世界!");
eq("b64 known", b64encode("Hello"), "SGVsbG8=");
throws("b64 invalid", () => b64decode("!!!"));
eq("hex", hexDecode(hexEncode("Hello")), "Hello");
throws("hex invalid", () => hexDecode("zz"));
eq("ascii", asciiDecode(asciiEncode("DevUtils")), "DevUtils");
eq("utf8 bytes", utf8BytesDecode(utf8BytesEncode("Hello 世界")), "Hello 世界");

// --- hash (compare against node:crypto reference) ---
for (const s of ["", "abc", "hello devutils"]) {
  eq(`md5(${s})`, md5hex(s), createHash("md5").update(s, "utf8").digest("hex"));
  eq(`sha1(${s})`, sha1hex(s), createHash("sha1").update(s, "utf8").digest("hex"));
  eq(`sha3-256(${s})`, sha3hex(s, 256), createHash("sha3-256").update(s, "utf8").digest("hex"));
  eq(`sha3-512(${s})`, sha3hex(s, 512), createHash("sha3-512").update(s, "utf8").digest("hex"));
}

// --- JWT ---
const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJleHAiOjIwMDAwMDAwMDB9.signature";
const dj = decodeJwt(jwt);
eq("jwt sub", dj.payload.sub, "123");
eq("jwt not expired", dj.expired, false);
throws("jwt malformed", () => decodeJwt("only.two"));

// --- subnet ---
const s24 = calcSubnet("192.168.1.0/24");
eq("subnet network", s24.network, "192.168.1.0");
eq("subnet broadcast", s24.broadcast, "192.168.1.255");
eq("subnet first", s24.first, "192.168.1.1");
eq("subnet last", s24.last, "192.168.1.254");
eq("subnet hosts", s24.hosts, 254);
eq("subnet mask", s24.mask, "255.255.255.0");
eq("subnet /32", calcSubnet("10.0.0.5/32").hosts, 1);
eq("subnet /8 hosts", calcSubnet("10.0.0.0/8").hosts, 16777214);
eq("subnet /16 broadcast", calcSubnet("172.16.0.0/16").broadcast, "172.16.255.255");
throws("subnet invalid", () => calcSubnet("999.1.1.0/24"));
eq("split /24->/26", splitSubnet("192.168.1.0/24", 26), ["192.168.1.0/26", "192.168.1.64/26", "192.168.1.128/26", "192.168.1.192/26"]);
eq("supernet two /24", calcSupernet(["192.168.0.0/24", "192.168.1.0/24"]).cidr, "192.168.0.0/23");
eq("ipv6 expand", expandIpv6("2001:db8::1"), "2001:0db8:0000:0000:0000:0000:0000:0001");
eq("ipv6 compress", compressIpv6("2001:0db8:0000:0000:0000:0000:0000:0001"), "2001:db8::1");

// --- chmod ---
eq("chmod 755", numToSymbolic("755"), "rwxr-xr-x");
eq("chmod 644", numToSymbolic("644"), "rw-r--r--");
eq("chmod 700", numToSymbolic("700"), "rwx------");
eq("sym->num", symbolicToNum("rwxr-xr-x"), "755");
eq("umask 022", umaskResult("022"), { file: "644", dir: "755" });
throws("chmod invalid", () => numToSymbolic("999"));

// --- timestamp ---
eq("ts epoch 0", parseTimestamp("0").iso, "1970-01-01T00:00:00.000Z");
eq("ts known", parseTimestamp("1704067200").iso, "2024-01-01T00:00:00.000Z");
eq("ts ms unit", parseTimestamp("1717785600123").unit, "milliseconds");
throws("ts invalid", () => parseTimestamp("not a date"));
eq("iso week", isoWeekNumber("2026-01-01"), { year: 2026, week: 1 });

// --- cron ---
eq("cron desc", describeCron("*/15 * * * *").startsWith("Runs every 15 minutes"), true);
eq("cron runs count", nextCronRuns("0 9 * * 1-5", 3).length, 3);
eq("human cron", humanToCron("every 15 minutes"), "*/15 * * * *");
throws("cron invalid", () => parseCron("*/x * * * *"));

// --- text ---
eq("snake", CASES.find((c) => c.id === "snake")!.fn("Hello World Test"), "hello_world_test");
eq("camel", CASES.find((c) => c.id === "camel")!.fn("hello world"), "helloWorld");
eq("word count", textStats("hello world\nfoo").words, 3);

// --- diff ---
const d = diffLines("a\nb\nc", "a\nB\nc");
eq("diff del", d.filter((o) => o.type === "del").map((o) => o.text), ["b"]);
eq("diff add", d.filter((o) => o.type === "add").map((o) => o.text), ["B"]);
eq("diff identical", diffLines("x", "x").every((o) => o.type === "same"), true);

// --- search intent (acceptance scenarios) ---
eq("search 755", searchTools("755")[0].tool.id, "chmod");
eq("search curl python", searchTools("curl to python")[0].tool.id, "curl");
eq("search every 15 min", searchTools("every 15 minutes")[0].tool.id, "cron");
eq("search decode jwt", searchTools("decode jwt")[0].tool.id, "jwt");
eq("search subnet", searchTools("192.168.1.0/24")[0].tool.id, "subnet");
eq("search crashloop top", searchTools("CrashLoopBackOff")[0].tool.id, "errors");
eq("search crashloop k8s nearby", searchTools("CrashLoopBackOff").slice(0, 3).some((h) => h.tool.id === "kubernetes"), true);
eq("search format json", searchTools("format json")[0].tool.id, "json");
eq("discovery oom", searchDiscovery("oom")[0].kind, "error");
eq("discovery workflow", searchDiscovery("json yaml workflow").some((hit) => hit.kind === "workflow"), true);
eq("discovery category", searchDiscovery("networking").some((hit) => hit.kind === "category"), true);

// --- devops ---
const curl = parseCurl('curl -X POST https://api.example.com/users -H "Content-Type: application/json" --data-raw \'{"a":1}\'');
eq("curl parse", [curl.method, curl.url, curl.body], ["POST", "https://api.example.com/users", '{"a":1}']);
eq("curl py has requests", curlToPython(curl).includes("requests.post"), true);
eq("docker run", dockerRun({ image: "nginx:alpine", name: "web", detach: true, rm: false, interactive: false, tty: false, ports: [{ host: "8080", container: "80", proto: "tcp" }], volumes: [], env: [], network: "", restart: "unless-stopped", extra: "" }),
  "docker run -d --name web --restart unless-stopped -p 8080:80 nginx:alpine");
eq("k8s deploy has apps/v1", k8sDeployment({ name: "api", namespace: "default", labels: "", image: "nginx", replicas: 2, port: 80, cpu: "", memory: "", env: "" }).includes("kind: Deployment"), true);
eq("grep build", buildGrep({ pattern: "TODO", path: ".", recursive: true, ignoreCase: false, lineNumbers: true, invert: false, count: false, fixed: false }), "grep -r -n TODO .");
eq("error db has crashloop", ERROR_DB.some((e) => e.title === "CrashLoopBackOff"), true);

// --- logs / error explorer ---
const logs = '{"timestamp":"2026-01-01T00:00:00Z","level":"info","message":"ready"}\n2026-01-01T00:00:02Z stderr F ERROR ECONNREFUSED db:5432\n2026-01-01T00:00:02Z stderr F ERROR ECONNREFUSED db:5432';
eq("log format detection", detectLogFormat(logs), "docker-kubernetes");
eq("log summary errors", logSummary(logs).levels.error, 2);
eq("log dedupe", deduplicateLogs(logs).removed, 1);
eq("log error extraction", extractLogErrors(logs).includes("ECONNREFUSED"), true);
eq("log timestamp normalize", normalizeLogTimestamps(logs).startsWith("2026-01-01T00:00:00.000Z"), true);
eq("error explorer", analyzeErrorText("Error: listen EADDRINUSE: address already in use :::8080").matches[0].doc.id, "eaddrinuse");
eq("kubectl facts", analyzeErrorText("Name: api-1\nNamespace: default\nStatus: Waiting\nReason: CrashLoopBackOff\nRestart Count: 12").facts["Restart Count"], "12");

// --- API schemas ---
const openapi = JSON.stringify({ openapi: "3.1.0", info: { title: "Test", version: "1" }, paths: { "/users": { get: { operationId: "listUsers", responses: { "200": { description: "OK" } } } } }, components: { schemas: { User: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } } });
eq("openapi valid", validateOpenApi(openapi), []);
eq("openapi types", openApiToTypeScript(openapi).includes("export interface User"), true);
eq("openapi client", openApiClientSkeleton(openapi).includes("function listUsers"), true);
eq("graphql valid", validateGraphql("query Me { me { id } }").filter((issue) => issue.severity === "error"), []);
eq("graphql format", formatGraphql("query Me{me{id}}").includes("query Me {"), true);

// --- platform / workflows ---
eq("workflows flag", isFeatureEnabled("workflows"), true);
eq("anonymous basic tools", capabilities.hasFeature(null, "basic_tools"), true);
eq("anonymous no api", capabilities.hasFeature(null, "api_access"), false);
const workflowRun = await executeWorkflow(WORKFLOW_TEMPLATES[0], '{"name":"api","port":8080}');
eq("workflow step count", workflowRun.steps.length, 3);
eq("workflow yaml output", String(workflowRun.output).includes("name: api"), true);

// --- DevOps platform ---
eq("metric utilization", calculateMetric({ used: 7.2, total: 16 }).percent, 45);
eq("promql rate", buildPromQl({ metric: "http_requests_total", operation: "rate", window: "5m", labels: "job=api", groupBy: "job", without: false, quantile: 0.95 }), 'sum by (job) (rate(http_requests_total{job="api"}[5m]))');
eq("prom scrape", prometheusScrapeConfig({ jobName: "node", targets: ["localhost:9100"], interval: "15s" }).includes("localhost:9100"), true);
eq("prom alert", prometheusRule({ name: "HighErrors", expression: "rate(errors_total[5m]) > 1", duration: "5m", severity: "warning", summary: "errors", recording: false }).includes("alert: HighErrors"), true);
const dashboard = grafanaDashboard({ title: "Test", refresh: "30s", from: "now-1h", variables: ["instance"], tags: ["test"], panels: [{ title: "CPU", type: "timeseries", query: "up", legend: "{{instance}}", unit: "percent", warning: 70, critical: 90 }] });
eq("grafana dashboard valid", validateGrafanaDashboard(JSON.stringify(dashboard)), []);
eq("grafana template real", (grafanaTemplate("kubernetes").panels as unknown[]).length > 0, true);
eq("zabbix item", zabbixItem({ name: "CPU", key: "system.cpu.util", type: "ZABBIX_PASSIVE", interval: "1m", valueType: "FLOAT", units: "%", history: "7d", trends: "365d", tags: "component=cpu" }).key, "system.cpu.util");
const zExpression = zabbixExpression("cpu", { host: "Template Linux", threshold: 80, duration: "5m" });
eq("zabbix expression", zExpression, "avg(/Template Linux/system.cpu.util,5m)>80");
eq("zabbix trigger", zabbixTrigger({ name: "CPU", expression: zExpression, severity: "HIGH", recovery: "", tags: "" }).priority, "HIGH");
eq("zabbix template", Boolean(zabbixTemplate({ name: "Linux", group: "Templates", items: [{ name: "CPU", key: "system.cpu.util", type: "ZABBIX_PASSIVE", interval: "1m", valueType: "FLOAT", units: "%", history: "7d", trends: "365d", tags: "" }], triggers: [], macros: "CPU.WARN=80" }).zabbix_export), true);
eq("zabbix linux library", zabbixLinuxTemplate().zabbix_export.templates[0].items.length, 4);
eq("zabbix API no literal secret", zabbixApiExample({ url: "https://zabbix.example.com", method: "problem.get", params: "{}", language: "curl" }).includes("$ZABBIX_API_TOKEN"), true);
eq("logql", buildLogQl({ labels: "job=nginx", filter: "error", filterType: "contains", parser: "json", parserExpression: "", range: "5m", aggregation: "count_over_time" }), 'count_over_time({job="nginx"} |= "error" | json[5m])');
eq("slo budget", Math.round(calculateSlo({ target: 99.9, days: 30 }).budgetSeconds), 2592);
eq("p95", percentile([10, 20, 30, 40, 50], 95), 48);
eq("arn", parseArn("arn:aws:iam::123456789012:role/prod-api").service, "iam");
eq("iam broad warning", buildIamPolicy({ effect: "Allow", actions: ["*"], resources: ["*"] }).warnings.length, 1);
eq("infra name", infrastructureName({ provider: "aws", environment: "prod", service: "api", region: "eu-west-1", resource: "app", pattern: "{environment}-{service}-{region}-{resource}" }).name, "prod-api-eu-west-1-app");
eq("arn builder", buildArn({ partition: "aws", service: "iam", region: "", account: "123456789012", resource: "role/api" }), "arn:aws:iam::123456789012:role/api");
eq("aws cli", awsCliCommand({ service: "s3", operation: "ls s3://bucket", region: "us-east-1", profile: "" }), "aws s3 ls s3://bucket --region us-east-1");
eq("security group warning", awsSecurityGroupRule({ direction: "ingress", protocol: "tcp", fromPort: 22, toPort: 22, cidr: "0.0.0.0/0", description: "SSH" }).warnings.length, 1);
eq("s3 parse", parseS3Url("s3://example-bucket/path/file.txt").key, "path/file.txt");
eq("azure resource parse", parseAzureResourceId("/subscriptions/s/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm1").resourceName, "vm1");
eq("gcp resource parse", parseGcpResource("//compute.googleapis.com/projects/p/zones/us-central1-a/instances/vm1").project, "p");

// --- authentication contract ---
const anonymousAuth = new AnonymousAuthProvider();
eq("anonymous auth disabled", anonymousAuth.enabled, false);
eq("anonymous user", await anonymousAuth.getUser(), null);

// --- registry / direct routing ---
eq("tool routes unique", new Set(TOOLS.map((tool) => tool.route)).size, TOOLS.length);
eq("grafana search coverage", searchTools("grafana", 30).filter((hit) => hit.tool.name.startsWith("Grafana")).length >= 7, true);
eq("zabbix search coverage", searchTools("zabbix", 30).filter((hit) => hit.tool.name.startsWith("Zabbix")).length >= 8, true);
eq("promql search", searchTools("promql", 20).some((hit) => hit.tool.id === "prometheus"), true);
eq("standalone Grafana route", TOOLS.find((tool) => tool.id === "grafana-promql-helper")?.route, "/tools/grafana-promql-helper");
eq("cloud category tools", TOOLS.filter((tool) => tool.category === "cloud").length >= 20, true);
eq("AWS search", searchTools("aws arn", 20).some((hit) => hit.tool.id === "aws-arn-parser"), true);

// --- Tools Management: runtime registry overlays ---
{
  const baseCount = TOOLS.length;
  const jsonTool = TOOLS.find((t) => t.id === "json")!;
  applyRegistryOverlays([{ id: "json", name: "JSON Workbench", order: 0, visibility: "published", featured: true }, { id: "regex", order: 9 }], []);
  eq("overlay renames tool", TOOLS.find((t) => t.id === "json")?.name, "JSON Workbench");
  eq("overlay order controls relative position", TOOLS.findIndex((t) => t.id === "json") < TOOLS.findIndex((t) => t.id === "regex"), true);
  eq("overlay preserves implementation fields", TOOLS.find((t) => t.id === "json")?.clientSide, jsonTool.clientSide);
  eq("overlay keeps tool count", TOOLS.length, baseCount);

  applyRegistryOverlays([{ id: "json", visibility: "draft" }], []);
  eq("draft hidden from public registry", TOOLS.some((t) => t.id === "json"), false);
  eq("draft does not change count of others", TOOLS.length, baseCount - 1);

  applyRegistryOverlays([{ id: "json", slug: "json-toolkit-v2" }], []);
  eq("slug overlay rewrites route", TOOLS.find((t) => t.id === "json")?.route, "/tools/json-toolkit-v2");

  applyRegistryOverlays([{ id: "ghost-tool", name: "Ghost", visibility: "published" }], []);
  eq("unknown overlay id cannot invent a tool", TOOLS.some((t) => t.id === "ghost-tool"), false);

  const devopsCount = CATEGORIES.filter((c) => c.id === "devops").length;
  applyRegistryOverlays([], [{ id: "devops", name: "DevOps & Cloud", order: 0 }, { id: "development", order: 5 }]);
  eq("category overlay renames", CATEGORIES.find((c) => c.id === "devops")?.name, "DevOps & Cloud");
  eq("category overlay order controls position", CATEGORIES.findIndex((c) => c.id === "devops") < CATEGORIES.findIndex((c) => c.id === "development"), true);
  eq("category count preserved", CATEGORIES.filter((c) => c.id === "devops").length, devopsCount);

  resetRegistry();
  eq("registry reset restores base name", TOOLS.find((t) => t.id === "json")?.name, jsonTool.name);
  eq("registry reset restores base route", TOOLS.find((t) => t.id === "json")?.route, jsonTool.route);
  eq("registry reset restores all tools", TOOLS.length, baseCount);
  eq("registry reset restores category order", CATEGORIES.some((c) => c.id === "devops"), true);
}



// --- G1 (v2): dispatch coverage - every registry tool id must map to a component ---
{
  const DISPATCH_SWITCH = new Set([
    "json", "regex", "code-format", "code-minify", "diff", "generators", "jsonschema", "errors", "logs", "api-schema",
    "cloud", "infrastructure", "docker", "kubernetes", "terraform", "git", "cicd", "env", "cron",
    "chmod", "linux-cmd", "ssh", "systemd", "subnet", "ip", "dns", "http", "curl", "ports",
    "jwt", "hash", "secrets", "websec", "cert", "encode", "qr", "converter", "sql",
    "text", "timestamp", "timezone", "datecalc",
    "php-serialize", "html-to-jsx", "color", "markdown", "ulid", "base-convert",
  ]);
  const hasComponent = (id: string): boolean => {
    if (id.startsWith("aws-") || id.startsWith("azure-") || id.startsWith("gcp-") || id.startsWith("gcloud-") || id === "cloud-cidr-planner" || id === "cloud-cli-converter") return true;
    if (id === "grafana" || id.startsWith("grafana-")) return true;
    if (id === "zabbix" || id.startsWith("zabbix-")) return true;
    if (id === "prometheus" || id === "promql-formatter" || id.startsWith("prometheus-")) return true;
    if (id === "loki" || id.startsWith("logql-") || id.startsWith("loki-label")) return true;
    if (["monitoring", "resource-utilization-calculator", "availability-calculator", "observability", "error-budget-calculator", "percentile-helper"].includes(id)) return true;
    if (["json-log-formatter", "log-cleaner", "log-level-extractor", "log-timestamp-normalizer", "stack-trace-formatter", "log-diff", "docker-log-formatter", "kubernetes-log-cleaner", "nginx-log-parser", "apache-log-parser", "syslog-parser"].includes(id)) return true;
    return DISPATCH_SWITCH.has(id);
  };
  const unmapped = TOOLS.map((tool) => tool.id).filter((id) => !hasComponent(id));
  eq("G1: every registry tool id maps to a component (v2)", unmapped.length, 0);
  if (unmapped.length) console.log("  unmapped ids:", unmapped.join(", "));
  console.log(`G1 info: registry tool count = ${TOOLS.length}`);
  eq("G1: registry size within audit baseline (>=100)", TOOLS.length >= 100, true);
}

// --- G2: cURL converters header dedup (phase7 batch2) ---
{
  const r = parseCurl('curl -X POST https://api.example.com/users -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN" --data-raw \'{"name":"maya"}\'');
  eq("curl php content-type once", curlToPhp(r).split("Content-Type").length - 1, 1);
  eq("curl python content-type once", curlToPython(r).split("Content-Type").length - 1, 1);
  eq("curl js content-type once", curlToJs(r).split("Content-Type").length - 1, 1);
  eq("curl go content-type once", curlToGo(r).split("Content-Type").length - 1, 1);
  eq("curl build content-type once", buildCurl(r).split("Content-Type").length - 1, 1);
  eq("curl php auth once", curlToPhp(r).split("Authorization").length - 1, 1);
  const r2 = parseCurl('curl https://example.com --json \'{"a":1}\'');
  eq("curl go keeps content-type from --json", curlToGo(r2).includes("Content-Type"), true);
  eq("curl php keeps content-type from --json", curlToPhp(r2).split("Content-Type").length - 1, 1);
  const eh = effectiveHeaders({ method: "POST", url: "https://x.dev", headers: [{ k: "content-type", v: "text/plain" }], auth: "", body: "", contentType: "text/plain" });
  eq("effectiveHeaders dedupes case-insensitively", eh.length, 1);
}

// --- G2: SQL sample data generator (phase7) ---
{
  const ddl = 'CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  name TEXT NOT NULL,\n  email TEXT NOT NULL UNIQUE,\n  is_admin BOOLEAN DEFAULT false,\n  balance NUMERIC(10,2),\n  bio TEXT,\n  created_at TIMESTAMPTZ DEFAULT now()\n);';
  const out = genSqlSampleData(ddl, "PostgreSQL", 12, "seed-a");
  const lines = out.split("\n").filter((l) => l.trim().startsWith("("));
  eq("sql sample row count", lines.length, 12);
  eq("sql sample header", out.startsWith('INSERT INTO users (id, name, email, is_admin, balance, bio, created_at) VALUES'), true);
  eq("sql sample unique emails", new Set(out.match(/[\w.]+@example\.com/g) ?? []).size, 12);
  eq("sql sample sequential ids", lines[0].trim().startsWith("(1, ") && lines[11].trim().startsWith("(12, "), true);
  eq("sql sample deterministic", genSqlSampleData(ddl, "PostgreSQL", 12, "seed-a") === out, true);
  eq("sql sample seed changes data", genSqlSampleData(ddl, "PostgreSQL", 12, "seed-b") !== out, true);
  const mssql = genSqlSampleData(ddl, "SQL Server", 8, "seed-a");
  eq("sql sample mssql booleans", /true|false/.test(mssql) === false, true);
  eq("sql sample not-null respected", lines.every((l) => /^\(\d+, '[^']+', '[^']+@example\.com', (true|false|NULL),/.test(l.trim())), true);
  const ddl2 = "CREATE TABLE orders (org_id INT NOT NULL, order_id INT NOT NULL, status TEXT, amount DECIMAL(8,2), PRIMARY KEY (org_id, order_id));";
  const out2 = genSqlSampleData(ddl2, "MySQL", 3, "seed-a");
  eq("sql sample skips table constraints", out2.startsWith("INSERT INTO orders (org_id, order_id, status, amount) VALUES"), true);
  let threw = false;
  try { genSqlSampleData("   ", "PostgreSQL", 5, "x"); } catch { threw = true; }
  eq("sql sample empty input throws", threw, true);
}

// --- G2: SQL format / minify ---
{
  const f = formatSql("select id from users where active = true");
  eq("sql format starts with SELECT", f.startsWith("SELECT"), true);
  eq("sql format majors on own lines", f.includes("\nFROM users") && f.includes("\nWHERE active = true"), true);
  eq("sql format appends semicolon", f.trim().endsWith(";"), true);
  eq("sql format preserves literal spacing", formatSql("select 'hello  world' as greeting").includes("'hello  world'"), true);
  throws("sql format rejects empty", () => formatSql("   "));
  eq("sql minify collapses whitespace", /\s{2,}/.test(minifySql("select    id\n  from     users")), false);
  eq("sql minify preserves literals", minifySql("select * from t where name = 'a  b'").includes("'a  b'"), true);
  eq("sql minify strips comments", minifySql("select 1 -- note").includes("--"), false);
}

// --- G2: secrets generators + strength ---
{
  const pw = genPassword(20);
  eq("password length respected", pw.length, 20);
  eq("password digits-only charset", /^[0-9]+$/.test(genPassword(12, { upper: false, lower: false, digits: true, symbols: false })), true);
  throws("password with no charsets rejected", () => genPassword(12, { upper: false, lower: false, digits: false, symbols: false }));
  eq("passphrase word count", genPassphrase(4).split("-").length, 4);
  const hex = genHex(32);
  eq("hex secret length", hex.length, 64);
  eq("hex secret charset", /^[0-9a-f]{64}$/.test(hex), true);
  eq("uuid shape", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(genUuid()), true);
  eq("token is base64url", /^[A-Za-z0-9_-]+$/.test(genToken(32)), true);
  const strong = passwordStrength(genPassword(24, { upper: true, lower: true, digits: true, symbols: true }));
  eq("strong password entropy >= 80 bits", strong.entropy >= 80, true);
  eq("weak password scores low", passwordStrength("1234").score, 1);
  eq("empty password scores low", passwordStrength("").score, 1);
}

// --- G2: CSP / robots / security.txt ---
{
  const csp = cspBuild({ defaultSrc: "'self'", script: "'self'", style: "'self'", img: "'self' data:", connect: "'self'", frame: "'none'", extra: "base-uri 'self'" });
  eq("csp contains default-src", csp.includes("default-src 'self'"), true);
  eq("csp ends with semicolon", csp.trim().endsWith(";"), true);
  const robots = robotsBuild({ allow: "/\n/public", disallow: "/admin\n*.json", sitemap: "https://example.com/sitemap.xml" });
  eq("robots user-agent first", robots.startsWith("User-agent: *"), true);
  eq("robots disallow lines", robots.split("\n").filter((l) => l.startsWith("Disallow:")).length, 2);
  eq("robots sitemap included", robots.includes("Sitemap: https://example.com/sitemap.xml"), true);
  const sectxt = securityTxt({ contact: "mailto:sec@example.com", expires: "2030-01-01T00:00:00.000Z", policy: "" });
  eq("security.txt contact", sectxt.startsWith("Contact: mailto:sec@example.com"), true);
  eq("security.txt expires", sectxt.includes("Expires: 2030-01-01"), true);
}

// --- G2: real openssl-generated certificate fixture (v4) ---
// Generated with: openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 -subj /CN=DevUtils Test
{
  const PEM = [
  "-----BEGIN CERTIFICATE-----",
  "MIIDETCCAfmgAwIBAgIUC7QqspcxI9Cm9I+DeHW8wuy/lyQwDQYJKoZIhvcNAQEL",
  "BQAwGDEWMBQGA1UEAwwNRGV2VXRpbHMgVGVzdDAeFw0yNjEwMjEyMDIzMzhaFw0z",
  "NjEwMTgyMDIzMzhaMBgxFjAUBgNVBAMMDURldlV0aWxzIFRlc3QwggEiMA0GCSqG",
  "SIb3DQEBAQUAA4IBDwAwggEKAoIBAQCrNDcFMkODlQ6qMJ4Fj+Sa/5MD6PMhLqyF",
  "9Q44+ZQKjk6x1FhObm8d2Rc7OxpxyVMyHS5mTJPlxctBr/K2u+5sOWemyyW1djPo",
  "xXJt28KHFya1FA/73wRAyByJKY+PwnGh4IKTV0hj03ewGPVaGOLeE2CVjMBcqGpw",
  "DMZbApRZt3S3z9ltsTCM8jmSr6ClqGKHaQCbbNzXi91ghFAbsjtR4gdiqzSdX4DD",
  "lc/ePI5rUQBPOhWEDHhxZ9ri0TAqzjImTJQDC4ee9cj/SRBpzwsQnWY4hCF44NPl",
  "XVX6jPzFJVDcfqiCOjPPnVWIFN3yKPvI5JbTF6mvag5xK7edaVl1AgMBAAGjUzBR",
  "MB0GA1UdDgQWBBR9unulqbTkXyUQlBRO4rCkNmKcrjAfBgNVHSMEGDAWgBR9unul",
  "qbTkXyUQlBRO4rCkNmKcrjAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUA",
  "A4IBAQChiLGxLVKxR3NnNIAcpEFDwTifw5+28mmBV1RsIK2J9r8DGN3PV8i9/9eV",
  "NDoYAAQ0PNqc8jx8SrM36t24KTVCZ3hVANTRbaaXYAjlCg6bceh3yWK6G7FEmwBj",
  "DBdCZoeQ0jTmHYVYCKvkJI+ZleDNpwgPuKUE2nopAiyofbEjEo7rW7xYfgruiaPK",
  "PSYazv49vGIuSP8uo9bVQspOJIVnkGTdVsYrvOJUZw/LSo9wG4SWn4Y18lnW3vK2",
  "yfNJ5npR9i8zdQELWx27b5VwRmfEL9zZASp7ZWcQBhsprCT6K5iyI92PxQG+wVS+",
  "Gmb/IOXG8pp7tQwwroRruhg+/cSH",
  "-----END CERTIFICATE-----",
  ].join("\n");
  throws("pem missing block rejected", () => inspectPem("not a pem"));
  eq("pemFormat rewraps 64 cols", pemFormat("-----BEGIN TEST-----\nYQ==\n-----END TEST-----").split("\n").length, 3);
  const basic = inspectPem(PEM);
  eq("cert fixture DER size", basic.derBytes > 400, true);
  const details = await inspectCertificateDocument(PEM);
  eq("cert subject parsed", details.subject.includes("DevUtils Test"), true);
  eq("cert issuer equals subject (self-signed)", details.issuer, details.subject);
  eq("cert signature algorithm", details.signatureAlgorithm, "SHA-256 with RSA");
  eq("cert public key algorithm", details.publicKeyAlgorithm, "RSA");
  eq("cert notAfter in future", (details.notAfter ? new Date(details.notAfter).getTime() : 0) > Date.now(), true);
  eq("cert fingerprint format", /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/.test(details.fingerprintSha256), true);
  eq("truncated pem rejected", await inspectCertificateDocument(PEM.slice(0, PEM.length - 20)).then(() => false, () => true), true);
  eq("mislabeled pem rejected", await inspectCertificateDocument(PEM.replace("CERTIFICATE", "PUBLIC KEY")).then(() => false, () => true), true);
}

// --- G2: regex explain ---
{
  const lines = explainRegex("^\\d{3}-\\d{4}$");
  eq("regex explain start anchor", lines.some((l) => l.includes("start of string")), true);
  eq("regex explain digit class", lines.some((l) => l.includes("any digit")), true);
  eq("regex explain exact-count", lines.some((l) => l.includes("exact-count")), true);
  eq("regex explain produces tokens", lines.length >= 4, true);
}

// --- G2: JSON -> XML (pure string functions; xmlToJson needs DOMParser, browser-only) ---
{
  const xml = jsonToXml('{"name":"api","port":8080}');
  eq("json->xml starts with declaration", xml.startsWith("<?xml"), true);
  eq("json->xml root element present", xml.includes("<root>"), true);
  eq("json->xml nested values", xml.includes("<name>api</name>"), true);
  eq("json->xml escapes entities", jsonToXml('{"a":"<b&c>"}').includes("&lt;"), true);
  throws("json->xml rejects invalid json", () => jsonToXml("{bad}"));
  eq("xml format indents", formatXml("<a><b>x</b></a>").includes("\n"), true);
}

// --- G2: timezone + date helpers ---
{
  eq("timezone berlin formats", formatInZone(new Date("2026-01-15T12:00:00Z"), "Europe/Berlin").length > 0, true);
  throws("timezone invalid rejected", () => formatInZone(new Date(), "Mars/Olympus"));
  const dd = dateDiff("2026-01-01", "2026-01-11");
  eq("dateDiff days", dd.days, 10);
  throws("dateDiff invalid rejected", () => dateDiff("nope", "2026-01-01"));
  eq("addToDate adds month", addToDate("2026-01-15", 1, "months").getMonth(), 1);
  eq("businessDays skips weekend", businessDays("2026-01-05", "2026-01-11"), 5);
  eq("calcAge readable", /years/.test(calcAge("1990-06-15")), true);
}


// --- P4: route classification (404 regression) ---
{
  const c = (r: string, w = true) => classifyRoute(r, w);
  eq("routes: known tool route -> tool", c(TOOLS[0]!.route).kind, "tool");
  eq("routes: home -> home", c("/").kind, "home");
  eq("routes: tools index -> tools", c("/tools").kind, "tools");
  eq("routes: workflows enabled -> workflows", c("/workflows", true).kind, "workflows");
  eq("404: workflows disabled -> not-found", c("/workflows", false).kind, "not-found");
  eq("routes: login -> auth", c("/login").kind, "auth");
  const adminC = c("/admin/nonsense");
  if (adminC.kind !== "admin") throw new Error("expected admin classification");
  eq("routes: admin invalid section falls back to overview", adminC.section, "overview");
  const accountC = c("/account/nonsense");
  if (accountC.kind !== "account") throw new Error("expected account classification");
  eq("routes: account invalid section falls back to dashboard", accountC.section, "dashboard");
  eq("routes: known category -> category", c(`/categories/${CATEGORIES[0]!.slug}`).kind, "category");
  eq("404: unknown category slug -> not-found", c("/categories/not-a-real-category").kind, "not-found");
  eq("404: bogus route -> not-found", c("/no-such-tool-xyz").kind, "not-found");
  eq("routes: about still resolves", c("/about").kind, "about");
}


// --- P4: search no-result suggestions ---
{
  eq("suggest: typo query returns suggestions", suggestFallback("jso").length > 0, true);
  eq("suggest: json typo still suggests json tools", suggestFallback("jsn").some((h) => h.title.toLowerCase().includes("json")), true);
  eq("suggest: pure gibberish returns none", suggestFallback("zzzzqqq").length, 0);
}


// --- P4: accessibility attributes (static source checks) ---
{
  const chromeSrc = readFileSync("src/components/chrome.tsx", "utf8");
  const uiSrc = readFileSync("src/components/ui.tsx", "utf8");
  eq("a11y: palette combobox + active descendant", chromeSrc.includes('role="combobox"') && chromeSrc.includes("aria-activedescendant"), true);
  eq("a11y: account menu declares popup menu", chromeSrc.includes('aria-haspopup="menu"'), true);
  eq("a11y: palette dialog semantics", chromeSrc.includes('role="dialog"') && chromeSrc.includes('aria-modal="true"'), true);
  eq("a11y: shared switch/tablist/aria-pressed", uiSrc.includes('role="switch"') && uiSrc.includes('role="tablist"') && uiSrc.includes("aria-pressed"), true);
  eq("a11y: tabs roving tabIndex", uiSrc.includes("tabIndex={active === t.id ? 0 : -1}"), true);
}

// --- P5: pinned tools + collections (real local repos, two-user isolation) ---
{
  // Minimal in-memory localStorage so repository logic runs in Node.
  class MemoryStorage {
    map = new Map<string, string>();
    getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
    setItem(key: string, value: string) { this.map.set(key, value); }
    removeItem(key: string) { this.map.delete(key); }
  }
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();

// --- P8 B1: presets — full-spec UI helpers + repo behavior ---
{
  eq("p8b1: anonymous preset limit is 30", capabilities.getLimit(null, "saved_presets"), 30);
  const before = (await localPresets.list()).length;
  const now = new Date().toISOString();
  const mk = (toolId: string, name: string, extra: Record<string, boolean | number | string> = {}) => ({ id: `p8-${toolId}-${name}`, toolId, name, config: { dialect: "PostgreSQL", ...extra }, createdAt: now, updatedAt: now, version: 1 as const });
  await localPresets.save(mk("sql", "prod"));
  await localPresets.save(mk("sql", "prod copy", { seed: "abc" }));
  await localPresets.save(mk("json", "quick"));
  eq("p8b1: list per tool filters", (await localPresets.list("sql")).length, 2);
  eq("p8b1: save persists name and config", (await localPresets.list("sql")).find((x) => x.name === "prod")!.config.dialect, "PostgreSQL");
  await localPresets.save({ ...mk("sql", "renamed"), id: "p8-sql-prod", name: "renamed", updatedAt: now });
  eq("p8b1: rename keeps same id", (await localPresets.list("sql")).some((x) => x.id === "p8-sql-prod" && x.name === "renamed"), true);
  const sensitive = mk("cron", "leaky", { token: "s3cr3t", expression: "*/15 * * * *" });
  await localPresets.save(sensitive);
  const storedLeaky = (await localPresets.list("cron")).find((x) => x.id === sensitive.id);
  eq("p8b1: sanitization strips sensitive keys", "token" in (storedLeaky?.config ?? {}), false);
  let parseThrew = false;
  try { parsePresetExport('{"toolId":"json","name":"x","config":{"a":1}}', "sql"); } catch { parseThrew = true; }
  eq("p8b1: import rejects wrong toolId", parseThrew, true);
  let malformedThrew = false;
  try { parsePresetExport("{not json", "sql"); } catch { malformedThrew = true; }
  eq("p8b1: import rejects malformed JSON", malformedThrew, true);
  const good = parsePresetExport('{"toolId":"sql","name":"shared","config":{"dialect":"MySQL"}}', "sql");
  eq("p8b1: import parse keeps safe config", good.config.dialect, "MySQL");
  await localPresets.remove("p8-sql-prod copy");
  eq("p8b1: delete removes only the target", (await localPresets.list("sql")).some((x) => x.id === "p8-sql-prod copy"), false);
  for (const id of ["p8-sql-prod", "p8-sql-prod copy", "p8-json-quick", "p8-cron-leaky"]) await localPresets.remove(id);
  eq("p8b1: cleanup restores count", (await localPresets.list()).length, before);
}



const pinned = localPinnedTools;
  await pinned.pin("json");
  await pinned.pin("regex");
  eq("p5: pin order preserved", (await pinned.list()).map((x) => x.toolId), ["json", "regex"]);
  eq("p5: reorder applied", (await pinned.reorder(["regex", "json"])).map((x) => x.toolId), ["regex", "json"]);
  eq("p5: unpin removes only the target", (await pinned.unpin("json")).map((x) => x.toolId), ["regex"]);

const collections = localCollections;
  const created = await collections.create({ name: "Ops", description: "Daily" });
  eq("p5: collection created", (await collections.list()).map((c) => c.name), ["Ops"]);
  let duplicateRejected = false;
  await collections.create({ name: "Ops" }).then(() => { duplicateRejected = false; }, () => { duplicateRejected = true; });
  eq("p5: duplicate collection name rejected", duplicateRejected, true);
  await collections.addItem(created.id, "tool", "json");
  eq("p5: collection item added", (await collections.items(created.id)).map((i) => i.targetId), ["json"]);
  await collections.removeItem(created.id, "json");
  eq("p5: collection item removed", (await collections.items(created.id)).length, 0);
  await collections.update(created.id, { description: "Weekly" });
  eq("p5: collection update persists", (await collections.list())[0]!.description, "Weekly");
  await collections.remove(created.id);
  eq("p5: collection removed", (await collections.list()).length, 0);

// Two-user isolation through the real adaptive layer.
  const makeAuth = () => {
    let listener: ((user: { id: string } | null) => void) | null = null;
    const auth = {
      subscribe: (fn: (user: { id: string } | null) => void) => { listener = fn; return () => { listener = null; }; },
      emit: (user: { id: string } | null) => { listener?.(user); },
    };
    return auth as unknown as AuthProvider & { emit: (user: { id: string } | null) => void };
  };
  class StubRepo {
    calls: string[] = [];
    scope: string | null | undefined;
    items: { toolId: string; sortOrder: number; createdAt: string }[] = [];
    async list() { this.calls.push("list"); return this.items.slice(); }
    async pin(id: string) { this.calls.push("pin:" + id); return this.items.slice(); }
    async unpin(id: string) { this.calls.push("unpin:" + id); return this.items.slice(); }
    async reorder(ids: string[]) { this.calls.push("reorder:" + ids.join("+")); return this.items.slice(); }
    subscribe(listener: (items: { toolId: string; sortOrder: number; createdAt: string }[]) => void) { this.calls.push("subscribe"); listener(this.items.slice()); return () => {}; }
    setUserScope(id: string | null) { this.scope = id; this.calls.push("scope:" + String(id)); }
  }

const auth = makeAuth();
  const local = new StubRepo();
  const cloud = new StubRepo();
  local.items = [{ toolId: "local-only", sortOrder: 0, createdAt: "" }];
  const repo = new AdaptivePinnedToolsRepository(
    auth,
    local as unknown as PinnedToolsRepository,
    cloud as unknown as PinnedToolsRepository & { setUserScope?: (userId: string | null) => void },
  );
  await repo.list();
  eq("p5 isolation: anonymous routes to local", local.calls.includes("list") && cloud.calls.length === 0, true);

cloud.items = [{ toolId: "a-item", sortOrder: 0, createdAt: "" }];
  auth.emit({ id: "user-a" });
  const seen: string[] = [];
  const unsubscribe = repo.subscribe((items) => { seen.push(items.map((i) => i.toolId).join(",")); });
  eq("p5 isolation: sign-in hands cloud scope user-a", cloud.scope, "user-a");
  await repo.list();
  eq("p5 isolation: signed-in routes to cloud", cloud.calls.includes("list") && local.calls.filter((c) => c === "list").length === 1, true);

auth.emit(null);
  eq("p5 isolation: sign-out rescopes cloud to null", cloud.scope, null);
  cloud.items = [{ toolId: "b-item", sortOrder: 0, createdAt: "" }];
  auth.emit({ id: "user-b" });
  eq("p5 isolation: switch sequence is A, cleared, local, cleared, B", seen.join(" | "), "a-item |  | local-only |  | b-item");
  unsubscribe();
}

// --- P5: account routes for collections + consolidated settings ---
{
  const collectionsRoute = classifyRoute("/account/collections", false);
  if (collectionsRoute.kind !== "account") throw new Error("expected account classification");
  eq("routes: collections account section classifies", collectionsRoute.section, "collections");
  eq("routes: security account URL still classifies as account", classifyRoute("/account/security", false).kind, "account");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
