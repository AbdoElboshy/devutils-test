#!/usr/bin/env python3
"""Phase 9 Batch 1: OpenTelemetry + incident tooling (gap-fill).

Audit vs the 109-tool catalog: tracing is the biggest Phase 9 gap
(stack-trace-formatter exists, but no OTel/traceparent/OTLP tooling), and
incident/postmortem tooling is entirely missing. This batch adds both as
pure client-side tools - no network, no credentials, no live infrastructure
access (Phase 9 acceptance criteria).

Changes:
1. src/lib/otel.ts (NEW, pure) - traceparent parse/build, OTLP collector
   config builder + validator, span inspector (W3C + OTLP/JSON), postmortem
   template generator.
2. src/platform/operations.ts - register 5 new operations (chained after the
   existing prometheus/grafana/loki/observability ops):
     otel.traceparent, otel.collector-config, otel.span-inspector,
     incident.postmortem, incident.timeline
3. scripts/verify.ts - +14 p9b1 tests.

Anchors (verified against master c171a3e):
- operations.ts: '  .register({ id: "zabbix.expression", title: "Build Zabbix expression",'
- verify.ts: 'import { quotaStatus, quotaLabel } from "../src/lib/quota";'
- verify.ts: '  eq("p8b4: uncapped label formatting", quotaLabel({ metric: "workflow runs", used: 900, limit: null, kind: "ok" }).includes("no cap"), true);\n}'

Idempotency: otel.ts aborts if present; operations.ts aborts on "otel.traceparent";
verify.ts aborts on "p9b1:".
"""
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent


def one(s, old, new, n=1):
    c = s.count(old)
    assert c == n, "anchor found {}x (expected {}): {!r}".format(c, n, old[:70])
    return s.replace(old, new, n)


# ---------------- 1. src/lib/otel.ts (NEW, pure) ----------------
p = root / "src/lib/otel.ts"
if p.exists():
    print("ABORT: otel.ts already exists")
    sys.exit(1)

