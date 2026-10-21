import { useMemo, useState } from "react";
import {
  CASES, CLEANERS, EXTRACTORS, textStats, diffLines,
  parseTimestamp, relTime, COMMON_ZONES, formatInZone, dateDiff, addToDate, businessDays, calcAge, isoWeekNumber,
} from "../lib/engine";
import { TOOL_MAP } from "../lib/registry";
import {
  ToolScaffold, Panel, Tabs, Field, TextInput, Select, Btn, CopyBtn,
  CodeArea, OutputBox, ErrorCallout, Split, ActionBar, Stat,
} from "../components/ui";
import { cn } from "../utils/cn";

/* ================= TEXT ================= */

export function TextTool() {
  const tool = TOOL_MAP.text;
  const [tab, setTab] = useState("transform");
  const [input, setInput] = useState("the quick brown fox jumps over 42 lazy dogs.\nContact maya@example.com or visit https://example.com/page?id=7.\n\nDuplicate line\nDuplicate line\n");
  const [caseId, setCaseId] = useState("snake");
  const [cleanIds, setCleanIds] = useState<string[]>(["trim", "noempty", "dedup"]);
  const [extId, setExtId] = useState("emails");
  const [cmpB, setCmpB] = useState("the quick brown fox jumps over 43 lazy dogs.");

  const stats = useMemo(() => textStats(input), [input]);

  const out = useMemo(() => {
    try {
      if (tab === "transform") return { ok: true as const, text: CASES.find((c) => c.id === caseId)!.fn(input) };
      if (tab === "clean") {
        let s = input;
        cleanIds.forEach((id) => { s = CLEANERS.find((c) => c.id === id)!.fn(s); });
        return { ok: true as const, text: s };
      }
      if (tab === "extract") {
        const ex = EXTRACTORS.find((e) => e.id === extId)!;
        const hits = [...input.matchAll(new RegExp(ex.re.source, ex.re.flags.includes("g") ? ex.re.flags : ex.re.flags + "g"))].map((m) => m[0]);
        const uniq = [...new Set(hits)];
        return { ok: true as const, text: uniq.join("\n"), count: uniq.length, total: hits.length };
      }
      if (tab === "compare") {
        const ops = diffLines(input, cmpB);
        return { ok: true as const, text: ops.map((o) => `${o.type === "add" ? "+" : o.type === "del" ? "-" : " "} ${o.text}`).join("\n") };
      }
      return { ok: true as const, text: input };
    } catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [tab, input, caseId, cleanIds, extId, cmpB]);

  const toggleClean = (id: string) => setCleanIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <ToolScaffold tool={tool} next={[{ label: "Test pattern with Regex", to: "/regex" }, { label: "Full diff view", to: "/diff" }, { label: "Encode the result", to: "/encode" }]}>
      <Panel className="p-4">
        <Tabs tabs={[{ id: "transform", label: "Transform" }, { id: "clean", label: "Clean" }, { id: "extract", label: "Extract" }, { id: "analyze", label: "Analyze" }, { id: "compare", label: "Compare" }]} active={tab} onChange={setTab} />
        {(tab === "transform" || tab === "clean" || tab === "extract") && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tab === "transform" && CASES.map((c) => (
              <button key={c.id} type="button" onClick={() => setCaseId(c.id)} aria-pressed={caseId === c.id}
                className={cn("rounded-lg border px-2.5 py-1.5 font-mono text-[12.5px]", caseId === c.id ? "border-emerald-500 text-emerald-700 dark:text-emerald-300" : "border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400")}>{c.name}</button>
            ))}
            {tab === "clean" && CLEANERS.map((c) => (
              <button key={c.id} type="button" onClick={() => toggleClean(c.id)} aria-pressed={cleanIds.includes(c.id)}
                className={cn("rounded-lg border px-2.5 py-1.5 text-[12.5px]", cleanIds.includes(c.id) ? "border-emerald-500 text-emerald-700 dark:text-emerald-300" : "border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400")}>{c.name}</button>
            ))}
            {tab === "extract" && EXTRACTORS.map((e) => (
              <button key={e.id} type="button" onClick={() => setExtId(e.id)} aria-pressed={extId === e.id}
                className={cn("rounded-lg border px-2.5 py-1.5 text-[12.5px]", extId === e.id ? "border-emerald-500 text-emerald-700 dark:text-emerald-300" : "border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400")}>{e.name}</button>
            ))}
          </div>
        )}
        <div className="mt-3">
          {tab === "analyze" ? (
            <Split
              left={<CodeArea label="Text to analyze" value={input} onChange={setInput} rows={12} mono={false} />}
              right={
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Statistics · live</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Stat label="Characters" value={stats.chars.toLocaleString()} />
                    <Stat label="No spaces" value={stats.noSpaces.toLocaleString()} />
                    <Stat label="Words" value={stats.words.toLocaleString()} />
                    <Stat label="Sentences" value={String(stats.sentences)} />
                    <Stat label="Lines" value={String(stats.lines)} />
                    <Stat label="Paragraphs" value={String(stats.paragraphs)} />
                    <Stat label="Reading time" value={`~${stats.reading} min`} mono={false} />
                    <Stat label="UTF-8 size" value={`${stats.bytes.toLocaleString()} B`} />
                    <div className="col-span-2 sm:col-span-1"><CopyBtn text={`chars=${stats.chars} words=${stats.words} lines=${stats.lines} reading~${stats.reading}min`} label="Copy stats" /></div>
                  </div>
                </div>
              }
            />
          ) : tab === "compare" ? (
            <Split
              left={<><CodeArea label="Original" value={input} onChange={setInput} rows={9} mono={false} /><div className="mt-3"><CodeArea label="Modified" value={cmpB} onChange={setCmpB} rows={9} mono={false} /></div></>}
              right={!out.ok ? <ErrorCallout title="Error" message={out.err} /> : <OutputBox value={out.text} label="Diff" filename="text.diff" rows={14} />}
            />
          ) : (
            <Split
              left={<CodeArea label="Input text" value={input} onChange={setInput} rows={12} mono={false} />}
              right={!out.ok ? <ErrorCallout title="Error" message={out.err} /> : (
                <div>
                  {"count" in out && out.count !== undefined && <p className="mb-1.5 font-mono text-[12px] text-emerald-600">{out.count} unique · {out.total} total</p>}
                  <OutputBox value={out.text} label={tab === "extract" ? `Extracted · ${EXTRACTORS.find((e) => e.id === extId)?.name}` : "Output"} filename="text-output.txt" rows={12} />
                </div>
              )}
            />
          )}
        </div>
        <ActionBar>
          <Btn variant="ghost" onClick={() => setInput("")}>Clear</Btn>
          <span className="font-mono text-[12px] text-zinc-400">{stats.words} words · {stats.chars} chars · {stats.lines} lines</span>
        </ActionBar>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= TIMESTAMP ================= */

