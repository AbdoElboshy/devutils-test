import { jsonToSchema, yamlParse, yamlStringify } from "./engine";

export type ValidationIssue = { path: string; message: string; severity: "error" | "warning" };

export function parseOpenApi(input: string): Record<string, unknown> {
  const text = input.trim();
  if (!text) throw new Error("Paste an OpenAPI JSON or YAML document first.");
  const value = text.startsWith("{") ? JSON.parse(text) : yamlParse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("OpenAPI root must be an object.");
  return value as Record<string, unknown>;
}

export function formatOpenApi(input: string, output: "yaml" | "json" = "yaml"): string {
  const value = parseOpenApi(input);
  return output === "json" ? JSON.stringify(value, null, 2) : yamlStringify(value);
}

export function validateOpenApi(input: string): ValidationIssue[] {
  const doc = parseOpenApi(input);
  const issues: ValidationIssue[] = [];
  const version = doc.openapi;
  if (typeof version !== "string") issues.push({ path: "$.openapi", message: "Missing OpenAPI version (for example 3.1.0).", severity: "error" });
  else if (!/^3\.(0|1)\.\d+$/.test(version)) issues.push({ path: "$.openapi", message: `Version ${version} is not an OpenAPI 3.0/3.1 version.`, severity: "warning" });
  const info = doc.info as Record<string, unknown> | undefined;
  if (!info || typeof info !== "object") issues.push({ path: "$.info", message: "Missing info object.", severity: "error" });
  else {
    if (typeof info.title !== "string" || !info.title.trim()) issues.push({ path: "$.info.title", message: "A non-empty API title is required.", severity: "error" });
    if (typeof info.version !== "string" || !info.version.trim()) issues.push({ path: "$.info.version", message: "An API version is required.", severity: "error" });
  }
  const paths = doc.paths as Record<string, unknown> | undefined;
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) issues.push({ path: "$.paths", message: "Missing paths object.", severity: "error" });
  else {
    const methods = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];
    Object.entries(paths).forEach(([path, value]) => {
      if (!path.startsWith("/")) issues.push({ path: `$.paths.${path}`, message: "Path keys should start with /.", severity: "warning" });
      if (!value || typeof value !== "object") { issues.push({ path: `$.paths.${path}`, message: "Path item must be an object.", severity: "error" }); return; }
      const item = value as Record<string, unknown>;
      const operations = methods.filter((method) => item[method]);
      if (!operations.length) issues.push({ path: `$.paths.${path}`, message: "Path has no HTTP operations.", severity: "warning" });
      operations.forEach((method) => {
        const operation = item[method] as Record<string, unknown>;
        if (!operation.responses || typeof operation.responses !== "object") issues.push({ path: `$.paths.${path}.${method}.responses`, message: "Operation needs a responses object.", severity: "error" });
        if (!operation.operationId) issues.push({ path: `$.paths.${path}.${method}.operationId`, message: "Add operationId to generate stable clients.", severity: "warning" });
      });
    });
  }
  return issues;
}

function pascal(value: string): string {
  return value.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_, _sep: string, letter: string) => letter.toUpperCase()).replace(/[^A-Za-z0-9]/g, "") || "Model";
}

function schemaType(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "unknown";
  const value = schema as Record<string, unknown>;
  if (typeof value.$ref === "string") return pascal(value.$ref.split("/").pop() ?? "Model");
  if (Array.isArray(value.enum)) return value.enum.map((item) => JSON.stringify(item)).join(" | ") || "unknown";
  if (Array.isArray(value.oneOf)) return value.oneOf.map(schemaType).join(" | ");
  if (Array.isArray(value.anyOf)) return value.anyOf.map(schemaType).join(" | ");
  if (value.type === "array") return `${schemaType(value.items)}[]`;
  if (value.type === "integer" || value.type === "number") return "number";
  if (value.type === "boolean") return "boolean";
  if (value.type === "string") return "string";
  if (value.type === "object" || value.properties) return "Record<string, unknown>";
  return "unknown";
}

export function openApiToTypeScript(input: string): string {
  const doc = parseOpenApi(input);
  const schemas = ((doc.components as Record<string, unknown> | undefined)?.schemas ?? {}) as Record<string, Record<string, unknown>>;
  if (!Object.keys(schemas).length) throw new Error("No components.schemas found. Add reusable schemas before generating types.");
  return Object.entries(schemas).map(([name, schema]) => {
    if (Array.isArray(schema.enum)) return `export type ${pascal(name)} = ${schema.enum.map((item) => JSON.stringify(item)).join(" | ")};`;
    const properties = (schema.properties ?? {}) as Record<string, unknown>;
    const required = new Set(Array.isArray(schema.required) ? schema.required as string[] : []);
    const body = Object.entries(properties).map(([key, value]) => `  ${JSON.stringify(key)}${required.has(key) ? "" : "?"}: ${schemaType(value)};`).join("\n");
    return `export interface ${pascal(name)} {\n${body || "  [key: string]: unknown;"}\n}`;
  }).join("\n\n");
}

