import { readFileSync } from "node:fs";

function parseFile(file) {
  const values = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

const fileIndex = process.argv.indexOf("--file");
const fileValues = fileIndex >= 0 && process.argv[fileIndex + 1] ? parseFile(process.argv[fileIndex + 1]) : {};
const env = { ...fileValues, ...process.env };
const required = ["NODE_ENV", "APP_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const errors = [];
for (const key of required) if (!String(env[key] ?? "").trim()) errors.push(`Missing required environment variable: ${key}`);
if (env.NODE_ENV && env.NODE_ENV !== "production") errors.push("NODE_ENV must be production for the production deployment.");
for (const key of ["APP_URL", "SUPABASE_URL"]) {
  if (!env[key]) continue;
  try { const url = new URL(env[key]); if (url.protocol !== "https:") errors.push(`${key} must use https:// in production.`); if (key === "APP_URL" && (url.pathname !== "/" || url.search || url.hash)) errors.push("APP_URL must be an origin only, without a path, query, or fragment."); }
  catch { errors.push(`${key} must be a valid absolute URL.`); }
}
if (env.SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY === env.SUPABASE_PUBLISHABLE_KEY) errors.push("SUPABASE_SERVICE_ROLE_KEY must not equal the publishable key.");
if (env.PORT && (!/^\d+$/.test(env.PORT) || Number(env.PORT) < 1 || Number(env.PORT) > 65535)) errors.push("PORT must be an integer from 1 to 65535.");
if (errors.length) {
  console.error("DevUtils environment validation failed:\n");
  errors.forEach((error) => console.error(`- ${error}`));
  console.error("\nNo secret values were printed. Correct the environment file and run validation again.");
  process.exit(1);
}
console.log("DevUtils production environment is valid. No secret values were printed.");