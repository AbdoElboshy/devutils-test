import { useMemo, useState } from "react";
import { TOOL_MAP } from "../lib/registry";
import {
  deduplicateLogs,
  diffLogs,
  extractLogErrors,
  filterLogs,
  formatLogs,
  formatStackTraces,
  logSummary,
  normalizeLogTimestamps,
  type LogLevel,
} from "../lib/logs";
import { ToolScaffold, Panel, Tabs, CodeArea, OutputBox, Split, Stat, Check, ErrorCallout } from "../components/ui";

const LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal", "unknown"];

export function LogsTool() {
  const tool = TOOL_MAP.logs;
  const [tab, setTab] = useState("format");
  const [input, setInput] = useState("");
  const [compare, setCompare] = useState("");
  const [levels, setLevels] = useState<LogLevel[]>(["warn", "error", "fatal"]);

  const summary = useMemo(() => logSummary(input), [input]);
  const result = useMemo(() => {
    try {
      if (!input.trim()) return { ok: true as const, output: "", note: "" };
      if (tab === "format") return { ok: true as const, output: formatLogs(input), note: `${summary.entries} entries` };
      if (tab === "clean") return { ok: true as const, output: formatStackTraces(input), note: "ANSI codes and trailing whitespace removed" };
      if (tab === "normalize") return { ok: true as const, output: normalizeLogTimestamps(input), note: "Parseable timestamps converted to ISO 8601 UTC" };
      if (tab === "dedupe") {
        const deduped = deduplicateLogs(input);
        return { ok: true as const, output: deduped.output, note: `${deduped.removed} duplicate entries collapsed` };
      }
      if (tab === "levels") return { ok: true as const, output: filterLogs(input, levels), note: `Showing ${levels.join(", ") || "no"} levels` };
      if (tab === "errors") return { ok: true as const, output: extractLogErrors(input), note: "Errors, fatal events and stack continuations" };
      return { ok: true as const, output: compare.trim() ? diffLogs(input, compare) : "", note: "Normalized line diff" };
    } catch (cause) { return { ok: false as const, error: cause instanceof Error ? cause.message : "Could not process logs." }; }
  }, [input, compare, levels, summary.entries, tab]);

  const toggleLevel = (level: LogLevel) => setLevels((current) => current.includes(level) ? current.filter((item) => item !== level) : [...current, level]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Explain detected error", to: "/errors" }, { label: "Test a log regex", to: "/regex" }, { label: "Normalize timestamps", to: "/timestamp" }]}
      onExample={() => setInput(tool.example?.value ?? "")}>
      <Panel className="p-4">
        <Tabs tabs={[
          { id: "format", label: "Format" },
          { id: "clean", label: "Clean" },
          { id: "normalize", label: "Timestamps" },
          { id: "dedupe", label: "Deduplicate" },
          { id: "levels", label: "Levels" },
          { id: "errors", label: "Errors" },
          { id: "diff", label: "Diff" },
        ]} active={tab} onChange={setTab} ariaLabel="Log operations" />

        <div className="mt-3 flex flex-wrap gap-2">
          <Stat label="Detected" value={summary.format.replace("-", " / ")} mono={false} />
          <Stat label="Entries" value={String(summary.entries)} />
          <Stat label="Errors" value={String(summary.levels.error + summary.levels.fatal)} />
          <Stat label="Warnings" value={String(summary.levels.warn)} />
          {summary.firstTimestamp && <Stat label="First timestamp" value={summary.firstTimestamp} />}
        </div>

        {tab === "levels" && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {LEVELS.map((level) => <Check key={level} label={`${level} (${summary.levels[level]})`} checked={levels.includes(level)} onChange={() => toggleLevel(level)} />)}
          </div>
        )}

        <div className="mt-3">
          {tab === "diff" ? (
            <>
              <div className="grid gap-3 lg:grid-cols-2">
                <CodeArea label="Original logs" value={input} onChange={setInput} rows={9} accept=".log,.txt,.json" onFile={(text) => setInput(text)} />
                <CodeArea label="Comparison logs" value={compare} onChange={setCompare} rows={9} accept=".log,.txt,.json" onFile={(text) => setCompare(text)} />
              </div>
              <div className="mt-3">{result.ok ? <OutputBox value={result.output} label="Normalized diff" filename="logs.diff" rows={12} /> : <ErrorCallout title="Cannot compare logs" message={result.error} />}</div>
            </>
          ) : (
            <Split
              left={<CodeArea label="Log input" value={input} onChange={setInput} rows={15} accept=".log,.txt,.json" onFile={(text) => setInput(text)} placeholder={tool.example?.value} />}
              right={result.ok
                ? <div><OutputBox value={result.output} label="Output" filename="processed.log" rows={15} /><p className="mt-2 text-[12px] text-zinc-500">{result.note}</p></div>
                : <ErrorCallout title="Cannot process logs" message={result.error} />}
            />
          )}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-zinc-500">Local-only processing. Log contents, hostnames, trace IDs and stack traces are never stored or transmitted.</p>
      </Panel>
    </ToolScaffold>
  );
}