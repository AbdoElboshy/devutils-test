import { useMemo, useState } from "react";
import { TOOL_MAP } from "../lib/registry";
import {
  formatGraphql,
  formatOpenApi,
  jsonSampleToOpenApiSchema,
  openApiClientSkeleton,
  openApiToTypeScript,
  validateGraphql,
  validateOpenApi,
} from "../lib/api-schema";
import { ToolScaffold, Panel, Tabs, Field, Select, CodeArea, OutputBox, ErrorCallout, Split } from "../components/ui";

const sample = `{
  "openapi": "3.1.0",
  "info": { "title": "Users API", "version": "1.0.0" },
  "servers": [{ "url": "https://api.example.com" }],
  "paths": {
    "/users": {
      "get": {
        "operationId": "listUsers",
        "responses": { "200": { "description": "OK" } }
      }
    }
  },
  "components": {
    "schemas": {
      "User": {
        "type": "object",
        "required": ["id", "name"],
        "properties": { "id": { "type": "string" }, "name": { "type": "string" } }
      }
    }
  }
}`;

export function ApiSchemaTool() {
  const tool = TOOL_MAP["api-schema"];
  const [kind, setKind] = useState("openapi");
  const [operation, setOperation] = useState("format");
  const [target, setTarget] = useState<"yaml" | "json">("yaml");
  const [input, setInput] = useState(sample);

  const result = useMemo(() => {
    if (!input.trim()) return { ok: true as const, output: "", issues: [] as ReturnType<typeof validateOpenApi> };
    try {
      if (kind === "graphql") {
        const issues = validateGraphql(input);
        if (operation === "validate") return { ok: true as const, output: issues.length ? issues.map((issue) => `${issue.severity.toUpperCase()} ${issue.path}: ${issue.message}`).join("\n") : "Valid GraphQL structure", issues };
        return { ok: true as const, output: formatGraphql(input), issues };
      }
      if (operation === "format") return { ok: true as const, output: formatOpenApi(input, target), issues: validateOpenApi(input) };
      if (operation === "validate") {
        const issues = validateOpenApi(input);
        return { ok: true as const, output: issues.length ? issues.map((issue) => `${issue.severity.toUpperCase()} ${issue.path}: ${issue.message}`).join("\n") : "Valid OpenAPI structure", issues };
      }
      if (operation === "types") return { ok: true as const, output: openApiToTypeScript(input), issues: validateOpenApi(input) };
      if (operation === "client") return { ok: true as const, output: openApiClientSkeleton(input), issues: validateOpenApi(input) };
      return { ok: true as const, output: jsonSampleToOpenApiSchema(input), issues: [] };
    } catch (cause) { return { ok: false as const, error: cause instanceof Error ? cause.message : "Could not process schema." }; }
  }, [input, kind, operation, target]);

  const operations = kind === "graphql"
    ? [{ id: "format", label: "Format" }, { id: "validate", label: "Validate" }]
    : [{ id: "format", label: "Format" }, { id: "validate", label: "Validate" }, { id: "types", label: "TypeScript types" }, { id: "client", label: "Client skeleton" }, { id: "sample", label: "JSON → OpenAPI" }];

  return (
    <ToolScaffold tool={tool} next={[{ label: "Convert response data", to: "/convert" }, { label: "Build cURL request", to: "/curl" }, { label: "Format generated code", to: "/code-format" }]}>
      <Panel className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Tabs tabs={[{ id: "openapi", label: "OpenAPI" }, { id: "graphql", label: "GraphQL" }]} active={kind} onChange={(next) => { setKind(next); setOperation("format"); setInput(next === "openapi" ? sample : "query GetUser($id: ID!) { user(id: $id) { id name email } }"); }} />
          {kind === "openapi" && operation === "format" && <Field label="Output"><Select value={target} onChange={(event) => setTarget(event.target.value as "yaml" | "json")} className="w-28"><option value="yaml">YAML</option><option value="json">JSON</option></Select></Field>}
        </div>
        <div className="mt-3"><Tabs tabs={operations} active={operation} onChange={setOperation} ariaLabel="API schema operations" /></div>
        <div className="mt-3">
          <Split
            left={<CodeArea label={operation === "sample" ? "Sample JSON" : `${kind === "openapi" ? "OpenAPI JSON or YAML" : "GraphQL document"}`} value={input} onChange={setInput} rows={15} accept=".json,.yaml,.yml,.graphql,.gql" onFile={(text) => setInput(text)} />}
            right={!result.ok ? <ErrorCallout title="Cannot process document" message={result.error} /> : (
              <div>
                <OutputBox value={result.output} label="Output" filename={kind === "graphql" ? "schema.graphql" : operation === "types" ? "types.ts" : operation === "client" ? "client.ts" : target === "yaml" ? "openapi.yaml" : "openapi.json"} rows={15} />
                {"issues" in result && result.issues.length > 0 && operation !== "validate" && <p className="mt-2 text-[12px] text-amber-700 dark:text-amber-300">{result.issues.filter((issue) => issue.severity === "error").length} error(s), {result.issues.filter((issue) => issue.severity === "warning").length} warning(s). Use Validate for details.</p>}
              </div>
            )}
          />
        </div>
        <p className="mt-3 text-[12px] text-zinc-500">Validation is deterministic structural validation for OpenAPI 3.x and GraphQL syntax balance. It does not claim full spec conformance or execute requests.</p>
      </Panel>
    </ToolScaffold>
  );
}