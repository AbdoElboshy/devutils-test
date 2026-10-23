import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const registry = JSON.parse(readFileSync("registry.generated.json", "utf8"));
const tools = registry.tools ?? [];
const files = [];
function walk(dir) {
  if (!statSync(dir).isDirectory()) return;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?|mjs)$/.test(p)) files.push([p, readFileSync(p, "utf8")]);
  }
}
walk("src"); walk("server");

const rows = [];
for (const t of tools) {
  const hits = files.filter(([, content]) => content.includes(t.id)).map(([p]) => p);
  rows.push({ id: t.id, category: t.category ?? "?", route: t.route ?? "?", impl: hits.length });
}
const noImpl = rows.filter((r) => r.impl === 0);
const byCategory = {};
for (const r of rows) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;

console.log("total tools:", rows.length);
console.log("tools with no source reference:", noImpl.length);
for (const r of noImpl) console.log("  NO-IMPL:", r.id, "(" + r.category + ", " + r.route + ")");
console.log("\ncategory counts:", JSON.stringify(byCategory, null, 2));
console.log("\nfull catalog (id\tcategory\troute\tsource-hits):");
for (const r of rows) console.log(`${r.id}\t${r.category}\t${r.route}\t${r.impl}`);
