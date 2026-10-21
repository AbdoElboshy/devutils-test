import { readFileSync, writeFileSync } from "node:fs";
import { CATEGORIES, TOOLS } from "../src/lib/registry";

const fileIndex = process.argv.indexOf("--env-file");
let fileAppUrl = "";
if (fileIndex >= 0 && process.argv[fileIndex + 1]) {
  const line = readFileSync(process.argv[fileIndex + 1], "utf8").split(/\r?\n/).find((value) => value.trim().startsWith("APP_URL="));
  fileAppUrl = line?.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "") ?? "";
}
const base = (fileAppUrl || process.env.APP_URL || "https://devutils.app").replace(/\/$/, "");
const routes = ["/", "/tools", "/categories", "/workflows", ...CATEGORIES.map((category) => `/categories/${category.slug}`), ...TOOLS.map((tool) => tool.route)];
const unique = [...new Set(routes)].sort((a, b) => a === "/" ? -1 : a.localeCompare(b));
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.map((route) => `  <url><loc>${base}${route}</loc><priority>${route === "/" ? "1.0" : route.startsWith("/tools/") ? "0.8" : "0.7"}</priority></url>`).join("\n")}\n</urlset>\n`;
writeFileSync("public/sitemap.xml", xml, "utf8");
console.log(`Generated public/sitemap.xml with ${unique.length} registry-backed routes.`);