export function TimestampTool() {
  const tool = TOOL_MAP.timestamp;
  const [input, setInput] = useState("1717785600");
  const [now, setNow] = useState(() => Date.now());
  const res = useMemo(() => {
    try { return { ok: true as const, v: parseTimestamp(input) }; }
    catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [input]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Convert timezone", to: "/timezone" }, { label: "Date math", to: "/date-calc" }, { label: "Schedule with cron", to: "/cron" }]}
      onExample={() => setInput(tool.example?.value ?? "")}>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel className="p-4">
          <Field label="Unix timestamp or date" hint="Auto-detects seconds, ms, µs, ns — or ISO/RFC dates">
            <TextInput value={input} onChange={(e) => setInput(e.target.value)} className="font-mono text-[15px]" placeholder="1717785600 or 2024-06-07T12:00:00Z" />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["1717785600", "1717785600123", new Date().toISOString()].map((ex) => (
              <button key={ex} type="button" onClick={() => setInput(ex)} className="rounded-lg border border-zinc-200 px-2 py-1 font-mono text-[12px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">{ex.length > 24 ? ex.slice(0, 24) + "…" : ex}</button>
            ))}
          </div>
          <div className="mt-3">
            {!input.trim() ? <OutputBox value="" placeholder="Conversion appears here" />
              : !res.ok ? <ErrorCallout title="Cannot parse" message={res.err} hint="Try 10 digits (seconds), 13 digits (ms), or an ISO date like 2024-06-07T12:00:00Z." />
                : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Stat label="Detected unit" value={res.v.unit} mono={false} /><Stat label="Epoch ms" value={String(Math.floor(res.v.ms))} />
                    </div>
                    <OutputBox value={`ISO 8601   ${res.v.iso}\nUTC        ${res.v.utc}\nLocal      ${res.v.local}\nRelative   ${relTime(res.v.ms - Date.now())}\nJS         ${res.v.js}\nEpoch (s)  ${Math.floor(res.v.ms / 1000)}\nEpoch (ms) ${Math.floor(res.v.ms)}`} label="Every representation" filename="timestamp.txt" rows={8} />
                  </div>
                )}
          </div>
        </Panel>
        <Panel className="p-4">
          <p className="text-[13px] font-bold">Now</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{Math.floor(now / 1000)}</p>
          <p className="font-mono text-[12px] text-zinc-500">{now} ms</p>
          <p className="mt-1 text-[12.5px] text-zinc-500">{new Date(now).toISOString()}</p>
          <div className="mt-2 flex gap-2">
            <Btn variant="secondary" onClick={() => setNow(Date.now())}>Refresh</Btn>
            <Btn variant="ghost" onClick={() => setInput(String(Math.floor(now / 1000)))}>Use ↑</Btn>
          </div>
          <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <p className="text-[12px] font-bold uppercase tracking-wide text-zinc-400">Quick conversions</p>
            <QuickConv label="Seconds → ms" fn={(s) => String((parseFloat(s) || 0) * 1000)} placeholder="1717785600" />
            <QuickConv label="Ms → seconds" fn={(s) => String(Math.floor((parseFloat(s) || 0) / 1000))} placeholder="1717785600123" />
            <QuickConv label="Ms → ISO" fn={(s) => new Date(parseFloat(s) || 0).toISOString()} placeholder="1717785600123" />
          </div>
        </Panel>
      </div>
    </ToolScaffold>
  );
}

