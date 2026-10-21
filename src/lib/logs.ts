import { diffLines } from "./engine";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "unknown";
export type LogFormat = "json" | "docker-kubernetes" | "nginx-apache" | "syslog" | "plain";

export type LogEntry = {
  index: number;
  timestamp: string | null;
  level: LogLevel;
  message: string;
  source: string | null;
  raw: string;
  data?: Record<string, unknown>;
};

const ansi = /\x1b\[[0-9;]*m/g;
const levelPattern = /\b(TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|ERR|CRITICAL|FATAL|PANIC|EMERG)\b/i;

function normalizeLevel(value: unknown): LogLevel {
  const text = String(value ?? "").toLowerCase();
  if (/panic|fatal|critical|emerg/.test(text)) return "fatal";
  if (/error|err/.test(text)) return "error";
  if (/warn/.test(text)) return "warn";
  if (/notice|info/.test(text)) return "info";
  if (/debug/.test(text)) return "debug";
  if (/trace/.test(text)) return "trace";
  return "unknown";
}

function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(typeof value === "number" && value < 1e12 ? value * 1000 : value as string | number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function cleanLogLine(line: string): string {
  return line.replace(ansi, "").replace(/\u0000/g, "").replace(/[ \t]+$/g, "");
}

export function parseLogLine(rawLine: string, index = 0): LogEntry {
  const raw = cleanLogLine(rawLine);
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const data = JSON.parse(trimmed) as Record<string, unknown>;
      const timestamp = isoOrNull(data.timestamp ?? data.time ?? data.ts ?? data["@timestamp"] ?? data.datetime);
      const level = normalizeLevel(data.level ?? data.severity ?? data.loglevel ?? data.priority);
      const message = String(data.message ?? data.msg ?? data.error ?? data.event ?? trimmed);
      const source = data.service ?? data.logger ?? data.component ?? data.container_name;
      return { index, timestamp, level, message, source: source ? String(source) : null, raw, data };
    } catch { /* malformed JSON falls through to plain parsing */ }
  }

  const prefixed = trimmed.match(/^(\d{4}-\d{2}-\d{2}T[^\s]+)\s+(?:(stdout|stderr)\s+[FP]\s+)?(.*)$/);
  if (prefixed) {
    const body = prefixed[3];
    const level = normalizeLevel(body.match(levelPattern)?.[1] ?? (prefixed[2] === "stderr" ? "error" : ""));
    return { index, timestamp: isoOrNull(prefixed[1]), level, message: body, source: prefixed[2] ?? null, raw };
  }

  const syslog = trimmed.match(/^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^:]+):\s*(.*)$/);
  if (syslog) {
    const withYear = `${new Date().getFullYear()} ${syslog[1]}`;
    return { index, timestamp: isoOrNull(withYear), level: normalizeLevel(syslog[4].match(levelPattern)?.[1]), message: syslog[4], source: `${syslog[2]}/${syslog[3]}`, raw };
  }

  const access = trimmed.match(/^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([A-Z]+\s+[^\"]+)"\s+(\d{3})\s+(\S+)/);
  if (access) {
    const status = Number(access[4]);
    const level: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    return { index, timestamp: isoOrNull(access[2].replace(/:(\d{2})$/, " $1")), level, message: `${access[3]} -> ${status} (${access[5]} bytes)`, source: access[1], raw };
  }

  const match = trimmed.match(levelPattern);
  return { index, timestamp: null, level: normalizeLevel(match?.[1]), message: trimmed, source: null, raw };
}

export function parseLogs(input: string): LogEntry[] {
  return input.split(/\r?\n/).filter((line) => line.trim() !== "").map(parseLogLine);
}

export function detectLogFormat(input: string): LogFormat {
  const lines = input.split(/\r?\n/).filter((line) => line.trim()).slice(0, 30);
  const counts: Record<LogFormat, number> = { json: 0, "docker-kubernetes": 0, "nginx-apache": 0, syslog: 0, plain: 0 };
  lines.forEach((line) => {
    if (/^\s*\{.*\}\s*$/.test(line)) counts.json++;
    else if (/^\d{4}-\d{2}-\d{2}T\S+\s+(?:stdout|stderr)\s+[FP]\s+/.test(line) || /^\d{4}-\d{2}-\d{2}T\S+\s+/.test(line)) counts["docker-kubernetes"]++;
    else if (/^\S+\s+\S+\s+\S+\s+\[[^\]]+\]\s+"[A-Z]+\s+/.test(line)) counts["nginx-apache"]++;
    else if (/^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/.test(line)) counts.syslog++;
    else counts.plain++;
  });
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as LogFormat) ?? "plain";
}

