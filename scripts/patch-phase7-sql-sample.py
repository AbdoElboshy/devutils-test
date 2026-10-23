#!/usr/bin/env python3
"""Phase 7 final build item: SQL sample-data generator.

Adds genSqlSampleData() to src/lib/engine.ts (pure, seeded, never executes
SQL), a "Sample data" tab to the SqlTool page (src/tools/tool-data.tsx,
reusing the existing Dialect selector), and 10 regression tests to
scripts/verify.ts (expect 266 passed, 0 failed).

Anchors verified against master 471892c:
- engine.ts:  /* ================= CODE FORMAT / MINIFY ================= */  (x1, right after minifySql)
- tool-data.tsx: import line, diffB state, "// diff" fallthrough, deps array,
  tab-button array, dialect-selector condition, "{tab === \"diff\" && (" render
- verify.ts: "formatSql, minifySql, explainRegex" import, "// --- G2: SQL format / minify ---"

Idempotency: aborts if genSqlSampleData is already in engine.ts.
"""
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent


def one(s, old, new, n=1):
    c = s.count(old)
    assert c == n, "anchor found {}x (expected {}): {!r}".format(c, n, old[:70])
    return s.replace(old, new, n)


# ---------------- 1. src/lib/engine.ts ----------------
p = root / "src/lib/engine.ts"
s = p.read_text(encoding="utf-8")
if "genSqlSampleData" in s:
    print("ABORT: genSqlSampleData already present in engine.ts")
    sys.exit(1)