OTEL = '''// OpenTelemetry + incident tooling - pure functions. No network, no eval.
export type TraceparentInfo = {
  version: string;
  traceId: string;
  parentId: string;
  flags: string;
};

const TRACE_ID_RE = /^[0-9a-f]{32}$/;
const SPAN_ID_RE = /^[0-9a-f]{16}$/;

/** Parse a W3C traceparent header. Throws on malformed input. */
export function parseTraceparent(raw: string): TraceparentInfo {
  const value = raw.trim().replace(/^traceparent:/i, "").trim();
  const parts = value.split("-");
  if (parts.length !== 4) throw new Error("traceparent must have 4 dash-separated fields: version-traceid-parentid-flags.");
  const [version, traceId, parentId, flags] = parts;
  if (!/^[0-9a-f]{2}$/.test(version) || version === "ff") throw new Error("Version must be 2 lowercase hex digits and not ff.");
  if (!TRACE_ID_RE.test(traceId) || traceId === "00000000000000000000000000000000") throw new Error("trace-id must be 32 lowercase hex digits and not all zeros.");
  if (!SPAN_ID_RE.test(parentId) || parentId === "0000000000000000") throw new Error("parent-id must be 16 lowercase hex digits and not all zeros.");
  if (!/^[0-9a-f]{2}$/.test(flags)) throw new Error("flags must be 2 lowercase hex digits.");
  return { version, traceId, parentId, flags };
}

/** Build a W3C traceparent header from parts. */
export function buildTraceparent(traceId: string, parentId: string, flags: string): string {
  const info = parseTraceparent(`00-${traceId}-${parentId}-${flags}`);
  return `00-${info.traceId}-${info.parentId}-${info.flags}`;
}

/** Validate one OTLP/JSON span and return a compact summary. */
export function inspectSpan(span: Record<string, unknown>): {
  valid: boolean;
  traceId: string;
  spanId: string;
  name: string;
  kind: string;
  status: string;
  durationMs: number | null;
  attributes: number;
} {
  const traceId = String(span.traceId ?? span.trace_id ?? "");
  const spanId = String(span.spanId ?? span.span_id ?? "");
  const name = String(span.name ?? "(unnamed)");
  const kind = String(span.kind ?? "SPAN_KIND_UNSPECIFIED").replace(/^SPAN_KIND_/, "").toLowerCase();
  const status = String((span.status as { code?: string } | undefined)?.code ?? "UNSET").replace(/^STATUS_CODE_/, "");
  let startTime = Number(span.startTimeUnixNano ?? span.start_time_unix_nano ?? 0);
  let endTime = Number(span.endTimeUnixNano ?? span.end_time_unix_nano ?? 0);
  if (!startTime || !endTime) {
    const startIso = String(span.startTime ?? span.start_time ?? "");
    const endIso = String(span.endTime ?? span.end_time ?? "");
    if (startIso && endIso) { startTime = Date.parse(startIso); endTime = Date.parse(endIso); }
  }
  const durationMs = startTime && endTime && endTime >= startTime ? (endTime - startTime) / 1e6 : null;
  const attributes = Array.isArray(span.attributes) ? span.attributes.length : 0;
  const valid = TRACE_ID_RE.test(traceId) && SPAN_ID_RE.test(spanId);
  return { valid, traceId, spanId, name, kind, status, durationMs, attributes };
}

export type CollectorConfigInput = {
  otlpGrpcPort: number;
  otlpHttpPort: number;
  prometheusExporter: boolean;
  prometheusPort: number;
  debugExporter: boolean;
};

/** Build an OTel Collector config (YAML string) from structured input. */
export function buildCollectorConfig(input: CollectorConfigInput): string {
  if (!Number.isInteger(input.otlpGrpcPort) || input.otlpGrpcPort < 1 || input.otlpGrpcPort > 65535) throw new Error("OTLP gRPC port must be an integer between 1 and 65535.");
  if (!Number.isInteger(input.otlpHttpPort) || input.otlpHttpPort < 1 || input.otlpHttpPort > 65535) throw new Error("OTLP HTTP port must be an integer between 1 and 65535.");
  if (input.prometheusExporter && (!Number.isInteger(input.prometheusPort) || input.prometheusPort < 1 || input.prometheusPort > 65535)) throw new Error("Prometheus port must be an integer between 1 and 65535.");
  const exporters: string[] = [];
  if (input.prometheusExporter) exporters.push("prometheus");
  if (input.debugExporter) exporters.push("debug");
  if (!exporters.length) throw new Error("Select at least one exporter.");
  return [
    "receivers:",
    "  otlp:",
    "    protocols:",
    "      grpc:",
    `        endpoint: 0.0.0.0:${input.otlpGrpcPort}`,
    "      http:",
    `        endpoint: 0.0.0.0:${input.otlpHttpPort}`,
    "",
    "processors:",
    "  batch:",
    "",
    "exporters:",
    ...(input.prometheusExporter ? [
      "  prometheus:",
      `    endpoint: 0.0.0.0:${input.prometheusPort}`,
    ] : []),
    ...(input.debugExporter ? [
      "  debug:",
      "    verbosity: basic",
    ] : []),
    "",
    "service:",
    "  pipelines:",
    "    traces:",
    "      receivers: [otlp]",
    "      processors: [batch]",
    `      exporters: [${exporters.join(", ")}]`,
  ].join("\\n") + "\\n";
}

export type PostmortemInput = {
  title: string;
  severity: "sev1" | "sev2" | "sev3";
  timeline: { time: string; event: string }[];
  impact: string;
  rootCause: string;
  resolution: string;
  actionItems: string[];
};

/** Generate a structured postmortem markdown template. */
export function buildPostmortem(input: PostmortemInput): string {
  if (!input.title.trim()) throw new Error("Title is required.");
  if (!input.timeline.length) throw new Error("Add at least one timeline entry.");
  const sev = { sev1: "SEV1 - critical", sev2: "SEV2 - major", sev3: "SEV3 - minor" }[input.severity];
  const lines = [
    `# Postmortem: ${input.title.trim()}`,
    "",
    `**Severity:** ${sev}`,
    "",
    "## Timeline",
    ...input.timeline.map((entry) => `- **${entry.time}** - ${entry.event}`),
    "",
    "## Impact",
    input.impact || "(describe customer impact)",
    "",
    "## Root cause",
    input.rootCause || "(describe the root cause)",
    "",
    "## Resolution",
    input.resolution || "(describe how the incident was resolved)",
    "",
    "## Action items",
    ...(input.actionItems.length ? input.actionItems.map((item) => `- [ ] ${item}`) : ["- [ ] (add action items)"]),
    "",
  ];
  return lines.join("\\n");
}
'''
p.write_text(OTEL, encoding="utf-8")
print("otel.ts: traceparent/OTLP/span/postmortem written")

