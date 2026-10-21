import { useMemo, useState } from "react";
import { Play, Plus, RefreshCw } from "lucide-react";
import {
  formatJson, minifyJson, sortJson, flattenJson, unflattenJson, extractKeyPaths, queryJsonPath,
  jsonToTypeScript, jsonToPython, jsonToGo, jsonToJava, jsonToCSharp, jsonToJavaScript,
  jsonToCsv, jsonToYaml, jsonToXml, jsonToSchema, validateAgainstSchema, parseJsonError,
  queryJsonPointer, applyJsonPatch, applyJsonMergePatch,
  csvParse, diffLines, wordDiff, escapeRegex, testRegex, explainRegex, REGEX_LIBRARY,
  formatCode, minifyCode, formatBytes, genUuid, genPassword, genPassphrase, genHex, genToken,
  passwordStrength, lorem, mockJson, copyText,
} from "../lib/engine";
import { ERROR_DB } from "../lib/blueprints";
import { analyzeErrorText } from "../lib/error-explorer";
import { TOOL_MAP } from "../lib/registry";
import {
  ToolScaffold, Panel, Tabs, Field, TextInput, Select, Check, Btn, CopyBtn,
  CodeArea, OutputBox, ErrorCallout, Split, ActionBar, Stat, inputCls,
} from "../components/ui";

/* ================= JSON ================= */

const JSON_TABS = [
  { id: "format", label: "Format" }, { id: "validate", label: "Validate" }, { id: "minify", label: "Minify" },
  { id: "sort", label: "Sort" }, { id: "diff", label: "Diff" }, { id: "query", label: "Query" },
  { id: "pointer", label: "Pointer" }, { id: "patch", label: "Patch" }, { id: "merge", label: "Merge Patch" },
  { id: "flatten", label: "Flatten" }, { id: "convert", label: "Convert" },
];
const CONVERTS: { id: string; label: string; fn: (s: string) => string; file: string }[] = [
  { id: "ts", label: "TypeScript", fn: (s) => jsonToTypeScript(s), file: "types.ts" },
  { id: "js", label: "JavaScript", fn: jsonToJavaScript, file: "data.js" },
  { id: "py", label: "Python", fn: jsonToPython, file: "data.py" },
  { id: "go", label: "Go", fn: jsonToGo, file: "types.go" },
  { id: "java", label: "Java", fn: jsonToJava, file: "Root.java" },
  { id: "cs", label: "C#", fn: jsonToCSharp, file: "Root.cs" },
  { id: "csv", label: "CSV", fn: jsonToCsv, file: "data.csv" },
  { id: "yaml", label: "YAML", fn: jsonToYaml, file: "data.yaml" },
  { id: "xml", label: "XML", fn: jsonToXml, file: "data.xml" },
  { id: "schema", label: "JSON Schema", fn: jsonToSchema, file: "schema.json" },
];