ENGINE_BLOCK = r'''/* ===== SQL SAMPLE DATA (phase7) — pure generator, never executes SQL ===== */

function hashSeedStr(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

function seededRng(seed: string): () => number {
  let a = hashSeedStr(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type SampleCol = { name: string; kind: string; nullable: boolean; primary: boolean };

function parseTableName(ddl: string): string {
  const m = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([^\s(]+)/i.exec(ddl);
  if (!m) throw new Error("Could not find 'CREATE TABLE <name> (...)' — paste a full CREATE TABLE statement.");
  return m[1].replace(/["`\[\]]/g, "");
}

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0, quote = "", cur = "";
  for (const ch of body) {
    if (quote) { cur += ch; if (ch === quote) quote = ""; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; cur += ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

function parseTableColumns(ddl: string): SampleCol[] {
  const open = ddl.indexOf("(");
  if (open < 0) throw new Error("CREATE TABLE has no '(...)' — expected column definitions.");
  let depth = 0, quote = "", end = -1;
  for (let i = open; i < ddl.length; i++) {
    const ch = ddl[i];
    if (quote) { if (ch === quote) quote = ""; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error("Unbalanced parentheses in CREATE TABLE.");
  const cols: SampleCol[] = [];
  for (const raw of splitTopLevel(ddl.slice(open + 1, end))) {
    const part = raw.trim();
    if (!part) continue;
    if (/^(primary\s+key|foreign\s+key|unique\b|check\b|constraint\b|key\b|index\b|exclude\b|period\b|like\b)/i.test(part)) continue;
    const nm = /^\s*(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_$][\w$]*))\s+([\s\S]+)$/.exec(part);
    if (!nm) continue;
    const name = nm[1] || nm[2] || nm[3] || nm[4] || "";
    const def = (nm[5] || "").toLowerCase();
    cols.push({ name, kind: sampleColKind(def), nullable: !/\bnot\s+null\b/.test(def), primary: /\bprimary\s+key\b/.test(def) });
  }
  return cols;
}

function sampleColKind(def: string): string {
  if (/\buuid\b/.test(def)) return "uuid";
  if (/\bjsonb?\b/.test(def)) return "json";
  if (/\btimestamptz\b|\btimestamp\b|\bdatetime\b/.test(def)) return "ts";
  if (/\bboolean\b|\bbool\b|\bbit\b/.test(def)) return "bool";
  if (/\bdate\b/.test(def)) return "date";
  if (/\binteger\b|\bbigint\b|\bsmallint\b|\btinyint\b|\bserial\b|\bidentity\b|\bint\b/.test(def)) return "int";
  if (/\bnumeric\b|\bdecimal\b|\bmoney\b|\bfloat\b|\bdouble\b|\breal\b/.test(def)) return "real";
  return "text";
}

const SAMPLE_FIRST = ["maya", "liam", "noah", "emma", "olivia", "aiden", "sofia", "kai"];
const SAMPLE_LAST = ["chen", "patel", "reyes", "kova", "adler", "nolan", "ibrahim", "ross"];
const SAMPLE_CITY = ["london", "cairo", "berlin", "tokyo", "perth", "delhi", "oslo", "lagos"];

function sampleHex(rng: () => number, n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += "0123456789abcdef"[Math.floor(rng() * 16)];
  return out;
}

function sampleIsoDay(i: number): string {
  return new Date(Date.UTC(2026, 9, 1) + i * 86400000).toISOString().slice(0, 10);
}

function sampleTextFor(name: string, i: number, rng: () => number): string {
  const n = name.toLowerCase();
  if (/email/.test(n)) return SAMPLE_FIRST[i % 8] + (i + 1) + "@example.com";
  if (/first_?name/.test(n)) return SAMPLE_FIRST[i % 8];
  if (/last_?name|surname/.test(n)) return SAMPLE_LAST[i % 8];
  if (/(^|_)name$/.test(n) && !/user|file|host|table/.test(n)) return SAMPLE_FIRST[i % 8] + " " + SAMPLE_LAST[i % 8];
  if (/user(name)?|handle|login|account/.test(n)) return SAMPLE_FIRST[i % 8] + (i + 1);
  if (/phone|mobile|(^|_)tel$/.test(n)) return "+1555" + String(1000000 + i * 137).slice(1);
  if (/city/.test(n)) return SAMPLE_CITY[i % 8];
  if (/country/.test(n)) return ["egypt", "india", "germany", "japan", "brazil", "kenya", "norway", "spain"][i % 8];
  if (/state|province/.test(n)) return ["north", "south", "east", "west", "central"][i % 5];
  if (/zip|postal/.test(n)) return String(10000 + i * 97);
  if (/url|website|link|domain/.test(n)) return "https://example.com/page/" + (i + 1);
  if (/token|hash|secret|api_?key|slug/.test(n)) return sampleHex(rng, 32);
  if (/status/.test(n)) return ["active", "pending", "archived"][i % 3];
  if (/title|label/.test(n)) return "Sample " + (i + 1);
  if (/desc|notes|comment|bio|body|message/.test(n)) return "Sample " + SAMPLE_FIRST[i % 8] + " record " + (i + 1);
  return n.replace(/^is_?/, "").replace(/_at$|_id$/g, "") + "_" + (i + 1);
}

function sampleValueFor(c: SampleCol, i: number, rng: () => number, dialect: string): string {
  if (c.nullable && !c.primary && rng() < 0.1) return "NULL";
  const q = (v: string) => "'" + v.split("'").join("''") + "'";
  switch (c.kind) {
    case "int": return String(i + 1);
    case "real": return (Math.round(rng() * 1000000) / 100).toFixed(2);
    case "bool": return dialect === "SQL Server" ? (rng() < 0.5 ? "1" : "0") : (rng() < 0.5 ? "true" : "false");
    case "date": return q(sampleIsoDay(i));
    case "ts": return q(sampleIsoDay(i) + " " + String(Math.floor(rng() * 24)).padStart(2, "0") + ":15:30");
    case "json": return q('{"id": ' + (i + 1) + ', "active": true}');
    case "uuid": return q(sampleHex(rng, 8) + "-" + sampleHex(rng, 4) + "-4" + sampleHex(rng, 3) + "-8" + sampleHex(rng, 3) + "-" + sampleHex(rng, 12));
    default: return q(sampleTextFor(c.name, i, rng));
  }
}

function sampleQuoteIdent(name: string, dialect: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
  if (dialect === "MySQL") return "`" + name + "`";
  if (dialect === "SQL Server") return "[" + name + "]";
  return '"' + name + '"';
}

export function genSqlSampleData(ddl: string, dialect: string, rowCount: number, seed: string): string {
  if (!ddl.trim()) throw new Error("Paste a CREATE TABLE statement first.");
  const cols = parseTableColumns(ddl);
  if (!cols.length) throw new Error("No columns found — expected column definitions inside CREATE TABLE ( ... ).");
  const rc = Math.floor(Number(rowCount));
  const n = Math.max(1, Math.min(Number.isFinite(rc) ? rc : 10, 500));
  const rng = seededRng(seed.trim() || "devutils");
  const table = parseTableName(ddl);
  const rows: string[] = [];
  for (let i = 0; i < n; i++) {
    rows.push("  (" + cols.map((c) => sampleValueFor(c, i, rng, dialect)).join(", ") + ")");
  }
  return "INSERT INTO " + sampleQuoteIdent(table, dialect) + " (" + cols.map((c) => sampleQuoteIdent(c.name, dialect)).join(", ") + ") VALUES\n" + rows.join(",\n") + ";";
}
'''