# ---------------- 2. operations.ts (+5 ops) ----------------
p = root / "src/platform/operations.ts"
s = p.read_text(encoding="utf-8")
if "otel.traceparent" in s:
    print("ABORT: operations.ts already has otel ops")
    sys.exit(1)
assert "kubernetes.deployment" in s, "operations registry anchor missing"

s = one(
    s,
    '  .register({ id: "zabbix.expression", title: "Build Zabbix expression",',
    '''  .register({ id: "otel.traceparent", title: "Parse traceparent", description: "Validate and decode a W3C traceparent header.", clientSide: true, run: (input) => parseTraceparent(asText(input)) })
  .register({ id: "otel.collector-config", title: "Build OTel collector config", description: "Generate an OpenTelemetry Collector YAML config from structured input.", clientSide: true, run: (input) => buildCollectorConfig(asObject(input) as unknown as CollectorConfigInput) })
  .register({ id: "otel.span-inspector", title: "Inspect OTLP span", description: "Validate an OTLP/JSON span and summarize trace id, span id, duration and attributes.", clientSide: true, run: (input) => inspectSpan(asObject(input)) })
  .register({ id: "incident.postmortem", title: "Build postmortem", description: "Generate an incident postmortem document from structured input.", clientSide: true, run: (input) => buildPostmortem(asObject(input) as unknown as PostmortemInput) })
  .register({ id: "incident.timeline", title: "Build incident timeline", description: "Format a list of timestamped events into a clean incident timeline.", clientSide: true, run: (input) => { const value = asObject(input); const entries = Array.isArray(value.entries) ? value.entries : []; return buildPostmortem({ title: String(value.title ?? "Incident"), severity: "sev3", timeline: entries.map((entry) => ({ time: String((entry as Record<string, unknown>).time ?? ""), event: String((entry as Record<string, unknown>).event ?? "") })), impact: "", rootCause: "", resolution: "", actionItems: [] }); } })
  .register({ id: "zabbix.expression", title: "Build Zabbix expression",''',
    1,
)
s = one(
    s,
    'import { buildLogQl, buildPromQl, calculateSlo, grafanaPanel, zabbixExpression, zabbixTrigger, type PromQueryInput } from "../lib/devops-platform";',
    'import { buildLogQl, buildPromQl, calculateSlo, grafanaPanel, zabbixExpression, zabbixTrigger, type PromQueryInput } from "../lib/devops-platform";\nimport { buildCollectorConfig, buildPostmortem, inspectSpan, parseTraceparent, type CollectorConfigInput, type PostmortemInput } from "../lib/otel";',
    1,
)
p.write_text(s, encoding="utf-8")
print("operations.ts: +5 otel/incident operations")

# ---------------- 3. verify.ts (+14 tests) ----------------
p = root / "scripts/verify.ts"
s = p.read_text(encoding="utf-8")
if "p9b1:" in s:
    print("ABORT: verify.ts already patched")
    sys.exit(1)

s = one(
    s,
    'import { quotaStatus, quotaLabel } from "../src/lib/quota";',
    'import { quotaStatus, quotaLabel } from "../src/lib/quota";\nimport { parseTraceparent, buildTraceparent, inspectSpan, buildCollectorConfig, buildPostmortem } from "../src/lib/otel";',
    1,
)

