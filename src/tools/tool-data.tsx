import { useMemo, useState } from "react";
import {
  jsonToYaml, yamlToJson, jsonToCsv, csvToJson, jsonToXml, xmlToJson, jsonToToml, tomlToJson,
  formatSql, minifySql, genSqlSampleData, yamlParse, csvParse, diffLines, parseJsonError,
} from "../lib/engine";
import { TOOL_MAP } from "../lib/registry";
import {
  ToolScaffold, Panel, Field, TextInput, Select, Btn, CopyBtn,
  CodeArea, OutputBox, ErrorCallout, Split, ActionBar, Stat,
} from "../components/ui";

type ConvId = "j2y" | "y2j" | "j2c" | "c2j" | "j2x" | "x2j" | "t2j" | "j2t";
const CONVS: { id: ConvId; label: string; from: string; to: string; file: string }[] = [
  { id: "j2y", label: "JSON → YAML", from: "JSON", to: "YAML", file: "data.yaml" },
  { id: "y2j", label: "YAML → JSON", from: "YAML", to: "JSON", file: "data.json" },
  { id: "j2c", label: "JSON → CSV", from: "JSON (array of objects)", to: "CSV", file: "data.csv" },
  { id: "c2j", label: "CSV → JSON", from: "CSV", to: "JSON", file: "data.json" },
  { id: "j2x", label: "JSON → XML", from: "JSON", to: "XML", file: "data.xml" },
  { id: "x2j", label: "XML → JSON", from: "XML", to: "JSON", file: "data.json" },
  { id: "j2t", label: "JSON → TOML", from: "JSON (flat object)", to: "TOML", file: "data.toml" },
  { id: "t2j", label: "TOML → JSON", from: "TOML", to: "JSON", file: "data.json" },
];