anchor = "/* ================= CODE FORMAT / MINIFY ================= */"
s = one(s, anchor, ENGINE_BLOCK + "\n" + anchor, 1)
p.write_text(s, encoding="utf-8")
print("engine.ts: genSqlSampleData() + helpers added")

# ---------------- 2. src/tools/tool-data.tsx ----------------
p = root / "src/tools/tool-data.tsx"
s = p.read_text(encoding="utf-8")
if "genSqlSampleData" in s or "sdInput" in s:
    print("ABORT: tool-data.tsx already patched")
    sys.exit(1)

s = one(
    s,
    "  formatSql, minifySql, yamlParse, csvParse, diffLines, parseJsonError,",
    "  formatSql, minifySql, genSqlSampleData, yamlParse, csvParse, diffLines, parseJsonError,",
    1,
)

s = one(
    s,
    '  const [diffB, setDiffB] = useState("select id, name from users;");',
    '  const [diffB, setDiffB] = useState("select id, name from users;");\n'
    '  const [sdInput, setSdInput] = useState("CREATE TABLE users (\\n  id SERIAL PRIMARY KEY,\\n  name TEXT NOT NULL,\\n  email TEXT NOT NULL UNIQUE,\\n  is_admin BOOLEAN DEFAULT false,\\n  balance NUMERIC(10,2),\\n  bio TEXT,\\n  created_at TIMESTAMPTZ DEFAULT now()\\n);");\n'
    '  const [sdRows, setSdRows] = useState("10");\n'
    '  const [sdSeed, setSdSeed] = useState("devutils");',
    1,
)

s = one(
    s,
    "      // diff\n      const ops = diffLines(input, diffB);",
    "      if (tab === \"sample\") {\n"
    "        return { ok: true as const, out: genSqlSampleData(sdInput, dialect, Number(sdRows) || 10, sdSeed) };\n"
    "      }\n"
    "      // diff\n      const ops = diffLines(input, diffB);",
    1,
)

s = one(
    s,
    "connDbName, connUser, diffB]",
    "connDbName, connUser, sdInput, sdRows, sdSeed, diffB]",
    1,
)

s = one(
    s,
    '["conn", "Connection"], ["diff", "Diff"]',
    '["conn", "Connection"], ["sample", "Sample data"], ["diff", "Diff"]',
    1,
)

s = one(
    s,
    '{(tab === "format" || tab === "minify") && (\n            <Field label="Dialect">',
    '{(tab === "format" || tab === "minify" || tab === "sample") && (\n            <Field label="Dialect">',
    1,
)

