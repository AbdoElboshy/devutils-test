import { useMemo, useState } from "react";
import {
  phpSerialize, phpUnserialize, htmlToJsx, colorFormats,
  markdownToHtml, genUlid, validateUlid, convertBase, type ColorReport,
} from "../lib/phase7-engine";
import { TOOL_MAP } from "../lib/registry";
import {
  ToolScaffold, Panel, Field, TextInput, Select, Btn, CopyBtn,
  CodeArea, OutputBox, ErrorCallout, Split, ActionBar, Stat,
} from "../components/ui";

/* ================= PHP serialize ================= */

const PHP_EXAMPLE = "a:2:{s:4:\"name\";s:4:\"Maya\";s:3:\"age\";i:30;}";

export function PhpSerializeTool() {
  const tool = TOOL_MAP["php-serialize"];
  const [mode, setMode] = useState<"j2p" | "p2j">("p2j");
  const [input, setInput] = useState(PHP_EXAMPLE);
  const res = useMemo(() => {
    if (!input.trim()) return { ok: true as const, out: "" };
    try {
      if (mode === "j2p") return { ok: true as const, out: phpSerialize(JSON.parse(input)) };
      return { ok: true as const, out: JSON.stringify(phpUnserialize(input), null, 2) };
    } catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [input, mode]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Convert other formats", to: "/convert" }, { label: "Validate JSON", to: "/json" }]}
      onExample={() => setInput(PHP_EXAMPLE)}>
      <Panel className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Direction">
            <Select value={mode} onChange={(e) => setMode(e.target.value as "j2p" | "p2j")} className="w-64">
              <option value="p2j">PHP serialize() → JSON</option>
              <option value="j2p">JSON → PHP serialize()</option>
            </Select>
          </Field>
          {res.ok && res.out && <span className="mb-2 font-mono text-[12px] text-zinc-400">{mode === "j2p" ? "JSON → PHP" : "PHP → JSON"}</span>}
        </div>
        <div className="mt-3">
          <Split
            left={<CodeArea label={`Input · ${mode === "j2p" ? "JSON" : "PHP serialize()"}`} value={input} onChange={setInput} rows={12} accept=".txt,.json,.php" onFile={(t) => setInput(t)} />}
            right={!res.ok
              ? <ErrorCallout title="Cannot convert" message={res.err} hint={'PHP data looks like a:2:{s:4:"name";s:4:"Maya";} — check the type letters, lengths and braces.'} />
              : <OutputBox value={res.out} label={`Output · ${mode === "j2p" ? "PHP serialize()" : "JSON"}`} filename={mode === "j2p" ? "data.php.txt" : "data.json"} rows={12} />}
          />
        </div>
        <ActionBar>
          <Btn variant="ghost" onClick={() => setInput("")}>Clear</Btn>
          <CopyBtn text={res.ok ? res.out : ""} label="Copy result" />
          <span className="text-[12px] text-zinc-500">Supports N, b, i, d, s, a and O types. UTF-8 byte lengths match PHP.</span>
        </ActionBar>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= HTML → JSX ================= */

const JSX_EXAMPLE = "<div class=\"card\" style=\"color: red; font-size: 14px\" tabindex=\"0\">\n  <img src=\"logo.png\" alt=\"Logo\">\n  <label for=\"name\">Name</label>\n  <!-- user block -->\n</div>";

export function HtmlToJsxTool() {
  const tool = TOOL_MAP["html-to-jsx"];
  const [input, setInput] = useState(JSX_EXAMPLE);
  const res = useMemo(() => {
    if (!input.trim()) return { ok: true as const, out: "" };
    try { return { ok: true as const, out: htmlToJsx(input) }; }
    catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [input]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Format the JSX", to: "/code-format" }, { label: "Compare versions", to: "/diff" }]}
      onExample={() => setInput(JSX_EXAMPLE)}>
      <Panel className="p-4">
        <div className="mt-1">
          <Split
            left={<CodeArea label="Input · HTML" value={input} onChange={setInput} rows={16} accept=".html,.htm" onFile={(t) => setInput(t)} />}
            right={!res.ok
              ? <ErrorCallout title="Cannot convert" message={res.err} />
              : <OutputBox value={res.out} label="Output · JSX" filename="component.jsx" rows={16} />}
          />
        </div>
        <ActionBar>
          <Btn variant="ghost" onClick={() => setInput("")}>Clear</Btn>
          <CopyBtn text={res.ok ? res.out : ""} label="Copy JSX" />
          <span className="text-[12px] text-zinc-500">class→className · for→htmlFor · kebab attrs→camelCase · style→object · void tags→self-closing · comments→{/* */}</span>
        </ActionBar>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= color ================= */

export function ColorConvertTool() {
  const tool = TOOL_MAP.color;
  const [input, setInput] = useState("#3366ff");
  const res = useMemo<{ ok: true; v: ColorReport | null } | { ok: false; err: string }>(() => {
    if (!input.trim()) return { ok: true, v: null };
    try { return { ok: true, v: colorFormats(input) }; }
    catch (e) { return { ok: false, err: (e as Error).message }; }
  }, [input]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Inspect text stats", to: "/text" }, { label: "Encode as text", to: "/encode" }]}>
      <Panel className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Color" hint="#hex, rgb(...) or hsl(...)" className="min-w-[220px] flex-1">
            <TextInput value={input} onChange={(e) => setInput(e.target.value)} className="font-mono" placeholder="#3366ff" />
          </Field>
          <Field label="Pick visually">
            <input
              type="color"
              value={res.ok && res.v !== null ? res.v.hex : "#3366ff"}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Pick a color visually"
              className="h-10 w-14 cursor-pointer rounded-lg border border-zinc-300 bg-transparent p-1 dark:border-zinc-700"
            />
          </Field>
          {res.ok && res.v !== null && (
            <div className="flex items-center gap-3 pb-1">
              <div className="h-12 w-28 rounded-lg border border-zinc-300 dark:border-zinc-700" style={{ backgroundColor: res.v.hex }} aria-label="Color preview" />
              <span className="text-[12px] text-zinc-500">Best text: <b className="text-zinc-900 dark:text-zinc-100">{res.v.textOn}</b></span>
            </div>
          )}
        </div>
        <div className="mt-3">
          {!res.ok
            ? <ErrorCallout title="Invalid color" message={res.err} hint="Try #3366ff, rgb(51, 102, 255) or hsl(225, 100, 60)." />
            : res.v !== null && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="HEX" value={res.v.hex} />
                  <Stat label="RGB" value={res.v.rgb} />
                  <Stat label="HSL" value={res.v.hsl} />
                  <Stat label="HSV" value={res.v.hsv} />
                  <Stat label="Rel. luminance" value={res.v.luminance.toFixed(3)} />
                  <Stat label="Contrast vs white" value={`${res.v.contrastWhite.toFixed(2)}:1`} />
                  <Stat label="Contrast vs black" value={`${res.v.contrastBlack.toFixed(2)}:1`} />
                  <Stat label="WCAG AA text (4.5:1)" value={
                    res.v.contrastWhite >= 4.5 || res.v.contrastBlack >= 4.5
                      ? (res.v.contrastWhite >= res.v.contrastBlack ? "white text" : "black text")
                      : "neither"
                    } />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <CopyBtn text={res.v.hex} label="Copy HEX" />
                  <CopyBtn text={res.v.rgb} label="Copy RGB" />
                  <CopyBtn text={res.v.hsl} label="Copy HSL" />
                </div>
                <p className="mt-2 text-[12px] text-zinc-500">
                  WCAG AA needs 4.5:1 for body text, 3:1 for large text. Both ratios above are computed against pure white and pure black backgrounds.
                </p>
              </>
            )}
        </div>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= markdown preview ================= */

const MD_STYLES = ".md-preview{font-size:14px;line-height:1.65;color:inherit}.md-preview h1{font-size:1.7em;font-weight:700;margin:.7em 0 .35em}.md-preview h2{font-size:1.4em;font-weight:700;margin:.6em 0 .3em}.md-preview h3{font-size:1.17em;font-weight:600;margin:.5em 0 .25em}.md-preview h4,.md-preview h5,.md-preview h6{font-weight:600;margin:.5em 0 .25em}.md-preview p{margin:.5em 0}.md-preview ul,.md-preview ol{margin:.5em 0;padding-left:1.5em}.md-preview ul{list-style:disc}.md-preview ol{list-style:decimal}.md-preview blockquote{border-left:3px solid #a1a1aa;padding:.2em 0 .2em .8em;margin:.5em 0;color:#52525b}.md-preview code{background:#f4f4f5;border-radius:4px;padding:.1em .3em;font-family:ui-monospace,monospace;font-size:.9em}.dark .md-preview code{background:#27272a}.md-preview pre{background:#f4f4f5;border-radius:8px;padding:.75em 1em;overflow-x:auto;margin:.6em 0}.dark .md-preview pre{background:#27272a}.md-preview pre code{background:transparent;padding:0}.md-preview hr{border:0;border-top:1px solid #d4d4d8;margin:1em 0}.md-preview a{color:#059669;text-decoration:underline}";

const MD_EXAMPLE = "# DevUtils\n\nA **local-first** toolkit with `103+` tools.\n\n- Fast\n- Private\n- No uploads\n\n## Quick start\n\n1. Open a tool\n2. Paste data\n3. Copy results\n\n> Everything runs in your browser.\n\n```\nconst x = 42;\n```\n\n---\n\n[Visit](https://example.com)";

export function MarkdownTool() {
  const tool = TOOL_MAP.markdown;
  const [input, setInput] = useState(MD_EXAMPLE);
  const [view, setView] = useState<"preview" | "html">("preview");
  const res = useMemo(() => {
    if (!input.trim()) return { ok: true as const, out: "" };
    try { return { ok: true as const, out: markdownToHtml(input) }; }
    catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [input]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Analyze the text", to: "/text" }, { label: "Compare two versions", to: "/diff" }]}
      onExample={() => setInput(MD_EXAMPLE)}>
      <Panel className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700" role="group" aria-label="Output view">
            {(["preview", "html"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
                className={`rounded-md px-4 py-1.5 text-[13px] font-semibold capitalize transition ${view === v ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500"}`}>{v}</button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <Split
            left={<CodeArea label="Markdown" value={input} onChange={setInput} rows={18} accept=".md,.markdown,.txt" onFile={(t) => setInput(t)} />}
            right={!res.ok
              ? <ErrorCallout title="Cannot render" message={res.err} />
              : view === "preview" ? (
                <div>
                  <style>{MD_STYLES}</style>
                  <div className="md-preview h-full overflow-auto rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                    dangerouslySetInnerHTML={{ __html: res.out || "<p style=\"color:#a1a1aa\">Nothing to preview yet.</p>" }} />
                  <p className="mt-2 text-[11.5px] text-zinc-500">Raw HTML in the input is escaped, never rendered. Only http(s), mailto and relative links are kept.</p>
                </div>
              ) : <OutputBox value={res.out} label="Generated HTML" filename="preview.html" rows={18} />}
          />
        </div>
        <ActionBar>
          <Btn variant="ghost" onClick={() => setInput("")}>Clear</Btn>
          <CopyBtn text={res.ok ? res.out : ""} label="Copy HTML" />
        </ActionBar>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= ULID ================= */

export function UlidTool() {
  const tool = TOOL_MAP.ulid;
  const [tab, setTab] = useState<"generate" | "validate">("generate");
  const [count, setCount] = useState("5");
  const [input, setInput] = useState(tool.example?.value ?? "");
  const [batch, setBatch] = useState<{ ulid: string; ts: number | null }[]>([]);

  const validation = useMemo(() => {
    if (tab !== "validate" || !input.trim()) return null;
    return input.trim().split(/[\s,]+/).filter(Boolean).map((u) => {
      const r = validateUlid(u);
      return { ulid: u.trim(), ok: r.ok, reason: r.reason, ts: r.timestamp };
    });
  }, [input, tab]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Generate UUIDs instead", to: "/generators" }, { label: "Decode the timestamp", to: "/timestamp" }]}>
      <Panel className="p-4">
        <div className="flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700" role="group" aria-label="ULID mode">
          {(["generate", "validate"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
              className={`rounded-md px-4 py-1.5 text-[13px] font-semibold capitalize transition ${tab === t ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500"}`}>{t}</button>
          ))}
        </div>
        <div className="mt-3">
          {tab === "generate" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="How many" hint="1–200">
                  <TextInput value={count} onChange={(e) => setCount(e.target.value)} className="w-24" />
                </Field>
                <Btn onClick={() => {
                  const n = Math.min(200, Math.max(1, parseInt(count) || 5));
                  setBatch(Array.from({ length: n }, () => {
                    const u = genUlid();
                    const r = validateUlid(u);
                    return { ulid: u, ts: r.ok ? r.timestamp ?? null : null };
                  }));
                }}>Generate</Btn>
                <Btn variant="ghost" onClick={() => setBatch([])}>Reset</Btn>
              </div>
              {batch.length > 0 && (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CopyBtn text={batch.map((b) => b.ulid).join("\n")} label={`Copy all ${batch.length}`} />
                  </div>
                  <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full text-left text-[12.5px]">
                      <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                          <th className="px-3 py-2">#</th><th className="px-3 py-2">ULID</th><th className="px-3 py-2">Embedded timestamp (UTC)</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {batch.map((b, i) => (
                          <tr key={b.ulid + i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                            <td className="px-3 py-1.5 text-zinc-400">{i + 1}</td>
                            <td className="px-3 py-1.5">{b.ulid}</td>
                            <td className="px-3 py-1.5 font-sans text-zinc-500">{b.ts !== null ? new Date(b.ts).toISOString() : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Split
              left={<CodeArea label="ULIDs to validate (one per line)" value={input} onChange={setInput} rows={12} accept=".txt" onFile={(t) => setInput(t)} />}
              right={!validation ? <div className="flex h-full items-center justify-center text-[13px] text-zinc-400">Paste ULIDs to check.</div>
                : (
                  <div className="max-h-[420px] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full text-left text-[12.5px]">
                      <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                          <th className="px-3 py-2">ULID</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Timestamp (UTC)</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {validation.map((v, i) => (
                          <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                            <td className="break-all px-3 py-1.5">{v.ulid}</td>
                            <td className={`px-3 py-1.5 font-bold ${v.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                              {v.ok ? "valid" : "invalid"}
                              {!v.ok && v.reason && <span className="block font-sans text-[11.5px] font-normal text-zinc-500">{v.reason}</span>}
                            </td>
                            <td className="px-3 py-1.5 font-sans text-zinc-500">{v.ok && v.ts ? new Date(v.ts).toISOString() : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            />
          )}
        </div>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= base convert ================= */

export function BaseConvertTool() {
  const tool = TOOL_MAP["base-convert"];
  const [input, setInput] = useState("255");
  const [from, setFrom] = useState("10");
  const [to, setTo] = useState("16");
  const BASES = [2, 8, 10, 16, 32, 36];

  const res = useMemo(() => {
    if (!input.trim()) return { ok: true as const, out: "" };
    try { return { ok: true as const, out: convertBase(input, parseInt(from), parseInt(to)) }; }
    catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [input, from, to]);

  const quick = useMemo(() => {
    if (!res.ok) return [];
    return [2, 8, 10, 16].map((b) => {
      try { return { base: b, value: convertBase(input, parseInt(from), b) }; } catch { return { base: b, value: "—" }; }
    });
  }, [input, from, res.ok]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Encode text to hex", to: "/encode" }, { label: "Convert a timestamp", to: "/timestamp" }]}
      onExample={() => { setInput("255"); setFrom("10"); setTo("16"); }}>
      <Panel className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Number" className="min-w-[200px] flex-1">
            <TextInput value={input} onChange={(e) => setInput(e.target.value)} className="font-mono" placeholder="e.g. 255 or ff" />
          </Field>
          <Field label="From base">
            <Select value={from} onChange={(e) => setFrom(e.target.value)} className="w-28">
              {BASES.map((b) => <option key={b} value={b}>base {b}</option>)}
            </Select>
          </Field>
          <Field label="To base">
            <Select value={to} onChange={(e) => setTo(e.target.value)} className="w-28">
              {BASES.map((b) => <option key={b} value={b}>base {b}</option>)}
            </Select>
          </Field>
        </div>
        <div className="mt-3">
          {!res.ok
            ? <ErrorCallout title="Cannot convert" message={res.err} hint="Digits must be valid in the source base; bases run from 2 to 36." />
            : (
              <div className="space-y-3">
                <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">base {from} → base {to}</p>
                  <p className="mt-1 break-all font-mono text-xl">{res.out || "—"}</p>
                  <div className="mt-2"><CopyBtn text={res.out} label="Copy result" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {quick.map((q) => <Stat key={q.base} label={`Base ${q.base}`} value={q.value} />)}
                </div>
              </div>
            )}
        </div>
        <ActionBar>
          <Btn variant="ghost" onClick={() => setInput("")}>Clear</Btn>
          <span className="text-[12px] text-zinc-500">BigInt-exact — huge values convert without precision loss. Negative numbers are not supported.</span>
        </ActionBar>
      </Panel>
    </ToolScaffold>
  );
}