export function formatLogs(input: string): string {
  return parseLogs(input).map((entry) => {
    const prefix = [entry.timestamp, entry.level !== "unknown" ? entry.level.toUpperCase().padEnd(5) : null, entry.source].filter(Boolean).join(" ");
    return `${prefix ? `${prefix} ` : ""}${entry.message}`;
  }).join("\n");
}

export function normalizeLogTimestamps(input: string): string {
  return parseLogs(input).map((entry) => `${entry.timestamp ?? "(no timestamp)"} ${entry.message}`).join("\n");
}

export function deduplicateLogs(input: string): { output: string; removed: number } {
  const entries = parseLogs(input);
  const groups = new Map<string, { entry: LogEntry; count: number }>();
  entries.forEach((entry) => {
    const key = `${entry.level}|${entry.message}`;
    const current = groups.get(key);
    if (current) current.count++;
    else groups.set(key, { entry, count: 1 });
  });
  const output = [...groups.values()].map(({ entry, count }) => `${entry.timestamp ? `${entry.timestamp} ` : ""}${entry.level !== "unknown" ? `${entry.level.toUpperCase()} ` : ""}${entry.message}${count > 1 ? ` [repeated ${count}x]` : ""}`).join("\n");
  return { output, removed: entries.length - groups.size };
}

export function filterLogs(input: string, levels: LogLevel[]): string {
  const allowed = new Set(levels);
  return parseLogs(input).filter((entry) => allowed.has(entry.level)).map((entry) => entry.raw).join("\n");
}

export function extractLogErrors(input: string): string {
  const lines = input.split(/\r?\n/);
  const output: string[] = [];
  let collectingStack = false;
  lines.forEach((line) => {
    const entry = parseLogLine(line);
    const isError = entry.level === "error" || entry.level === "fatal" || /\b(exception|traceback|failed|panic)\b/i.test(line);
    const isContinuation = collectingStack && /^\s+(at |File |\.\.\.|Caused by:)|^\s*\^/.test(line);
    if (isError || isContinuation) output.push(cleanLogLine(line));
    collectingStack = isError || isContinuation;
  });
  return output.join("\n");
}

export function formatStackTraces(input: string): string {
  return input.split(/\r?\n/).map((line) => {
    const clean = cleanLogLine(line).trimEnd();
    if (/^\s*(at |File |Caused by:)/.test(clean)) return `  ${clean.trim()}`;
    return clean;
  }).join("\n").replace(/\n{3,}/g, "\n\n");
}

export function logSummary(input: string) {
  const entries = parseLogs(input);
  const levels: Record<LogLevel, number> = { trace: 0, debug: 0, info: 0, warn: 0, error: 0, fatal: 0, unknown: 0 };
  entries.forEach((entry) => { levels[entry.level]++; });
  const timestamps = entries.map((entry) => entry.timestamp).filter((value): value is string => Boolean(value)).sort();
  return { format: detectLogFormat(input), entries: entries.length, levels, firstTimestamp: timestamps[0] ?? null, lastTimestamp: timestamps[timestamps.length - 1] ?? null };
}

export function diffLogs(original: string, modified: string): string {
  return diffLines(formatLogs(original), formatLogs(modified)).map((item) => `${item.type === "add" ? "+" : item.type === "del" ? "-" : " "} ${item.text}`).join("\n");
}