TESTS = r'''
// --- P9 B1: OpenTelemetry + incident tooling ---
{
  const tp = parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
  eq("p9b1: traceparent parses", [tp.version, tp.traceId.length, tp.parentId.length, tp.flags], ["00", 32, 16, "01"]);
  eq("p9b1: traceparent round-trips", buildTraceparent("4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7", "01"), "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
  throws("p9b1: traceparent rejects wrong field count", () => parseTraceparent("00-abc-01"));
  throws("p9b1: traceparent rejects all-zero trace id", () => parseTraceparent("00-00000000000000000000000000000000-00f067aa0ba902b7-01"));
  throws("p9b1: traceparent rejects uppercase hex", () => parseTraceparent("00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01"));
  throws("p9b1: traceparent rejects ff version", () => parseTraceparent("ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"));

  const span = { traceId: "4bf92f3577b34da6a3ce929d0e0e4736", spanId: "00f067aa0ba902b7", name: "GET /users", kind: "SPAN_KIND_SERVER", status: { code: "STATUS_CODE_OK" }, startTimeUnixNano: 1000000000, endTimeUnixNano: 2000000000, attributes: [{ key: "http.method", value: { stringValue: "GET" } }] };
  const summary = inspectSpan(span);
  eq("p9b1: span inspector summarizes", [summary.valid, summary.name, summary.kind, summary.status, summary.durationMs, summary.attributes], [true, "GET /users", "server", "OK", 1, 1]);
  eq("p9b1: span inspector flags invalid ids", inspectSpan({ name: "x" }).valid, false);

  const config = buildCollectorConfig({ otlpGrpcPort: 4317, otlpHttpPort: 4318, prometheusExporter: true, prometheusPort: 8889, debugExporter: false });
  eq("p9b1: collector config grpc endpoint", config.includes("0.0.0.0:4317"), true);
  eq("p9b1: collector config prometheus exporter", config.includes("prometheus"), true);
  throws("p9b1: collector config rejects bad port", () => buildCollectorConfig({ otlpGrpcPort: 0, otlpHttpPort: 4318, prometheusExporter: true, prometheusPort: 8889, debugExporter: false }));
  throws("p9b1: collector config requires exporter", () => buildCollectorConfig({ otlpGrpcPort: 4317, otlpHttpPort: 4318, prometheusExporter: false, prometheusPort: 0, debugExporter: false }));

  const pm = buildPostmortem({ title: "API latency spike", severity: "sev2", timeline: [{ time: "09:12", event: "Latency crossed 2s p95" }, { time: "09:40", event: "Root cause found" }], impact: "Slow responses for 12% of users", rootCause: "Connection-pool exhaustion", resolution: "Raised pool size", actionItems: ["Add pool alerts", "Document playbook"] });
  eq("p9b1: postmortem has severity header", pm.includes("**Severity:** SEV2 - major"), true);
  eq("p9b1: postmortem renders timeline", [pm.includes("- **09:12** - Latency crossed 2s p95"), pm.includes("- **09:40** - Root cause found")], [true, true]);
  eq("p9b1: postmortem renders action items", [pm.includes("- [ ] Add pool alerts"), pm.includes("- [ ] Document playbook")], [true, true]);
  throws("p9b1: postmortem requires timeline", () => buildPostmortem({ title: "x", severity: "sev3", timeline: [], impact: "", rootCause: "", resolution: "", actionItems: [] }));
}
'''
s = one(
    s,
    '  eq("p8b4: uncapped label formatting", quotaLabel({ metric: "workflow runs", used: 900, limit: null, kind: "ok" }).includes("no cap"), true);\n}',
    '  eq("p8b4: uncapped label formatting", quotaLabel({ metric: "workflow runs", used: 900, limit: null, kind: "ok" }).includes("no cap"), true);\n}\n' + TESTS,
    1,
)
p.write_text(s, encoding="utf-8")
print("verify.ts: +14 otel/incident regression tests")
print("PATCH 9.1 OK — expect 325 passed, 0 failed (311 + 14)")
