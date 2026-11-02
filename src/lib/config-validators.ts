// Nginx/Apache/IAM/PromQL validators - pure functions. No network, no eval.
export type ConfigIssue = { line: number; message: string };
export type ConfigReport = { ok: boolean; issues: ConfigIssue[] };

/** Validate common nginx configuration structure: directives, braces, semicolons. */
export function validateNginxConfig(config: string): ConfigReport {
  if (!config.trim()) throw new Error("Paste an nginx configuration first.");
  const issues: ConfigIssue[] = [];
  const lines = config.split(/\r?\n/);
  let depth = 0;
  lines.forEach((raw, index) => {
    const line = raw.split("#")[0].trim();
    const n = index + 1;
    if (!line) return;
    const opens = (line.match(/{/g) ?? []).length;
    const closes = (line.match(/}/g) ?? []).length;
    depth += opens - closes;
    if (depth < 0) { issues.push({ line: n, message: "Unbalanced '}' - more closing than opening braces." }); depth = 0; }
    const isBlockLine = opens > 0 || closes > 0;
    if (!isBlockLine && !line.endsWith(";")) issues.push({ line: n, message: `Missing terminating ';' on directive: ${line.slice(0, 60)}` });
  });
  if (depth !== 0) issues.push({ line: lines.length, message: "Unbalanced '{' - a block was opened but never closed." });
  return { ok: issues.length === 0, issues };
}

/** Validate common Apache configuration structure: directives, tags, nesting. */
export function validateApacheConfig(config: string): ConfigReport {
  if (!config.trim()) throw new Error("Paste an Apache configuration first.");
  const issues: ConfigIssue[] = [];
  const lines = config.split(/\r?\n/);
  const stack: { tag: string; line: number }[] = [];
  lines.forEach((raw, index) => {
    const line = raw.split("#")[0].trim();
    const n = index + 1;
    if (!line) return;
    if (!line.startsWith("<")) return;
    const close = line.match(/^<\/(\w+)\s*>$/);
    if (close) {
      const top = stack.pop();
      if (!top) issues.push({ line: n, message: `Closing </${close[1]}> with no matching opening tag.` });
      else if (top.tag !== close[1]) issues.push({ line: n, message: `Closing </${close[1]}> does not match <${top.tag}> opened on line ${top.line}.` });
      return;
    }
    const open = line.match(/^<(\w+)/);
    if (!open) { issues.push({ line: n, message: "Malformed tag - expected '</tag>', '<tag ...>' or '<tag ... />'." }); return; }
    if (line.endsWith("/>")) return;
    if (line.endsWith(">")) { stack.push({ tag: open[1], line: n }); return; }
    issues.push({ line: n, message: "Malformed tag - expected it to end with '>' or '/>'." });
  });
  if (stack.length) {
    const top = stack[stack.length - 1];
    issues.push({ line: lines.length, message: `Unclosed tag <${top.tag}> opened on line ${top.line}.` });
  }
  return { ok: issues.length === 0, issues };
}

export type IamFinding = { severity: "warning" | "danger"; statement: number; message: string };
export type IamReview = { findings: IamFinding[]; statementCount: number; ok: boolean };

const DANGEROUS_ACTIONS = new Set(["*:*", "iam:*", "kms:Decrypt", "secretsmanager:GetSecretValue", "s3:*", "sts:AssumeRole"]);

/** Review an AWS IAM policy document for wildcards and privileged actions. */
export function reviewIamPolicy(policy: unknown): IamReview {
  const doc = typeof policy === "string" ? JSON.parse(policy) as Record<string, unknown> : policy as Record<string, unknown>;
  const statements = doc.Statement;
  if (!Array.isArray(statements)) throw new Error("Paste an IAM policy document with a 'Statement' array.");
  const findings: IamFinding[] = [];
  statements.forEach((entry, index) => {
    const stmt = entry as Record<string, unknown>;
    const effect = String(stmt.Effect ?? "").toUpperCase();
    if (effect !== "ALLOW" && effect !== "DENY") findings.push({ severity: "warning", statement: index + 1, message: "Effect must be Allow or Deny." });
    const actions = Array.isArray(stmt.Action) ? stmt.Action.map(String) : stmt.Action ? [String(stmt.Action)] : [];
    const resources = Array.isArray(stmt.Resource) ? stmt.Resource.map(String) : stmt.Resource ? [String(stmt.Resource)] : [];
    if (!actions.length) findings.push({ severity: "warning", statement: index + 1, message: "Statement has no Action." });
    if (!resources.length) findings.push({ severity: "warning", statement: index + 1, message: "Statement has no Resource." });
    for (const action of actions) {
      if (effect === "ALLOW" && (action === "*" || action.includes(":*"))) findings.push({ severity: "danger", statement: index + 1, message: `Wildcard action '${action}' - prefer enumerating specific actions.` });
      if (effect === "ALLOW" && DANGEROUS_ACTIONS.has(action)) findings.push({ severity: "danger", statement: index + 1, message: `Privileged action '${action}' - confirm this grant is required.` });
    }
    if (effect === "ALLOW" && resources.includes("*")) findings.push({ severity: "danger", statement: index + 1, message: "Resource '*' grants access to the whole account - narrow the resource ARN." });
    if (effect === "DENY") findings.push({ severity: "warning", statement: index + 1, message: "Deny statements override Allow statements - confirm intent." });
  });
  return { findings, statementCount: statements.length, ok: findings.every((finding) => finding.severity !== "danger") };
}

/** Lint a PromQL expression for common syntax mistakes. */
export function lintPromQl(expression: string): ConfigReport {
  const value = expression.trim();
  if (!value) throw new Error("Paste a PromQL expression first.");
  const issues: ConfigIssue[] = [];
  let braceDepth = 0;
  for (const char of value) {
    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth -= 1;
    if (braceDepth < 0) { issues.push({ line: 1, message: "Unexpected '}' in label matchers." }); braceDepth = 0; }
  }
  if (braceDepth !== 0) issues.push({ line: 1, message: "Unbalanced '{' in label matchers." });
  let parenDepth = 0;
  for (const char of value) {
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (parenDepth < 0) { issues.push({ line: 1, message: "Unexpected ')'." }); parenDepth = 0; }
  }
  if (parenDepth !== 0) issues.push({ line: 1, message: "Unbalanced parentheses." });
  const window = value.match(/\[(\d+)([a-zA-Z]+)\]/);
  if (window && !/^(ms|s|m|h|d|w|y)$/.test(window[2])) issues.push({ line: 1, message: `Unknown range unit '${window[2]}' - use ms, s, m, h, d, w or y.` });
  if (/\brate\s*\(\s*[a-zA-Z_:][a-zA-Z0-9_:]*\s*\)/.test(value)) issues.push({ line: 1, message: "rate() needs a range vector, for example rate(metric[5m])." });
  const quantile = value.match(/histogram_quantile\s*\(\s*([\d.]+)/);
  if (quantile && !(Number(quantile[1]) > 0 && Number(quantile[1]) < 1)) issues.push({ line: 1, message: `Quantile ${quantile[1]} must be between 0 and 1.` });
  return { ok: issues.length === 0, issues };
}