export function JsonTool({ initialTab = "format" }: { initialTab?: string }) {
  const tool = TOOL_MAP.json;
  const [tab, setTab] = useState(initialTab);
  const [input, setInput] = useState("");
  const [input2, setInput2] = useState("");
  const [path, setPath] = useState("$.tools[0]");
  const [conv, setConv] = useState("ts");
  const [indent, setIndent] = useState("2");

  const result = useMemo(() => {
    if (!input.trim()) return { ok: true as const, out: "", info: "" };
    try {
      const ind = Math.min(8, Math.max(0, parseInt(indent) || 2));
      switch (tab) {
        case "format": { const v = JSON.parse(input); return { ok: true as const, out: JSON.stringify(v, null, ind), info: `Valid JSON · ${formatBytes(new TextEncoder().encode(input).length)}` }; }
        case "validate": { const v = JSON.parse(input); const keys = extractKeyPaths(input); return { ok: true as const, out: `Valid JSON ✓\n\nType: ${Array.isArray(v) ? `array[${v.length}]` : typeof v}\nTop-level keys: ${v && typeof v === "object" ? Object.keys(v).length : "—"}\nTotal paths: ${keys.length}`, info: "Valid" }; }
        case "minify": return { ok: true as const, out: minifyJson(input), info: `${input.length} → ${minifyJson(input).length} chars` };
        case "sort": return { ok: true as const, out: sortJson(input), info: "Keys sorted recursively" };
        case "diff": {
          if (!input2.trim()) return { ok: true as const, out: "", info: "Paste a second document to compare" };
          const a = formatJson(input), b = formatJson(input2);
          const ops = diffLines(a, b);
          const adds = ops.filter((o) => o.type === "add").length, dels = ops.filter((o) => o.type === "del").length;
          if (!adds && !dels) return { ok: true as const, out: "Documents are identical ✓", info: "" };
          return { ok: true as const, out: ops.map((o) => `${o.type === "add" ? "+" : o.type === "del" ? "-" : " "} ${o.text}`).join("\n"), info: `+${adds} −${dels}`, diff: true as const };
        }
        case "query": { const r = queryJsonPath(input, path || "$"); return { ok: true as const, out: JSON.stringify(r, null, 2), info: Array.isArray(r) ? `${r.length} result(s)` : "1 result" }; }
        case "pointer": { const r = queryJsonPointer(input, path); return { ok: true as const, out: JSON.stringify(r, null, 2), info: path || "document root" }; }
        case "patch": {
          if (!input2.trim()) return { ok: true as const, out: "", info: "Paste an RFC 6902 patch array" };
          return { ok: true as const, out: applyJsonPatch(input, input2), info: `${(JSON.parse(input2) as unknown[]).length} operation(s) applied` };
        }
        case "merge": {
          if (!input2.trim()) return { ok: true as const, out: "", info: "Paste an RFC 7386 merge patch" };
          return { ok: true as const, out: applyJsonMergePatch(input, input2), info: "Merge patch applied" };
        }
        case "flatten": { const flat = flattenJson(input); return { ok: true as const, out: JSON.stringify(flat, null, 2), info: `${Object.keys(flat).length} paths` }; }
        case "convert": { const c = CONVERTS.find((x) => x.id === conv)!; return { ok: true as const, out: c.fn(input), info: `→ ${c.label}` }; }
        default: return { ok: true as const, out: formatJson(input), info: "" };
      }
    } catch (e) {
      const pe = parseJsonError(input, e);
      return { ok: false as const, out: "", err: pe };
    }
  }, [input, input2, tab, path, conv, indent]);

  const nextMap: Record<string, { label: string; to: string }[]> = {
    format: [{ label: "Validate JSON", to: "/json" }, { label: "Convert to YAML", to: "/convert" }, { label: "Generate TypeScript", to: "/json" }, { label: "Compare JSON", to: "/diff" }],
    minify: [{ label: "Format it back", to: "/json" }, { label: "Validate", to: "/json" }],
    query: [{ label: "Format JSON", to: "/json" }, { label: "Convert result", to: "/convert" }],
    convert: [{ label: "Validate output", to: "/convert" }, { label: "Format SQL / code", to: "/code-format" }],
    diff: [{ label: "Full diff view", to: "/diff" }],
  };

  return (
    <ToolScaffold tool={tool} next={nextMap[tab]}
      onExample={() => { setInput(tool.example?.value ?? ""); setTab("format"); }}>
      <Panel className="p-4">
        <Tabs tabs={JSON_TABS} active={tab} onChange={(next) => {
          setTab(next);
          if (next === "pointer" && path.startsWith("$")) setPath("/tools/0");
          if (next === "query" && !path.startsWith("$")) setPath("$.tools[0]");
        }} ariaLabel="JSON operations" />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {(tab === "format") && (
            <Field label="Indent"><Select value={indent} onChange={(e) => setIndent(e.target.value)} className="w-24">
              <option value="2">2 spaces</option><option value="4">4 spaces</option><option value="0">tabs→compact</option>
            </Select></Field>
          )}
          {(tab === "query" || tab === "pointer") && (
            <Field label={tab === "query" ? "JSONPath" : "JSON Pointer"} className="min-w-[240px] flex-1" hint={tab === "query" ? "Supports $.a.b[0], [*], .* and ['key']" : "RFC 6901, e.g. /tools/0/name. Use an empty pointer for the root."}>
              <TextInput value={path} onChange={(e) => setPath(e.target.value)} className="font-mono" placeholder={tab === "query" ? "$.store.book[*].title" : "/tools/0/name"} />
            </Field>
          )}
          {tab === "convert" && (
            <Field label="Target"><Select value={conv} onChange={(e) => setConv(e.target.value)} className="w-44">
              {CONVERTS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select></Field>
          )}
        </div>
        <div className="mt-3">
          {tab === "diff" ? (
            <Split
              left={<CodeArea label="Original JSON" value={input} onChange={setInput} placeholder={tool.example?.value} accept=".json" onFile={(t) => setInput(t)} />}
              right={<CodeArea label="Modified JSON" value={input2} onChange={setInput2} placeholder='{"name": "devutils", ...}' accept=".json" onFile={(t) => setInput2(t)} />}
            />
          ) : (tab === "patch" || tab === "merge") ? (
            <div>
              <Split
                left={<CodeArea label="Target JSON" value={input} onChange={setInput} placeholder={tool.example?.value} accept=".json" onFile={(t) => setInput(t)} />}
                right={<CodeArea label={tab === "patch" ? "RFC 6902 patch array" : "RFC 7386 merge patch"} value={input2} onChange={setInput2}
                  placeholder={tab === "patch" ? '[\n  { "op": "replace", "path": "/name", "value": "devutils-v2" }\n]' : '{\n  "name": "devutils-v2",\n  "obsolete": null\n}'} accept=".json" onFile={(t) => setInput2(t)} />}
              />
              <div className="mt-3">
                {!result.ok ? <ErrorCallout title="Patch failed" message={result.err.message} hint={result.err.hint} /> : <OutputBox value={result.out} label={`Patched output · ${result.info}`} filename="patched.json" rows={10} />}
              </div>
            </div>
          ) : (
            <Split
              left={<CodeArea label="Input JSON" value={input} onChange={setInput} placeholder={tool.example?.value ?? '{"hello": "world"}'} accept=".json,application/json" onFile={(t) => setInput(t)} />}
              right={
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {tab === "validate" ? "Result" : "Output"} {result.ok && result.info ? <span className="ml-1 font-normal normal-case text-emerald-600 dark:text-emerald-400">{result.info}</span> : null}
                    </span>
                  </div>
                  {!result.ok ? (
                    <ErrorCallout title="Invalid JSON" message={result.err.message} hint={result.err.hint} line={result.err.line} column={result.err.column} />
                  ) : (
                    <OutputBox value={result.out} label="" placeholder="Formatted JSON appears here" filename={tab === "convert" ? CONVERTS.find((x) => x.id === conv)?.file ?? "output.txt" : "data.json"} />
                  )}
                </div>
              }
            />
          )}
        </div>
        {tab === "diff" && (
          <div className="mt-3">
            {!result.ok ? <ErrorCallout title="Invalid JSON" message={result.err.message} hint={result.err.hint} line={result.err.line} column={result.err.column} />
              : result.out ? (
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">{result.info}</p>
                  <OutputBox value={result.out} label="" filename="diff.txt" />
                </div>
              ) : <p className="text-sm text-zinc-500">Paste both documents to see the diff.</p>}
          </div>
        )}
        {tab !== "diff" && (
          <ActionBar>
            <Btn variant="ghost" onClick={() => { setInput(""); setInput2(""); }}>Clear</Btn>
            {tool.example && !input && <Btn onClick={() => setInput(tool.example!.value)}><Play size={14} /> Load example</Btn>}
            {tab === "flatten" && result.ok && result.out && (
              <Btn onClick={() => {
                try {
                  const flat = JSON.parse(result.out);
                  const back = unflattenJson(flat);
                  copyText(JSON.stringify(back, null, 2));
                } catch { /* noop */ }
              }}>Copy unflattened</Btn>
            )}
          </ActionBar>
        )}
      </Panel>
    </ToolScaffold>
  );
}

/* ================= REGEX ================= */

export function RegexTool() {
  const tool = TOOL_MAP.regex;
  const [pattern, setPattern] = useState("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}");
  const [flags, setFlags] = useState({ g: true, i: false, m: false, s: false, u: false, y: false });
  const [text, setText] = useState("Contact maya@example.com or dev.ops@company.io for access.\nInvalid: not-an-email@, test@localhost");
  const [replace, setReplace] = useState("[redacted]");
  const [mode, setMode] = useState("test");
  const flagStr = Object.entries(flags).filter(([, v]) => v).map(([k]) => k).join("");

  const res = useMemo(() => {
    try {
      const { hits, truncated } = testRegex(pattern, flagStr, text);
      let replaced = "";
      try { replaced = text.replace(buildRe(), replace); } catch { replaced = ""; }
      return { ok: true as const, hits, truncated, replaced };
    } catch (e) { return { ok: false as const, err: (e as Error).message }; }
    function buildRe() { return new RegExp(pattern, flagStr.includes("g") ? flagStr : flagStr + "g"); }
  }, [pattern, flagStr, text, replace]);

  const highlight = useMemo(() => {
    if (!res.ok || !text) return null;
    const parts: { t: string; hit: boolean }[] = [];
    let last = 0;
    res.hits.slice(0, 200).forEach((h) => {
      if (h.index > last) parts.push({ t: text.slice(last, h.index), hit: false });
      parts.push({ t: h.match || "∅", hit: true });
      last = h.index + h.match.length;
    });
    parts.push({ t: text.slice(last), hit: false });
    return parts;
  }, [res, text]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Extract emails from text", to: "/text" }, { label: "Compare outputs", to: "/diff" }]}
      onExample={() => setPattern(tool.example?.value ?? "")}>
      <Panel className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <Field label="Pattern" hint="JS syntax — live-tested as you type">
            <TextInput value={pattern} onChange={(e) => setPattern(e.target.value)} className="font-mono" placeholder="e.g. (\d{4})-(\d{2})-(\d{2})" spellCheck={false} />
          </Field>
          <Field label="Flags">
            <div className="flex flex-wrap gap-1.5">
              {(["g", "i", "m", "s", "u", "y"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFlags({ ...flags, [f]: !flags[f] })} aria-pressed={flags[f]}
                  title={{ g: "global", i: "case-insensitive", m: "multiline ^$", s: "dotAll", u: "unicode", y: "sticky" }[f]}
                  className={`h-9 w-9 rounded-lg border font-mono text-sm font-bold transition ${flags[f] ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "border-zinc-300 text-zinc-400 dark:border-zinc-700"}`}>{f}</button>
              ))}
            </div>
          </Field>
        </div>
        <div className="mt-3">
          <Tabs tabs={[{ id: "test", label: "Test" }, { id: "replace", label: "Replace" }, { id: "explain", label: "Explain" }, { id: "library", label: "Library" }]} active={mode} onChange={setMode} />
        </div>
        {mode === "library" ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {REGEX_LIBRARY.map((r) => (
              <div key={r.name} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13.5px] font-semibold">{r.name}</p>
                  <Btn variant="ghost" className="px-2 py-1 text-xs" onClick={() => { setPattern(r.pattern); setMode("test"); }}>Use</Btn>
                </div>
                <code className="mt-1 block break-all font-mono text-[12px] text-emerald-700 dark:text-emerald-300">{r.pattern}</code>
                <p className="mt-1 text-[12px] text-zinc-500">{r.desc}</p>
              </div>
            ))}
          </div>
        ) : mode === "explain" ? (
          <div className="mt-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            {!pattern ? <p className="text-sm text-zinc-500">Type a pattern to see a token-by-token explanation.</p> : (
              <ol className="space-y-1.5">
                {explainRegex(pattern).map((e, i) => <li key={i} className="font-mono text-[12.5px] text-zinc-700 dark:text-zinc-300">{e}</li>)}
              </ol>
            )}
            <div className="mt-3 flex gap-2">
              <Btn variant="secondary" onClick={() => setPattern(escapeRegex(pattern))}>Escape pattern</Btn>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <Split
              left={<CodeArea label="Test string" value={text} onChange={setText} mono={false} rows={10} />}
              right={
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Matches {res.ok ? <span className="text-emerald-600">· {res.hits.length}{res.truncated ? "+" : ""}</span> : null}</p>
                  {!res.ok ? <ErrorCallout title="Invalid regex" message={res.err} hint="Check brackets, escapes and flags." />
                    : !res.hits.length ? <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-zinc-300 text-[13px] text-zinc-400 dark:border-zinc-700">No matches — adjust the pattern or flags.</div>
                      : (
                        <div className="max-h-[260px] overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-[12.5px] leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">
                          {highlight?.map((p, i) => p.hit
                            ? <mark key={i} className="rounded bg-emerald-200 px-0.5 text-emerald-950 dark:bg-emerald-800 dark:text-emerald-100">{p.t}</mark>
                            : <span key={i} className="text-zinc-700 dark:text-zinc-300">{p.t}</span>)}
                        </div>
                      )}
                </div>
              }
            />
            {mode === "replace" && (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <Field label="Replacement" hint="Supports $1, $2, $&, $` and $<name>">
                  <TextInput value={replace} onChange={(e) => setReplace(e.target.value)} className="font-mono" />
                </Field>
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Preview</p>
                  <OutputBox value={res.ok ? res.replaced : ""} label="" rows={4} filename="replaced.txt" />
                </div>
              </div>
            )}
            {res.ok && res.hits.length > 0 && (
              <div className="mt-3 overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full min-w-[520px] text-left text-[12.5px]">
                  <thead><tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                    <th className="px-3 py-2 font-semibold">#</th><th className="px-3 py-2 font-semibold">Match</th><th className="px-3 py-2 font-semibold">Index</th><th className="px-3 py-2 font-semibold">Groups</th>
                  </tr></thead>
                  <tbody>
                    {res.hits.slice(0, 50).map((h, i) => (
                      <tr key={i} className="border-b border-zinc-100 font-mono last:border-0 dark:border-zinc-800/60">
                        <td className="px-3 py-1.5 text-zinc-400">{i + 1}</td>
                        <td className="px-3 py-1.5 text-emerald-700 dark:text-emerald-300">{h.match || "∅"}</td>
                        <td className="px-3 py-1.5">{h.index}</td>
                        <td className="px-3 py-1.5 text-zinc-500">{h.groups.length ? h.groups.map((g, gi) => `$${gi + 1}=${g ?? "∅"}`).join("  ") : "—"}{Object.keys(h.named).length ? `  {${Object.entries(h.named).map(([k, v]) => `${k}=${v}`).join(", ")}}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Panel>
    </ToolScaffold>
  );
}

/* ================= CODE FORMAT / MINIFY ================= */

const LANGS = ["javascript", "typescript", "json", "css", "html", "xml", "sql", "yaml", "markdown", "graphql"];

export function CodeFormatTool() {
  const tool = TOOL_MAP["code-format"];
  const [lang, setLang] = useState("javascript");
  const [input, setInput] = useState("");
  const [out, setOut] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const run = () => {
    try { setOut(formatCode(lang, input)); setErr(null); }
    catch (e) { setErr((e as Error).message); setOut(""); }
  };
  return (
    <ToolScaffold tool={tool} next={[{ label: "Minify output", to: "/code-minify" }, { label: "Compare versions", to: "/diff" }]}>
      <Panel className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Language"><Select value={lang} onChange={(e) => setLang(e.target.value)} className="w-44">
            {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select></Field>
          <Btn variant="primary" onClick={run}><Play size={14} /> Format (Ctrl+Enter)</Btn>
        </div>
        <div className="mt-3">
          <Split
            left={<CodeArea label={`Input · ${lang}`} value={input} onChange={setInput} placeholder="Paste code here…" />}
            right={err ? <ErrorCallout title="Cannot format" message={err} /> : <OutputBox value={out} filename={`formatted.${lang === "typescript" ? "ts" : lang === "javascript" ? "js" : lang}`} placeholder="Formatted code appears here" />}
          />
        </div>
      </Panel>
    </ToolScaffold>
  );
}

export function CodeMinifyTool() {
  const tool = TOOL_MAP["code-minify"];
  const [lang, setLang] = useState("javascript");
  const [input, setInput] = useState("");
  const res = useMemo(() => {
    if (!input.trim()) return null;
    try { return { ok: true as const, ...minifyCode(lang, input) }; }
    catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [input, lang]);
  const saved = res?.ok ? res.before - res.after : 0;
  return (
    <ToolScaffold tool={tool} next={[{ label: "Format it back", to: "/code-format" }]}>
      <Panel className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Language"><Select value={lang} onChange={(e) => setLang(e.target.value)} className="w-44">
            <option value="javascript">JavaScript</option><option value="css">CSS</option><option value="html">HTML</option><option value="json">JSON</option>
          </Select></Field>
          {res?.ok && (
            <div className="flex gap-2">
              <Stat label="Before" value={formatBytes(res.before)} /><Stat label="After" value={formatBytes(res.after)} />
              <Stat label="Saved" value={`${formatBytes(saved)} (${res.before ? Math.round((saved / res.before) * 100) : 0}%)`} />
            </div>
          )}
        </div>
        <div className="mt-3">
          <Split
            left={<CodeArea label="Input" value={input} onChange={setInput} placeholder="Paste code to minify…" />}
            right={!res ? <OutputBox value="" placeholder="Minified output appears here" /> : !res.ok ? <ErrorCallout title="Cannot minify" message={res.err} /> : <OutputBox value={res.output} filename={`minified.${lang === "javascript" ? "js" : lang}`} />}
          />
        </div>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= DIFF ================= */

export function DiffTool() {
  const tool = TOOL_MAP.diff;
  const [a, setA] = useState('{\n  "name": "api",\n  "replicas": 2,\n  "debug": true\n}');
  const [b, setB] = useState('{\n  "name": "api",\n  "replicas": 3,\n  "debug": false\n}');
  const [view, setView] = useState<"side" | "unified">("side");
  const ops = useMemo(() => diffLines(a, b), [a, b]);
  const adds = ops.filter((o) => o.type === "add").length;
  const dels = ops.filter((o) => o.type === "del").length;
  const leftLines = ops.filter((o) => o.type !== "add");
  const rightLines = ops.filter((o) => o.type !== "del");
  const row = (o: { type: string; text: string }, i: number) => (
    <div key={i} className={`flex gap-2 px-3 py-[3px] font-mono text-[12.5px] leading-relaxed ${o.type === "add" ? "diff-add text-emerald-900 dark:text-emerald-200" : o.type === "del" ? "diff-del text-red-900 dark:text-red-200" : "text-zinc-600 dark:text-zinc-400"}`}>
      <span className="w-4 shrink-0 select-none text-center opacity-60">{o.type === "add" ? "+" : o.type === "del" ? "−" : " "}</span>
      <span className="whitespace-pre-wrap break-all">{o.text || " "}</span>
    </div>
  );
  return (
    <ToolScaffold tool={tool} next={[{ label: "Format JSON first", to: "/json" }, { label: "Clean text", to: "/text" }]}>
      <Panel className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs tabs={[{ id: "side", label: "Side-by-side" }, { id: "unified", label: "Unified" }]} active={view} onChange={(v) => setView(v as "side" | "unified")} />
          <span className="font-mono text-[12.5px] text-zinc-500">+{adds} −{dels} {adds === 0 && dels === 0 ? "· identical ✓" : ""}</span>
          <span className="ml-auto flex gap-2">
            <Btn variant="ghost" onClick={() => { setA(""); setB(""); }}>Clear</Btn>
            <CopyBtn text={ops.filter((o) => o.type !== "same").map((o) => `${o.type === "add" ? "+" : "-"} ${o.text}`).join("\n")} label="Copy changes" />
          </span>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <CodeArea label="Original" value={a} onChange={setA} rows={9} />
          <CodeArea label="Modified" value={b} onChange={setB} rows={9} />
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          {view === "unified" ? (
            <div className="max-h-[380px] overflow-auto py-2">{ops.map(row)}</div>
          ) : (
            <div className="grid max-h-[380px] overflow-auto md:grid-cols-2">
              <div className="border-r border-zinc-200 py-2 dark:border-zinc-800">
                <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Original</p>
                {leftLines.map(row)}
              </div>
              <div className="py-2">
                <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Modified</p>
                {rightLines.map(row)}
              </div>
            </div>
          )}
        </div>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= GENERATORS ================= */

export function GeneratorsTool() {
  const tool = TOOL_MAP.generators;
  const [tab, setTab] = useState("uuid");
  const [count, setCount] = useState(5);
  const [pwLen, setPwLen] = useState(20);
  const [pwOpts, setPwOpts] = useState({ upper: true, lower: true, digits: true, symbols: false });
  const [words, setWords] = useState(4);
  const [seed, setSeed] = useState(0);
  const [min, setMin] = useState("1");
  const [max, setMax] = useState("100");
  const [strLen, setStrLen] = useState(16);
  const [paras, setParas] = useState(3);
  const [mockN, setMockN] = useState(5);

  const out = useMemo(() => {
    void seed;
    const n = Math.min(100, Math.max(1, count));
    try {
      switch (tab) {
        case "uuid": return Array.from({ length: n }, genUuid).join("\n");
        case "password": return Array.from({ length: n }, () => genPassword(pwLen, pwOpts)).join("\n");
        case "passphrase": return Array.from({ length: n }, () => genPassphrase(words)).join("\n");
        case "token": return Array.from({ length: n }, () => genToken(32)).join("\n");
        case "hex": return Array.from({ length: n }, () => genHex(16)).join("\n");
        case "number": { const lo = +min || 0, hi = +max || 100; const arr = secureNums(n, lo, hi); return arr.join("\n"); }
        case "string": return Array.from({ length: n }, () => randStr(strLen)).join("\n");
        case "mock": return mockJson(mockN);
        case "lorem": return lorem(paras);
        default: return "";
      }
    } catch (e) { return `Error: ${(e as Error).message}`; }
    function secureNums(k: number, lo: number, hi: number) {
      const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
      const range = b - a + 1;
      const bytes = new Uint32Array(k);
      crypto.getRandomValues(bytes);
      return [...bytes].map((v) => String(a + (v % range)));
    }
    function randStr(len: number) {
      const pool = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
      const bytes = new Uint8Array(len);
      crypto.getRandomValues(bytes);
      return [...bytes].map((v) => pool[v % pool.length]).join("");
    }
  }, [tab, count, pwLen, pwOpts, words, seed, min, max, strLen, paras, mockN]);

  const strength = tab === "password" ? passwordStrength(out.split("\n")[0] || "") : null;

  return (
    <ToolScaffold tool={tool} next={[{ label: "Check password entropy", to: "/secrets" }, { label: "Hash a token", to: "/hash" }]}>
      <Panel className="p-4">
        <Tabs tabs={[{ id: "uuid", label: "UUID" }, { id: "password", label: "Password" }, { id: "passphrase", label: "Passphrase" }, { id: "token", label: "Token" }, { id: "hex", label: "Hex" }, { id: "number", label: "Number" }, { id: "string", label: "String" }, { id: "mock", label: "Mock JSON" }, { id: "lorem", label: "Lorem" }]} active={tab} onChange={setTab} />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {tab !== "mock" && tab !== "lorem" && (
            <Field label="Count"><Select value={String(count)} onChange={(e) => setCount(+e.target.value)} className="w-24">
              {[1, 5, 10, 25, 50].map((v) => <option key={v} value={v}>{v}</option>)}
            </Select></Field>
          )}
          {tab === "password" && (
            <>
              <Field label="Length"><input type="range" min={8} max={64} value={pwLen} onChange={(e) => setPwLen(+e.target.value)} className="w-36 accent-emerald-600" aria-label="Password length" /><span className="font-mono text-xs">{pwLen}</span></Field>
              <Check label="A–Z" checked={pwOpts.upper} onChange={(v) => setPwOpts({ ...pwOpts, upper: v })} />
              <Check label="a–z" checked={pwOpts.lower} onChange={(v) => setPwOpts({ ...pwOpts, lower: v })} />
              <Check label="0–9" checked={pwOpts.digits} onChange={(v) => setPwOpts({ ...pwOpts, digits: v })} />
              <Check label="!@#" checked={pwOpts.symbols} onChange={(v) => setPwOpts({ ...pwOpts, symbols: v })} />
              {strength && <Stat label={`Strength · ${strength.label}`} value={`${strength.entropy} bits · cracked in ${strength.crack}`} />}
            </>
          )}
          {tab === "passphrase" && <Field label="Words"><Select value={String(words)} onChange={(e) => setWords(+e.target.value)} className="w-24">{[3, 4, 5, 6, 8].map((v) => <option key={v} value={v}>{v}</option>)}</Select></Field>}
          {tab === "number" && (<><Field label="Min"><TextInput value={min} onChange={(e) => setMin(e.target.value)} className="w-24 font-mono" /></Field><Field label="Max"><TextInput value={max} onChange={(e) => setMax(e.target.value)} className="w-24 font-mono" /></Field></>)}
          {tab === "string" && <Field label="Length"><TextInput value={String(strLen)} onChange={(e) => setStrLen(+e.target.value || 16)} className="w-24 font-mono" /></Field>}
          {tab === "mock" && <Field label="Records"><Select value={String(mockN)} onChange={(e) => setMockN(+e.target.value)} className="w-24">{[3, 5, 10, 25].map((v) => <option key={v} value={v}>{v}</option>)}</Select></Field>}
          {tab === "lorem" && <Field label="Paragraphs"><Select value={String(paras)} onChange={(e) => setParas(+e.target.value)} className="w-24">{[1, 2, 3, 5].map((v) => <option key={v} value={v}>{v}</option>)}</Select></Field>}
          <Btn variant="primary" onClick={() => setSeed((s) => s + 1)}><RefreshCw size={14} /> Regenerate</Btn>
        </div>
        <div className="mt-3"><OutputBox value={out} filename="generated.txt" rows={tab === "mock" || tab === "lorem" ? 14 : 8} /></div>
        <p className="mt-2 text-[12px] text-zinc-500">Generated with <code className="font-mono">crypto.getRandomValues</code> — suitable for secrets, not stored anywhere.</p>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= JSON SCHEMA ================= */

export function JsonSchemaTool() {
  const tool = TOOL_MAP.jsonschema;
  const [sample, setSample] = useState('{\n  "name": "api",\n  "port": 8080,\n  "debug": false,\n  "tags": ["web"]\n}');
  const [instance, setInstance] = useState('{\n  "name": "api",\n  "port": "8080",\n  "debug": false\n}');
  const schema = useMemo(() => { try { return jsonToSchema(sample || "{}"); } catch (e) { return `Error: ${(e as Error).message}`; } }, [sample]);
  const verdict = useMemo(() => {
    try {
      if (schema.startsWith("Error")) return { ok: false as const, msg: schema };
      const errors = validateAgainstSchema(JSON.parse(instance || "null"), JSON.parse(schema));
      return errors.length ? { ok: false as const, msg: errors.join("\n") } : { ok: true as const, msg: "Instance is valid against the schema ✓" };
    } catch (e) { return { ok: false as const, msg: (e as Error).message }; }
  }, [schema, instance]);
  return (
    <ToolScaffold tool={tool} next={[{ label: "Format JSON", to: "/json" }, { label: "Convert data", to: "/convert" }]}>
      <Panel className="p-4">
        <Split
          left={<><CodeArea label="Sample JSON → schema" value={sample} onChange={setSample} rows={10} /><div className="mt-3"><OutputBox value={schema} label="Inferred schema" filename="schema.json" rows={10} /></div></>}
          right={<><CodeArea label="Instance to validate" value={instance} onChange={setInstance} rows={10} />
            <div className={`mt-3 rounded-xl border p-3.5 text-sm ${verdict.ok ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"}`}>
              <p className={`font-semibold ${verdict.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{verdict.ok ? "Valid" : "Invalid"}</p>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-[12.5px]">{verdict.msg}</pre>
            </div></>}
        />
      </Panel>
    </ToolScaffold>
  );
}

/* ================= ERROR EXPLAINER ================= */

export function ErrorTool() {
  const tool = TOOL_MAP.errors;
  const [mode, setMode] = useState("explore");
  const [pasted, setPasted] = useState("");
  const [q, setQ] = useState("");
  const [area, setArea] = useState("all");
  const analysis = useMemo(() => analyzeErrorText(pasted), [pasted]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ERROR_DB.filter((e) => (area === "all" || e.area === area) && (!t || e.title.toLowerCase().includes(t) || e.match.some((m) => t.includes(m) || m.includes(t)) || e.cause.toLowerCase().includes(t)));
  }, [q, area]);
  const areas = [...new Set(ERROR_DB.map((entry) => entry.area))].sort();
  return (
    <ToolScaffold tool={tool} next={[{ label: "Clean the surrounding logs", to: "/logs" }, { label: "Kubernetes Toolkit", to: "/kubernetes" }, { label: "HTTP statuses", to: "/http" }]}>
      <Panel className="p-4">
        <Tabs tabs={[{ id: "explore", label: "Explore pasted error" }, { id: "reference", label: "Error reference" }]} active={mode} onChange={setMode} />
        {mode === "explore" ? (
          <div className="mt-3">
            <CodeArea label="Error, stack trace, log excerpt, or kubectl describe output" value={pasted} onChange={setPasted} rows={9}
              placeholder={'Paste an error such as:\nECONNREFUSED 127.0.0.1:5432\n\nor the output of kubectl describe pod …'} accept=".log,.txt" onFile={(text) => setPasted(text)} />
            <p className="mt-2 text-[12px] text-zinc-500">Deterministic pattern matching only. Input stays in this tab and is never persisted.</p>
            {!pasted.trim() ? (
              <div className="mt-3 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-[13px] text-zinc-500 dark:border-zinc-700">Paste an error to detect known Linux, Docker, Kubernetes, HTTP, network, npm, Git and Terraform patterns.</div>
            ) : analysis.matches.length === 0 ? (
              <div className="mt-3"><ErrorCallout title="No known pattern found" message="The text did not match the deterministic error reference." hint="Search the reference tab by a shorter error token, or inspect the first failing line in Logs Toolkit." /></div>
            ) : (
              <div className="mt-3 space-y-3">
                {Object.keys(analysis.facts).length > 0 && (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Extracted facts · {analysis.format}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {Object.entries(analysis.facts).map(([key, value]) => <div key={key}><span className="text-[11.5px] font-semibold text-zinc-500">{key}</span><pre className="mt-0.5 whitespace-pre-wrap font-mono text-[12px]">{value}</pre></div>)}
                    </div>
                  </div>
                )}
                {analysis.matches.map(({ doc, score, evidence }, index) => (
                  <div key={doc.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-zinc-400">#{index + 1} · score {score}</span>
                      <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[12px] font-bold dark:bg-zinc-800">{doc.title}</code>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800">{doc.area}</span>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div><p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">What happened / why</p><p className="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{doc.cause}</p></div>
                      <div><p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">What to check / common fixes</p><ul className="mt-1 space-y-1">{doc.fix.map((fix, i) => <li key={i} className="flex gap-1.5 font-mono text-[11.5px] text-zinc-600 dark:text-zinc-400"><Plus size={12} className="mt-0.5 shrink-0 text-emerald-500" />{fix}</li>)}</ul></div>
                    </div>
                    {evidence.length > 0 && <pre className="mt-3 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-100 p-2 font-mono text-[11px] text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">{evidence.join("\n")}</pre>}
                    <a href={`#${TOOL_MAP[doc.tool]?.route ?? "/tools"}`} className="mt-2 inline-block text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-300">Open {TOOL_MAP[doc.tool]?.name ?? "related tool"} →</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Search error" className="min-w-[220px] flex-1">
                <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. CrashLoopBackOff, 502, EADDRINUSE, npm ERR…" className="font-mono" />
              </Field>
              <Field label="Area"><Select value={area} onChange={(e) => setArea(e.target.value)} className="w-44">
                <option value="all">All areas</option>{areas.map((value) => <option key={value}>{value}</option>)}
              </Select></Field>
            </div>
            <p className="mt-2 text-[12.5px] text-zinc-500">Deterministic reference, not AI. {list.length} error{list.length === 1 ? "" : "s"}.</p>
            <div className="mt-3 grid gap-2.5 md:grid-cols-2">
              {list.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-zinc-200 p-3.5 dark:border-zinc-800">
                  <div className="flex items-center gap-2"><code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[12px] font-bold dark:bg-zinc-800">{entry.title}</code><span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800">{entry.area}</span></div>
                  <p className="mt-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400"><span className="font-semibold text-zinc-800 dark:text-zinc-200">Cause: </span>{entry.cause}</p>
                  <ul className="mt-1.5 space-y-1">{entry.fix.map((fix, i) => <li key={i} className="flex gap-1.5 font-mono text-[12px] text-zinc-600 dark:text-zinc-400"><Plus size={12} className="mt-0.5 shrink-0 text-emerald-500" />{fix}</li>)}</ul>
                  <a href={`#${TOOL_MAP[entry.tool]?.route ?? "/tools"}`} className="mt-2 inline-block text-[12.5px] font-medium text-emerald-700 dark:text-emerald-300">Open {TOOL_MAP[entry.tool]?.name ?? "related tool"} →</a>
                </div>
              ))}
              {!list.length && <p className="text-sm text-zinc-500">No matches. Try “502”, “OOMKilled” or “permission denied”.</p>}
            </div>
          </div>
        )}
      </Panel>
    </ToolScaffold>
  );
}

/* re-export for csv helper used elsewhere */
export { csvParse };
export function csvToJsonWrap(s: string) { return JSON.stringify(csvParse(s), null, 2); }
void inputCls;
void wordDiff;