SAMPLE_UI = '''          {tab === "sample" && (
            <Split left={<div className="space-y-3">
              <Field label="CREATE TABLE statement" hint="Paste DDL — table-level constraints are skipped"><textarea value={sdInput} onChange={(e) => setSdInput(e.target.value)} rows={9} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-[13px] dark:border-zinc-700 dark:bg-zinc-900" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rows (1–500)"><TextInput value={sdRows} onChange={(e) => setSdRows(e.target.value)} className="font-mono" /></Field>
                <Field label="Seed" hint="Same seed → same data"><TextInput value={sdSeed} onChange={(e) => setSdSeed(e.target.value)} className="font-mono" /></Field>
              </div>
            </div>} right={!res.ok ? <ErrorCallout title="Cannot generate" message={res.err} /> : <OutputBox value={res.out} label="Sample INSERT" filename="sample.sql" rows={12} />} />
          )}
'''
s = one(s, '          {tab === "diff" && (', SAMPLE_UI + '          {tab === "diff" && (', 1)
p.write_text(s, encoding="utf-8")
print("tool-data.tsx: Sample data tab added")

# ---------------- 3. scripts/verify.ts ----------------
p = root / "scripts/verify.ts"
s = p.read_text(encoding="utf-8")
if "genSqlSampleData" in s:
    print("ABORT: verify.ts already patched")
    sys.exit(1)

s = one(
    s,
    "formatSql, minifySql, explainRegex",
    "formatSql, minifySql, genSqlSampleData, explainRegex",
    1,
)

TESTS = r'''// --- G2: SQL sample data generator (phase7) ---
{
  const ddl = 'CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  name TEXT NOT NULL,\n  email TEXT NOT NULL UNIQUE,\n  is_admin BOOLEAN DEFAULT false,\n  balance NUMERIC(10,2),\n  bio TEXT,\n  created_at TIMESTAMPTZ DEFAULT now()\n);';
  const out = genSqlSampleData(ddl, "PostgreSQL", 12, "seed-a");
  const lines = out.split("\n").filter((l) => l.trim().startsWith("("));
  eq("sql sample row count", lines.length, 12);
  eq("sql sample header", out.startsWith('INSERT INTO users (id, name, email, is_admin, balance, bio, created_at) VALUES'), true);
  eq("sql sample unique emails", new Set(out.match(/[\w.]+@example\.com/g) ?? []).size, 12);
  eq("sql sample sequential ids", lines[0].trim().startsWith("(1, ") && lines[11].trim().startsWith("(12, "), true);
  eq("sql sample deterministic", genSqlSampleData(ddl, "PostgreSQL", 12, "seed-a") === out, true);
  eq("sql sample seed changes data", genSqlSampleData(ddl, "PostgreSQL", 12, "seed-b") !== out, true);
  const mssql = genSqlSampleData(ddl, "SQL Server", 8, "seed-a");
  eq("sql sample mssql booleans", /true|false/.test(mssql) === false, true);
  eq("sql sample not-null respected", lines.every((l) => /^\(\d+, '[^']+', '[^']+@example\.com', (true|false),/.test(l.trim())), true);
  const ddl2 = "CREATE TABLE orders (org_id INT NOT NULL, order_id INT NOT NULL, status TEXT, amount DECIMAL(8,2), PRIMARY KEY (org_id, order_id));";
  const out2 = genSqlSampleData(ddl2, "MySQL", 3, "seed-a");
  eq("sql sample skips table constraints", out2.startsWith("INSERT INTO orders (org_id, order_id, status, amount) VALUES"), true);
  let threw = false;
  try { genSqlSampleData("   ", "PostgreSQL", 5, "x"); } catch { threw = true; }
  eq("sql sample empty input throws", threw, true);
}

'''
anchor = "// --- G2: SQL format / minify ---"
s = one(s, anchor, TESTS + anchor, 1)
p.write_text(s, encoding="utf-8")
print("verify.ts: +10 SQL sample-data regression tests")
print("PATCH OK — expect 266 passed, 0 failed")
