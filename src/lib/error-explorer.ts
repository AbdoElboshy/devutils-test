import { ERROR_DB, type ErrorDoc } from "./blueprints";

export type ErrorMatch = {
  doc: ErrorDoc;
  score: number;
  evidence: string[];
};

export type ErrorAnalysis = {
  matches: ErrorMatch[];
  facts: Record<string, string>;
  format: "kubectl-describe" | "stack-or-log" | "short-message";
};

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function analyzeErrorText(input: string): ErrorAnalysis {
  const text = input.trim();
  const lower = text.toLowerCase();
  const lines = text.split(/\r?\n/);
  const matches = ERROR_DB.map((doc): ErrorMatch => {
    const evidence: string[] = [];
    let score = 0;
    doc.match.forEach((pattern) => {
      const p = pattern.toLowerCase();
      if (!p) return;
      const exact = lower === p;
      const word = new RegExp(`(^|[^a-z0-9])${escapeRegExp(p)}([^a-z0-9]|$)`, "i").test(text);
      const included = lower.includes(p);
      if (exact) score += 100;
      else if (word) score += 45;
      else if (included) score += 22;
      if (included) {
        const line = lines.find((item) => item.toLowerCase().includes(p));
        if (line) evidence.push(line.trim().slice(0, 240));
      }
    });
    if (lower.includes(doc.area.toLowerCase())) score += 4;
    return { doc, score, evidence: [...new Set(evidence)].slice(0, 3) };
  }).filter((match) => match.score > 0).sort((a, b) => b.score - a.score);

  const facts: Record<string, string> = {};
  const fieldNames = ["Name", "Namespace", "Status", "Reason", "Node", "IP", "Controlled By", "Service Account", "QoS Class"];
  fieldNames.forEach((name) => {
    const line = lines.find((item) => new RegExp(`^\\s*${escapeRegExp(name)}:\\s*`, "i").test(item));
    if (line) facts[name] = line.replace(new RegExp(`^\\s*${escapeRegExp(name)}:\\s*`, "i"), "").trim();
  });
  const exitLine = lines.find((line) => /^\s*Exit Code:\s*/i.test(line));
  if (exitLine) facts["Exit Code"] = exitLine.replace(/^\s*Exit Code:\s*/i, "").trim();
  const restartLine = lines.find((line) => /^\s*Restart Count:\s*/i.test(line));
  if (restartLine) facts["Restart Count"] = restartLine.replace(/^\s*Restart Count:\s*/i, "").trim();
  const warningLines = lines.filter((line) => /\bWarning\b|\bFailed\w*\b/.test(line)).slice(-5);
  if (warningLines.length) facts["Recent warnings"] = warningLines.map((line) => line.trim()).join("\n");

  const format = /^(Name|Namespace|Containers|Events):/m.test(text) || /kubectl describe/i.test(text)
    ? "kubectl-describe"
    : lines.length > 2 ? "stack-or-log" : "short-message";
  return { matches: matches.slice(0, 6), facts, format };
}