function QuickConv({ label, fn, placeholder }: { label: string; fn: (s: string) => string; placeholder: string }) {
  const [v, setV] = useState("");
  const out = useMemo(() => { if (!v.trim()) return ""; try { const r = fn(v); return /Invalid|NaN/.test(r) ? "invalid" : r; } catch { return "invalid"; } }, [v, fn]);
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="w-24 shrink-0 text-[12px] text-zinc-500">{label}</span>
      <TextInput value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="font-mono text-[12.5px]" />
      {out && <code className="max-w-[140px] truncate font-mono text-[11.5px] text-emerald-600" title={out}>{out}</code>}
    </div>
  );
}

/* ================= TIMEZONE ================= */

export function TimezoneTool() {
  const tool = TOOL_MAP.timezone;
  const [base, setBase] = useState(() => new Date().toISOString().slice(0, 16));
  const [zones, setZones] = useState(["UTC", "America/New_York", "Europe/Berlin", "Asia/Tokyo"]);
  const [add, setAdd] = useState("Europe/Paris");
  const date = useMemo(() => { const d = new Date(base); return isNaN(d.getTime()) ? new Date() : d; }, [base]);
  return (
    <ToolScaffold tool={tool} next={[{ label: "Epoch converter", to: "/timestamp" }, { label: "Schedule across zones", to: "/cron" }]}>
      <Panel className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Moment (local input)"><TextInput type="datetime-local" value={base} onChange={(e) => setBase(e.target.value)} className="font-mono" /></Field>
          <Field label="Add zone"><span className="flex gap-1.5"><Select value={add} onChange={(e) => setAdd(e.target.value)} className="w-52 font-mono text-[13px]">{COMMON_ZONES.map((z) => <option key={z}>{z}</option>)}</Select>
            <Btn onClick={() => { if (!zones.includes(add)) setZones([...zones, add]); }}>Add</Btn></span></Field>
        </div>
        <p className="mt-2 text-[12px] text-zinc-500">Converted with <code className="font-mono">Intl.DateTimeFormat</code> + IANA data — DST handled by the platform, never hard-coded.</p>
        <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          {zones.map((z) => {
            let val = "";
            try { val = formatInZone(date, z); } catch { val = "unknown zone"; }
            return (
              <div key={z} className="flex items-center gap-3 border-b border-zinc-100 px-3.5 py-2.5 last:border-0 dark:border-zinc-800/60">
                <code className="w-44 shrink-0 font-mono text-[12.5px] font-bold">{z}</code>
                <span className="flex-1 text-[13px]">{val}</span>
                <button type="button" onClick={() => setZones(zones.filter((x) => x !== z))} className="text-[12px] text-zinc-400 hover:text-red-500">remove</button>
              </div>
            );
          })}
        </div>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= DATE CALC ================= */

export function DateCalcTool() {
  const tool = TOOL_MAP.datecalc;
  const [tab, setTab] = useState("diff");
  const [a, setA] = useState("2024-01-01");
  const [b, setB] = useState("2024-06-07");
  const [base, setBase] = useState("2024-06-07");
  const [amt, setAmt] = useState("30");
  const [unit, setUnit] = useState("days");
  const [birth, setBirth] = useState("1995-04-12");

  const out = useMemo(() => {
    try {
      if (tab === "diff") { const d = dateDiff(a, b); const wa = isoWeekNumber(a), wb = isoWeekNumber(b); return `Between ${a} and ${b}:\n${d.days} days · ${d.weeks} weeks · ${d.human}\nBusiness days (Mon–Fri): ${businessDays(a, b)}\nISO weeks: ${wa.year}-W${String(wa.week).padStart(2, "0")} → ${wb.year}-W${String(wb.week).padStart(2, "0")}\nMilliseconds: ${d.ms.toLocaleString()}`; }
      if (tab === "add") { const d = addToDate(base, +amt, unit); const week = isoWeekNumber(d); return `${base} ${+amt >= 0 ? "+" : ""}${amt} ${unit} =\n${d.toISOString()}\n${d.toLocaleString()}\nISO week: ${week.year}-W${String(week.week).padStart(2, "0")}`; }
      return `Born ${birth}:\n${calcAge(birth)} old`;
    } catch (e) { return `Error: ${(e as Error).message}`; }
  }, [tab, a, b, base, amt, unit, birth]);

  const isErr = out.startsWith("Error");

  return (
    <ToolScaffold tool={tool} next={[{ label: "Epoch math", to: "/timestamp" }, { label: "World clock", to: "/timezone" }]}>
      <Panel className="p-4">
        <Tabs tabs={[{ id: "diff", label: "Difference" }, { id: "add", label: "Add / subtract" }, { id: "age", label: "Age" }]} active={tab} onChange={setTab} />
        <div className="mt-4">
          <Split
            left={
              <div className="space-y-3">
                {tab === "diff" && (<div className="grid grid-cols-2 gap-3">
                  <Field label="From"><TextInput type="date" value={a} onChange={(e) => setA(e.target.value)} /></Field>
                  <Field label="To"><TextInput type="date" value={b} onChange={(e) => setB(e.target.value)} /></Field>
                </div>)}
                {tab === "add" && (<>
                  <Field label="Base date"><TextInput type="date" value={base} onChange={(e) => setBase(e.target.value)} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Amount (±)"><TextInput value={amt} onChange={(e) => setAmt(e.target.value)} className="font-mono" /></Field>
                    <Field label="Unit"><Select value={unit} onChange={(e) => setUnit(e.target.value)}><option value="days">days</option><option value="hours">hours</option><option value="minutes">minutes</option><option value="months">months</option><option value="years">years</option></Select></Field>
                  </div>
                </>)}
                {tab === "age" && <Field label="Birth date"><TextInput type="date" value={birth} onChange={(e) => setBirth(e.target.value)} /></Field>}
              </div>
            }
            right={isErr ? <ErrorCallout title="Invalid date" message={out} /> : <OutputBox value={out} label="Result" filename="date.txt" />}
          />
        </div>
      </Panel>
    </ToolScaffold>
  );
}
