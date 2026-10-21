import {
  b64decode,
  b64encode,
  calcSubnet,
  decodeJwt,
  describeCron,
  formatJson,
  jsonToYaml,
  minifyJson,
  parseCron,
  textStats,
  yamlToJson,
  yamlParse,
} from "../lib/engine";
import { curlToPython, k8sDeployment, parseCurl } from "../lib/blueprints";
import { AppError } from "./errors";
import { extractLogErrors, formatLogs } from "../lib/logs";
import { buildLogQl, buildPromQl, calculateSlo, grafanaPanel, zabbixExpression, zabbixTrigger, type PromQueryInput } from "../lib/devops-platform";
import type { ToolOperation, ToolOperationRegistry } from "./contracts";

const encoder = new TextEncoder();

export class InMemoryToolOperationRegistry implements ToolOperationRegistry {
  private readonly operations = new Map<string, ToolOperation>();

  register(operation: ToolOperation): this {
    if (this.operations.has(operation.id)) throw new Error(`Operation already registered: ${operation.id}`);
    this.operations.set(operation.id, operation);
    return this;
  }

  get(id: string): ToolOperation | undefined { return this.operations.get(id); }
  list(): ToolOperation[] { return [...this.operations.values()]; }

  async execute<TOutput = unknown>(id: string, input: unknown, config?: Record<string, boolean | number | string>): Promise<TOutput> {
    const operation = this.get(id);
    if (!operation) throw new AppError("NOT_FOUND", `Unknown operation: ${id}`, "Choose an operation from the workflow editor.");
    const size = encoder.encode(typeof input === "string" ? input : JSON.stringify(input)).byteLength;
    if (operation.maximumInputBytes && size > operation.maximumInputBytes) {
      throw new AppError("LIMIT_EXCEEDED", `Input is ${size.toLocaleString()} bytes; this operation supports ${operation.maximumInputBytes.toLocaleString()} bytes.`, "Split the input into smaller parts.");
    }
    return await operation.run(input, config) as TOutput;
  }
}

const asText = (input: unknown): string => typeof input === "string" ? input : JSON.stringify(input);
const asObject = (input: unknown): Record<string, unknown> => typeof input === "string" ? JSON.parse(input) as Record<string, unknown> : input as Record<string, unknown>;