export function openApiClientSkeleton(input: string): string {
  const doc = parseOpenApi(input);
  const paths = (doc.paths ?? {}) as Record<string, Record<string, unknown>>;
  const methods = ["get", "post", "put", "patch", "delete"];
  const functions: string[] = [];
  Object.entries(paths).forEach(([path, item]) => methods.forEach((method) => {
    const operation = item?.[method];
    if (!operation || typeof operation !== "object") return;
    const op = operation as Record<string, unknown>;
    const name = String(op.operationId ?? `${method}-${path}`).replace(/[^A-Za-z0-9]+(.)/g, (_, char: string) => char.toUpperCase()).replace(/^[^A-Za-z_$]+/, "") || "request";
    const pathParams = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
    const pathExpression = path.replace(/\{([^}]+)\}/g, (_, key: string) => `\${encodeURIComponent(String(params[${JSON.stringify(key)}]))}`);
    functions.push(`export async function ${name}(params: Record<string, string | number> = {}, body?: unknown) {\n  const response = await fetch(\`${"${baseUrl}"}${pathExpression}\`, {\n    method: ${JSON.stringify(method.toUpperCase())},\n    headers: { "Content-Type": "application/json" },${["post", "put", "patch"].includes(method) ? "\n    body: body === undefined ? undefined : JSON.stringify(body)," : ""}\n  });\n  if (!response.ok) throw new Error(\`HTTP \${response.status}\`);\n  return response.status === 204 ? undefined : response.json();\n}\n// path params: ${pathParams.join(", ") || "none"}`);
  }));
  if (!functions.length) throw new Error("No GET/POST/PUT/PATCH/DELETE operations found under paths.");
  return `const baseUrl = ${JSON.stringify((((doc.servers as unknown[])?.[0] as Record<string, unknown> | undefined)?.url as string | undefined) ?? "https://api.example.com")};\n\n${functions.join("\n\n")}`;
}

export function jsonSampleToOpenApiSchema(input: string): string {
  const schema = JSON.parse(jsonToSchema(input));
  return JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Generated API", version: "1.0.0" },
    paths: {},
    components: { schemas: { GeneratedModel: schema } },
  }, null, 2);
}

export function validateGraphql(input: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const stack: { char: string; index: number }[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let quote = "";
  let escaped = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (escaped) { escaped = false; continue; }
    if (char === "\\" && quote) { escaped = true; continue; }
    if (quote) { if (char === quote) quote = ""; continue; }
    if (char === '"') { quote = char; continue; }
    if (char === "#") { while (index < input.length && input[index] !== "\n") index++; continue; }
    if ("([{ ".includes(char) && char !== " ") stack.push({ char, index });
    if (char in pairs) {
      const open = stack.pop();
      if (!open || open.char !== pairs[char]) issues.push({ path: `char ${index + 1}`, message: `Unexpected closing ${char}.`, severity: "error" });
    }
  }
  stack.forEach((open) => issues.push({ path: `char ${open.index + 1}`, message: `Unclosed ${open.char}.`, severity: "error" }));
  if (quote) issues.push({ path: "document", message: "Unclosed string literal.", severity: "error" });
  if (!/\b(type|interface|enum|input|scalar|schema|query|mutation|subscription|fragment)\b/.test(input)) issues.push({ path: "document", message: "No GraphQL type, operation or fragment definition found.", severity: "warning" });
  return issues;
}

export function formatGraphql(input: string): string {
  const issues = validateGraphql(input).filter((issue) => issue.severity === "error");
  if (issues.length) throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join(" "));
  const tokens = input.replace(/#[^\n]*/g, (comment) => `\n${comment}\n`).replace(/\s+/g, " ").replace(/\s*([{}()!:,\[\]])\s*/g, "$1").split(/([{}])/).filter(Boolean);
  const lines: string[] = [];
  let depth = 0;
  tokens.forEach((token) => {
    const value = token.trim();
    if (!value) return;
    if (value === "}") { depth = Math.max(0, depth - 1); lines.push(`${"  ".repeat(depth)}}`); }
    else if (value === "{") { if (lines.length) lines[lines.length - 1] += " {"; else lines.push("{"); depth++; }
    else {
      value.split(/(?=\b(?:type|interface|enum|input|scalar|schema|query|mutation|subscription|fragment)\b)/).filter(Boolean).forEach((part) => lines.push(`${"  ".repeat(depth)}${part.trim().replace(/,/g, ", ")}`));
    }
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}