export function ConverterTool() {
  const tool = TOOL_MAP.converter;
  const [conv, setConv] = useState<ConvId>("j2y");
  const [input, setInput] = useState('{\n  "service": "api",\n  "port": 8080,\n  "env": { "LOG_LEVEL": "info" },\n  "tags": ["web", "v2"]\n}');
  const meta = CONVS.find((c) => c.id === conv)!;

  const res = useMemo(() => {
    if (!input.trim()) return { ok: true as const, out: "" };
    try {
      let out = "";
      switch (conv) {
        case "j2y": out = jsonToYaml(input); break;
        case "y2j": out = yamlToJson(input); break;
        case "j2c": out = jsonToCsv(input); break;
        case "c2j": out = csvToJson(input); break;
        case "j2x": out = jsonToXml(input); break;
        case "x2j": out = xmlToJson(input); break;
        case "j2t": out = jsonToToml(input); break;
        case "t2j": out = tomlToJson(input); break;
      }
      return { ok: true as const, out };
    } catch (e) {
      const msg = (e as Error).message;
      if (/JSON/.test(meta.from)) {
        try { JSON.parse(input); } catch (je) { const pe = parseJsonError(input, je); return { ok: false as const, err: pe.message, hint: pe.hint, line: pe.line, column: pe.column }; }
      }
      return { ok: false as const, err: msg, hint: convHint(conv), line: 0, column: 0 };
    }
  }, [input, conv, meta]);

  function convHint(c: ConvId): string {
    switch (c) {
      case "j2c": return "JSON → CSV needs an array of flat objects, e.g. [{\"a\":1},{\"a\":2}]. Nested objects are stringified.";
      case "j2t": return "TOML needs a top-level object with scalar or one-level sections — no nulls, no deep nesting.";
      case "y2j": return "Check indentation (2 spaces), colons after keys, and that quotes are balanced.";
      case "x2j": return "XML must have a single root element and matched tags.";
      default: return "";
    }
  }

  return (
    <ToolScaffold tool={tool} next={[{ label: "Validate the JSON", to: "/json" }, { label: "Format as SQL seed", to: "/sql" }, { label: "Generate schema", to: "/json-schema" }]}>
      <Panel className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Conversion"><Select value={conv} onChange={(e) => setConv(e.target.value as ConvId)} className="w-52">
            {CONVS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select></Field>
          <button type="button" onClick={() => {
            const pairs: Record<ConvId, ConvId> = { j2y: "y2j", y2j: "j2y", j2c: "c2j", c2j: "j2c", j2x: "x2j", x2j: "j2x", j2t: "t2j", t2j: "j2t" };
            const next = pairs[conv];
            if (res.ok && res.out) setInput(res.out);
            setConv(next);
          }} className="mb-[1px] rounded-lg border border-zinc-300 px-3 py-2 text-[13px] font-medium dark:border-zinc-700" title="Swap direction (uses current output as input)">⇅ Reverse</button>
          <span className="mb-2 font-mono text-[12px] text-zinc-400">{meta.from} → {meta.to}</span>
        </div>
        <div className="mt-3">
          <Split
            left={<CodeArea label={`Input · ${meta.from}`} value={input} onChange={setInput} rows={14} accept=".json,.yaml,.yml,.csv,.xml,.toml" onFile={(t) => setInput(t)} />}
            right={
              !res.ok ? <ErrorCallout title={`Cannot convert to ${meta.to}`} message={res.err} hint={res.hint} line={res.line} column={res.column} />
                : <OutputBox value={res.out} label={`Output · ${meta.to}`} filename={meta.file} rows={14} />
            }
          />
        </div>
        <ActionBar>
          <Btn variant="ghost" onClick={() => setInput("")}>Clear</Btn>
          <span className="text-[12px] text-zinc-500">Only round-trip-safe conversions are exposed. YAML covers the common subset (maps, lists, scalars, nesting).</span>
        </ActionBar>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= SQL ================= */

type Dialect = "PostgreSQL" | "MySQL" | "SQL Server" | "SQLite";

export function SqlTool() {
  const tool = TOOL_MAP.sql;
  const [tab, setTab] = useState("format");
  const [dialect, setDialect] = useState<Dialect>("PostgreSQL");
  const [input, setInput] = useState("select id, name, created_at from users where active = true and created_at > '2024-01-01' order by created_at desc limit 50;");
  const [tName, setTName] = useState("users");
  const [cols, setCols] = useState("id SERIAL PRIMARY KEY\nname TEXT NOT NULL\nemail TEXT UNIQUE NOT NULL\ncreated_at TIMESTAMPTZ DEFAULT now()");
  const [insTable, setInsTable] = useState("users");
  const [insCols, setInsCols] = useState("name, email");
  const [insRows, setInsRows] = useState("'Maya', 'maya@example.com'\n'Liam', 'liam@example.com'");
  const [selTable, setSelTable] = useState("users");
  const [selCols, setSelCols] = useState("id, name, email");
  const [selWhere, setSelWhere] = useState("active = true");
  const [selLimit, setSelLimit] = useState("50");
  const [connDb, setConnDb] = useState<Dialect>("PostgreSQL");
  const [connHost, setConnHost] = useState("localhost");
  const [connPort, setConnPort] = useState("5432");
  const [connDbName, setConnDbName] = useState("app");
  const [connUser, setConnUser] = useState("postgres");
  const [diffB, setDiffB] = useState("select id, name from users;");
  const [sdInput, setSdInput] = useState("CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  name TEXT NOT NULL,\n  email TEXT NOT NULL UNIQUE,\n  is_admin BOOLEAN DEFAULT false,\n  balance NUMERIC(10,2),\n  bio TEXT,\n  created_at TIMESTAMPTZ DEFAULT now()\n);");
  const [sdRows, setSdRows] = useState("10");
  const [sdSeed, setSdSeed] = useState("devutils");

  const res = useMemo(() => {
    try {
      if (tab === "format") { if (!input.trim()) return { ok: true as const, out: "" }; return { ok: true as const, out: formatSql(input) }; }
      if (tab === "minify") { if (!input.trim()) return { ok: true as const, out: "" }; return { ok: true as const, out: minifySql(input) }; }
      if (tab === "create") {
        if (!tName.trim()) throw new Error("Table name is required.");
        const lines = cols.split("\n").map((l) => l.trim()).filter(Boolean);
        if (!lines.length) throw new Error("Add at least one column (one per line).");
        return { ok: true as const, out: `CREATE TABLE ${tName.trim()} (\n  ${lines.join(",\n  ")}\n);` };
      }
      if (tab === "insert") {
        const rows = insRows.split("\n").map((l) => l.trim()).filter(Boolean);
        if (!rows.length) throw new Error("Add at least one row (comma-separated values per line).");
        return { ok: true as const, out: `INSERT INTO ${insTable.trim() || "table"} (${insCols.trim() || "col"}) VALUES\n  ${rows.map((r) => `(${r})`).join(",\n  ")};` };
      }
      if (tab === "select") {
        return { ok: true as const, out: formatSql(`select ${selCols || "*"} from ${selTable || "table"}${selWhere.trim() ? ` where ${selWhere}` : ""}${selLimit.trim() ? ` limit ${selLimit}` : ""}`) };
      }
      if (tab === "conn") {
        const p = connPort.trim() || (connDb === "PostgreSQL" ? "5432" : connDb === "MySQL" ? "3306" : connDb === "SQL Server" ? "1433" : "");
        const urls: Record<Dialect, string> = {
          PostgreSQL: `postgresql://${connUser}@${connHost}${p ? `:${p}` : ""}/${connDbName}`,
          MySQL: `mysql://${connUser}@${connHost}${p ? `:${p}` : ""}/${connDbName}`,
          "SQL Server": `Server=${connHost}${p ? `,${p}` : ""};Database=${connDbName};User Id=${connUser};`,
          SQLite: `${connDbName || "app"}.db`,
        };
        return { ok: true as const, out: urls[connDb] };
      }
      if (tab === "sample") {
        return { ok: true as const, out: genSqlSampleData(sdInput, dialect, Number(sdRows) || 10, sdSeed) };
      }
      // diff
      const ops = diffLines(input, diffB);
      return { ok: true as const, out: ops.map((o) => `${o.type === "add" ? "+" : o.type === "del" ? "-" : " "} ${o.text}`).join("\n") };
    } catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [tab, input, dialect, tName, cols, insTable, insCols, insRows, selTable, selCols, selWhere, selLimit, connDb, connHost, connPort, connDbName, connUser, sdInput, sdRows, sdSeed, diffB]);

  void dialect;

  return (
    <ToolScaffold tool={tool} next={[{ label: "Seed from CSV/JSON", to: "/convert" }, { label: "Compare queries", to: "/diff" }]}>
      <Panel className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
            {[["format", "Format"], ["minify", "Minify"], ["create", "CREATE TABLE"], ["insert", "INSERT"], ["select", "SELECT"], ["conn", "Connection"], ["sample", "Sample data"], ["diff", "Diff"]].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${tab === id ? "bg-white shadow-sm dark:bg-zinc-800" : "text-zinc-500"}`}>{label}</button>
            ))}
          </div>
          {(tab === "format" || tab === "minify" || tab === "sample") && (
            <Field label="Dialect"><Select value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)} className="w-40">
              <option>PostgreSQL</option><option>MySQL</option><option>SQL Server</option><option>SQLite</option>
            </Select></Field>
          )}
        </div>
        <p className="mt-2 rounded-lg bg-zinc-100 px-3 py-1.5 text-[12px] text-zinc-500 dark:bg-zinc-900">Formatting only — DevUtils never executes SQL against any server.</p>
        <div className="mt-3">
          {(tab === "format" || tab === "minify") && (
            <Split left={<CodeArea label="SQL input" value={input} onChange={setInput} rows={12} placeholder="select …" />}
              right={!res.ok ? <ErrorCallout title="Cannot process" message={res.err} /> : <OutputBox value={res.out} label={tab === "format" ? "Formatted" : "Minified"} filename="query.sql" rows={12} />} />
          )}
          {tab === "create" && (
            <Split left={<div className="space-y-3">
              <Field label="Table"><TextInput value={tName} onChange={(e) => setTName(e.target.value)} className="font-mono" /></Field>
              <Field label="Columns (one per line)" hint="e.g. id SERIAL PRIMARY KEY"><textarea value={cols} onChange={(e) => setCols(e.target.value)} rows={7} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-[13px] dark:border-zinc-700 dark:bg-zinc-900" /></Field>
            </div>} right={!res.ok ? <ErrorCallout title="Cannot generate" message={res.err} /> : <OutputBox value={res.out} label="DDL" filename="create.sql" />} />
          )}
          {tab === "insert" && (
            <Split left={<div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Table"><TextInput value={insTable} onChange={(e) => setInsTable(e.target.value)} className="font-mono" /></Field>
                <Field label="Columns"><TextInput value={insCols} onChange={(e) => setInsCols(e.target.value)} className="font-mono" /></Field>
              </div>
              <Field label="Rows (one per line, quote strings)"><textarea value={insRows} onChange={(e) => setInsRows(e.target.value)} rows={5} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-[13px] dark:border-zinc-700 dark:bg-zinc-900" /></Field>
            </div>} right={!res.ok ? <ErrorCallout title="Cannot generate" message={res.err} /> : <OutputBox value={res.out} label="INSERT" filename="insert.sql" />} />
          )}
          {tab === "select" && (
            <Split left={<div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Table"><TextInput value={selTable} onChange={(e) => setSelTable(e.target.value)} className="font-mono" /></Field>
                <Field label="LIMIT"><TextInput value={selLimit} onChange={(e) => setSelLimit(e.target.value)} className="font-mono" /></Field>
              </div>
              <Field label="Columns"><TextInput value={selCols} onChange={(e) => setSelCols(e.target.value)} className="font-mono" /></Field>
              <Field label="WHERE"><TextInput value={selWhere} onChange={(e) => setSelWhere(e.target.value)} className="font-mono" /></Field>
            </div>} right={!res.ok ? <ErrorCallout title="Cannot generate" message={res.err} /> : <OutputBox value={res.out} label="SELECT" filename="select.sql" />} />
          )}
          {tab === "conn" && (
            <Split left={<div className="space-y-3">
              <Field label="Database"><Select value={connDb} onChange={(e) => { setConnDb(e.target.value as Dialect); setConnPort(e.target.value === "PostgreSQL" ? "5432" : e.target.value === "MySQL" ? "3306" : e.target.value === "SQL Server" ? "1433" : ""); }}>
                <option>PostgreSQL</option><option>MySQL</option><option>SQL Server</option><option>SQLite</option>
              </Select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Host"><TextInput value={connHost} onChange={(e) => setConnHost(e.target.value)} className="font-mono" /></Field>
                <Field label="Port"><TextInput value={connPort} onChange={(e) => setConnPort(e.target.value)} className="font-mono" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Database"><TextInput value={connDbName} onChange={(e) => setConnDbName(e.target.value)} className="font-mono" /></Field>
                <Field label="User"><TextInput value={connUser} onChange={(e) => setConnUser(e.target.value)} className="font-mono" /></Field>
              </div>
            </div>} right={<div>
              {!res.ok ? <ErrorCallout title="Error" message={res.err} /> : <OutputBox value={res.out} label="Connection string" filename="conn.txt" />}
              <p className="mt-2 text-[12px] text-zinc-500">Passwords are intentionally omitted — inject via env vars or a secrets manager.</p>
            </div>} />
          )}
          {tab === "sample" && (
            <Split left={<div className="space-y-3">
              <Field label="CREATE TABLE statement" hint="Paste DDL — table-level constraints are skipped"><textarea value={sdInput} onChange={(e) => setSdInput(e.target.value)} rows={9} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-[13px] dark:border-zinc-700 dark:bg-zinc-900" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rows (1–500)"><TextInput value={sdRows} onChange={(e) => setSdRows(e.target.value)} className="font-mono" /></Field>
                <Field label="Seed" hint="Same seed → same data"><TextInput value={sdSeed} onChange={(e) => setSdSeed(e.target.value)} className="font-mono" /></Field>
              </div>
            </div>} right={!res.ok ? <ErrorCallout title="Cannot generate" message={res.err} /> : <OutputBox value={res.out} label="Sample INSERT" filename="sample.sql" rows={12} />} />
          )}
          {tab === "diff" && (
            <Split left={<><CodeArea label="Query A" value={input} onChange={setInput} rows={8} /><div className="mt-3"><CodeArea label="Query B" value={diffB} onChange={setDiffB} rows={8} /></div></>}
              right={!res.ok ? <ErrorCallout title="Error" message={res.err} /> : <OutputBox value={res.out} label="Diff" filename="sql.diff" rows={12} />} />
          )}
        </div>
        {(tab === "format") && res.ok && res.out && (
          <div className="mt-2 flex gap-4 font-mono text-[12px] text-zinc-500">
            <span>{input.length} → {res.out.length} chars</span>
            <CopyBtn text={res.out} />
          </div>
        )}
        <ActionBar><span className="hidden" /></ActionBar>
        <ValidatorStrip />
      </Panel>
    </ToolScaffold>
  );
}

function ValidatorStrip() {
  const [v, setV] = useState("");
  const parsed = useMemo(() => {
    if (!v.trim()) return null;
    const t = v.trim();
    try {
      if (/^[{[]/.test(t)) { JSON.parse(t); return "Valid JSON sample ✓"; }
      yamlParse(t); return "Parses as YAML ✓";
    } catch { /* try csv */ }
    try {
      const rows = csvParse(t);
      if (rows.length) return `Valid CSV ✓ — ${rows.length} row(s), columns: ${Object.keys(rows[0]).join(", ")}`;
    } catch { /* noop */ }
    return "Could not parse as JSON, YAML or CSV — check the Data Converter for details.";
  }, [v]);
  if (false) return null;
  void parsed;
  return <div className="hidden"><textarea value={v} onChange={(e) => setV(e.target.value)} /></div>;
}
void Stat;
