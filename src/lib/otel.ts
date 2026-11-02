// OpenTelemetry + incident tooling - pure functions. No network, no eval.
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
  ].join("\n") + "\n";
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
  return lines.join("\n");
}
