// Dogfood check: the /api/v1 OpenAPI document must pass our own validator
// (src/lib/api-testing.ts — the same code behind the openapi.validate tool).
import { readFileSync } from "node:fs";
import { validateOpenApi, listOpenApiOperations } from "../src/lib/api-testing";

const doc = JSON.parse(readFileSync("docs/api-v1.openapi.json", "utf-8"));
const report = validateOpenApi(doc);
console.log("validateOpenApi:", JSON.stringify(report));
if (!report.ok) process.exit(1);
const operations = listOpenApiOperations(doc);
console.log("operations:", operations.map((op) => `${op.method} ${op.path} (${op.operationId})`).join(" | "));
if (operations.length !== 3) { console.error("expected exactly 3 operations, found", operations.length); process.exit(1); }
console.log("OpenAPI document OK");
