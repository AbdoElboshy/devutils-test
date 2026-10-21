import type { SavedWorkflow } from "../platform/models";

export type WorkflowTemplate = SavedWorkflow & {
  category: "data" | "api" | "devops" | "debugging";
  sampleInput: string;
  relatedToolIds: string[];
};

const date = "2026-01-01T00:00:00.000Z";

export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  {
    id: "json-to-yaml",
    name: "JSON → validated YAML",
    description: "Validate JSON, format it, then convert the clean document to YAML.",
    category: "data",
    source: "template",
    createdAt: date,
    updatedAt: date,
    version: 1,
    sampleInput: '{\n  "service": "api",\n  "port": 8080,\n  "replicas": 3\n}',
    relatedToolIds: ["json", "converter"],
    steps: [
      { id: "validate", operationId: "json.validate", label: "Validate JSON" },
      { id: "format", operationId: "json.format", label: "Format JSON" },
      { id: "yaml", operationId: "json.to-yaml", label: "Convert to YAML" },
    ],
  },
  {
    id: "curl-to-python",
    name: "cURL → Python request",
    description: "Parse a cURL command and generate a formatted Python requests skeleton.",
    category: "api",
    source: "template",
    createdAt: date,
    updatedAt: date,
    version: 1,
    sampleInput: 'curl -X POST https://api.example.com/users -H "Content-Type: application/json" --data-raw \'{"name":"Maya"}\'',
    relatedToolIds: ["curl", "code-format"],
    steps: [
      { id: "parse", operationId: "curl.parse", label: "Parse cURL" },
      { id: "python", operationId: "curl.to-python", label: "Generate Python" },
    ],
  },
  {
    id: "kubernetes-deployment",
    name: "Kubernetes deployment → apply",
    description: "Generate Deployment YAML, validate it, and build a kubectl apply command.",
    category: "devops",
    source: "template",
    createdAt: date,
    updatedAt: date,
    version: 1,
    sampleInput: '{\n  "name": "api",\n  "namespace": "default",\n  "image": "nginx:1.27",\n  "replicas": 3,\n  "port": 80\n}',
    relatedToolIds: ["kubernetes", "docker"],
    steps: [
      { id: "generate", operationId: "kubernetes.deployment", label: "Generate Deployment" },
      { id: "validate", operationId: "yaml.validate", label: "Validate YAML" },
      { id: "apply", operationId: "kubernetes.apply-command", label: "Generate kubectl command" },
    ],
  },
  {
    id: "base64-inspect",
    name: "Decode → inspect text",
    description: "Decode Base64 and immediately calculate useful text statistics.",
    category: "debugging",
    source: "template",
    createdAt: date,
    updatedAt: date,
    version: 1,
    sampleInput: "SGVsbG8gZnJvbSBEZXZVdGlscyE=",
    relatedToolIds: ["encode", "text"],
    steps: [
      { id: "decode", operationId: "base64.decode", label: "Decode Base64" },
      { id: "analyze", operationId: "text.analyze", label: "Analyze decoded text" },
    ],
  },
  {
    id: "log-triage",
    name: "Normalize logs → extract errors",
    description: "Normalize mixed container/application logs, then isolate failures and stack continuations.",
    category: "debugging",
    source: "template",
    createdAt: date,
    updatedAt: date,
    version: 1,
    sampleInput: '{"timestamp":"2026-04-18T10:12:00Z","level":"info","message":"server ready"}\n2026-04-18T10:12:03Z stderr F ERROR ECONNREFUSED database:5432\n    at connect (db.js:42:9)',
    relatedToolIds: ["logs", "errors"],
    steps: [
      { id: "normalize", operationId: "logs.format", label: "Normalize logs" },
      { id: "errors", operationId: "logs.errors", label: "Extract errors" },
    ],
  },
  {
    id: "promql-to-grafana",
    name: "PromQL → Grafana panel",
    description: "Build a PromQL rate query and wrap it in importable Grafana panel JSON.",
    category: "devops",
    source: "template",
    createdAt: date,
    updatedAt: date,
    version: 1,
    sampleInput: '{"metric":"http_requests_total","operation":"rate","window":"5m","labels":"job=api","groupBy":"job","without":false,"quantile":0.95}',
    relatedToolIds: ["prometheus", "grafana"],
    steps: [
      { id: "query", operationId: "prometheus.query", label: "Build PromQL" },
      { id: "panel", operationId: "grafana.panel-from-query", label: "Generate Grafana panel" },
    ],
  },
  {
    id: "zabbix-cpu-trigger",
    name: "CPU requirement → Zabbix trigger",
    description: "Convert a CPU threshold requirement into a Zabbix trigger definition.",
    category: "devops",
    source: "template",
    createdAt: date,
    updatedAt: date,
    version: 1,
    sampleInput: '{"kind":"cpu","host":"Template Linux by DevUtils","threshold":80,"duration":"5m"}',
    relatedToolIds: ["zabbix", "monitoring"],
    steps: [
      { id: "expression", operationId: "zabbix.expression", label: "Build expression" },
      { id: "trigger", operationId: "zabbix.trigger", label: "Generate trigger JSON" },
    ],
  },
] as const;

export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((workflow) => workflow.id === id);
}