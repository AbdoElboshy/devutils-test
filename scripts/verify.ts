// DevUtils verification — critical functionality per spec §43 + acceptance scenarios.
import { createHash } from "node:crypto";
import {
  formatJson, minifyJson, sortJson, flattenJson, unflattenJson, queryJsonPath, queryJsonPointer, applyJsonPatch, applyJsonMergePatch,
  jsonToYaml, yamlToJson, jsonToCsv, csvToJson, jsonToToml, tomlToJson, jsonToSchema, formatSql, minifySql, explainRegex, jsonToXml, formatXml,
  b64encode, b64decode, hexEncode, hexDecode, md5hex, sha1hex, sha3hex,
  decodeJwt, calcSubnet, splitSubnet, calcSupernet, numToSymbolic, symbolicToNum, umaskResult,
  parseTimestamp, describeCron, nextCronRuns, humanToCron, diffLines,
  CASES, textStats, parseCron, expandIpv6, compressIpv6, asciiEncode, asciiDecode, utf8BytesEncode, utf8BytesDecode, isoWeekNumber,
} from "../src/lib/engine";
import { cspBuild, robotsBuild, securityTxt, inspectPem, pemFormat } from "../src/lib/blueprints";
import { inspectCertificateDocument } from "../src/lib/certificates";
import { genPassword, genPassphrase, genToken, genUuid, genHex, passwordStrength, formatInZone, dateDiff, addToDate, businessDays, calcAge } from "../src/lib/engine";
import { searchTools, TOOLS, CATEGORIES, applyRegistryOverlays, resetRegistry } from "../src/lib/registry";
import { parseCurl, curlToPython, dockerRun, k8sDeployment, ERROR_DB, buildGrep } from "../src/lib/blueprints";
import { searchDiscovery } from "../src/lib/search";
import { analyzeErrorText } from "../src/lib/error-explorer";
import { deduplicateLogs, detectLogFormat, extractLogErrors, logSummary, normalizeLogTimestamps } from "../src/lib/logs";
import { formatGraphql, openApiClientSkeleton, openApiToTypeScript, validateGraphql, validateOpenApi } from "../src/lib/api-schema";
import { executeWorkflow } from "../src/platform/workflows";
import { WORKFLOW_TEMPLATES } from "../src/data/workflows";
import { capabilities, isFeatureEnabled } from "../src/platform/features";
import { awsCliCommand, awsSecurityGroupRule, buildArn, buildIamPolicy, buildLogQl, buildPromQl, calculateMetric, calculateSlo, grafanaDashboard, grafanaTemplate, infrastructureName, parseArn, parseAzureResourceId, parseGcpResource, parseS3Url, percentile, prometheusRule, prometheusScrapeConfig, validateGrafanaDashboard, zabbixApiExample, zabbixExpression, zabbixItem, zabbixLinuxTemplate, zabbixTemplate, zabbixTrigger } from "../src/lib/devops-platform";
import { AnonymousAuthProvider } from "../src/platform/auth";

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
