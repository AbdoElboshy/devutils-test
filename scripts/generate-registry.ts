/**
 * Generates registry.generated.json — the base tool/category definitions the
 * production gateway reads at startup and merges with administrator overrides.
 *
 * Run after changing src/lib/registry.ts:
 *   npx tsx scripts/generate-registry.ts
 */
import { writeFileSync } from "node:fs";
import { CATEGORIES, TOOLS } from "../src/lib/registry";

const payload = {
  generatedAt: new Date().toISOString(),
  version: 1,
  categories: CATEGORIES,
  tools: TOOLS,
};

writeFileSync("registry.generated.json", `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Generated registry.generated.json — ${TOOLS.length} tools, ${CATEGORIES.length} categories.`);