export const operations = new InMemoryToolOperationRegistry()
  .register({ id: "json.validate", title: "Validate JSON", description: "Parse JSON and stop on a precise syntax error.", clientSide: true, maximumInputBytes: 5_000_000, run: (input) => { JSON.parse(asText(input)); return asText(input); } })
  .register({ id: "json.format", title: "Format JSON", description: "Pretty-print with two spaces.", clientSide: true, maximumInputBytes: 5_000_000, run: (input) => formatJson(asText(input)) })
  .register({ id: "json.minify", title: "Minify JSON", description: "Remove insignificant whitespace.", clientSide: true, maximumInputBytes: 5_000_000, run: (input) => minifyJson(asText(input)) })
  .register({ id: "json.to-yaml", title: "Convert JSON to YAML", description: "Convert a JSON document to YAML.", clientSide: true, maximumInputBytes: 5_000_000, run: (input) => jsonToYaml(asText(input)) })
  .register({ id: "yaml.to-json", title: "Convert YAML to JSON", description: "Convert common YAML to JSON.", clientSide: true, maximumInputBytes: 5_000_000, run: (input) => yamlToJson(asText(input)) })
  .register({ id: "yaml.validate", title: "Validate YAML", description: "Parse YAML and pass valid input to the next step.", clientSide: true, maximumInputBytes: 5_000_000, run: (input) => { yamlParse(asText(input)); return asText(input); } })
  .register({ id: "curl.parse", title: "Parse cURL", description: "Parse a cURL command into a request model.", clientSide: true, run: (input) => parseCurl(asText(input)) })
  .register({ id: "curl.to-python", title: "Generate Python request", description: "Generate Python requests code from cURL or a request model.", clientSide: true, run: (input) => curlToPython(typeof input === "string" ? parseCurl(input) : input as ReturnType<typeof parseCurl>) })
  .register({ id: "base64.encode", title: "Base64 encode", description: "Encode UTF-8 text as Base64.", clientSide: true, run: (input) => b64encode(asText(input)) })
  .register({ id: "base64.decode", title: "Base64 decode", description: "Decode Base64 to UTF-8.", clientSide: true, run: (input) => b64decode(asText(input)) })
  .register({ id: "jwt.decode", title: "Decode JWT", description: "Decode without signature verification.", clientSide: true, run: (input) => decodeJwt(asText(input)) })
  .register({ id: "subnet.calculate", title: "Calculate subnet", description: "Calculate IPv4 CIDR details.", clientSide: true, run: (input) => calcSubnet(asText(input)) })
  .register({ id: "cron.parse", title: "Parse cron", description: "Validate and explain a cron schedule.", clientSide: true, run: (input) => { const value = asText(input); parseCron(value); return describeCron(value); } })
  .register({ id: "text.analyze", title: "Analyze text", description: "Count text characters, words and lines.", clientSide: true, run: (input) => textStats(asText(input)) })
  .register({ id: "logs.format", title: "Normalize logs", description: "Detect and normalize common log formats.", clientSide: true, maximumInputBytes: 5_000_000, run: (input) => formatLogs(asText(input)) })
  .register({ id: "logs.errors", title: "Extract errors", description: "Keep error/fatal events and stack continuations.", clientSide: true, maximumInputBytes: 5_000_000, run: (input) => extractLogErrors(asText(input)) })
  .register({ id: "prometheus.query", title: "Build PromQL", description: "Build a PromQL expression from structured input.", clientSide: true, run: (input) => buildPromQl(asObject(input) as unknown as PromQueryInput) })
  .register({ id: "grafana.panel-from-query", title: "Generate Grafana panel", description: "Wrap a query in a Grafana time-series panel.", clientSide: true, run: (input) => JSON.stringify(grafanaPanel({ title: "Generated query", type: "timeseries", query: asText(input), legend: "{{instance}}", unit: "short", warning: 70, critical: 90 }), null, 2) })
  .register({ id: "loki.query", title: "Build LogQL", description: "Build LogQL from selector/filter configuration.", clientSide: true, run: (input) => buildLogQl(asObject(input) as never) })
  .register({ id: "observability.slo", title: "Calculate SLO budget", description: "Calculate downtime and request error budget.", clientSide: true, run: (input) => calculateSlo(asObject(input) as never) })
  .register({ id: "zabbix.expression", title: "Build Zabbix expression", description: "Convert a common requirement to an expression.", clientSide: true, run: (input) => { const value = asObject(input); return zabbixExpression(String(value.kind ?? "cpu") as "cpu", { host: String(value.host ?? "Template Linux"), threshold: Number(value.threshold ?? 80), duration: String(value.duration ?? "5m") }); } })
  .register({ id: "zabbix.trigger", title: "Build Zabbix trigger", description: "Generate trigger JSON from an expression.", clientSide: true, run: (input) => JSON.stringify(zabbixTrigger({ name: "Generated trigger", expression: asText(input), severity: "HIGH", recovery: "", tags: "source=devutils" }), null, 2) })
  .register({
    id: "kubernetes.deployment",
    title: "Generate Deployment YAML",
    description: "Generate a Kubernetes Deployment from a small JSON configuration.",
    clientSide: true,
    run: (input) => {
      const value = typeof input === "string" ? JSON.parse(input) as Record<string, unknown> : input as Record<string, unknown>;
      return k8sDeployment({
        name: String(value.name ?? "api"),
        namespace: String(value.namespace ?? "default"),
        labels: "",
        image: String(value.image ?? "nginx:alpine"),
        replicas: Number(value.replicas ?? 2),
        port: Number(value.port ?? 80),
        cpu: String(value.cpu ?? "100m"),
        memory: String(value.memory ?? "128Mi"),
        env: "",
      });
    },
  })
  .register({ id: "kubernetes.apply-command", title: "Build kubectl apply", description: "Wrap YAML in a copy-pasteable kubectl apply command.", clientSide: true, run: (input) => `kubectl apply -f - <<'YAML'\n${asText(input).trim()}\nYAML` });

export type ApiOperationRequest = {
  operationId: string;
  input: unknown;
  config?: Record<string, boolean | number | string>;
};

export type ApiOperationResponse<T = unknown> = {
  ok: true;
  operationId: string;
  output: T;
  processedLocally: boolean;
};

// This service is transport-neutral: a future API route, CLI, extension and the web
// UI can all call the same operation contract without importing React.
export async function executeOperation<T = unknown>(request: ApiOperationRequest): Promise<ApiOperationResponse<T>> {
  const operation = operations.get(request.operationId);
  if (!operation) throw new AppError("NOT_FOUND", `Unknown operation: ${request.operationId}`);
  const output = await operations.execute<T>(request.operationId, request.input, request.config);
  return { ok: true, operationId: request.operationId, output, processedLocally: operation.clientSide };
}