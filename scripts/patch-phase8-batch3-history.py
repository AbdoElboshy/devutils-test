#!/usr/bin/env python3
"""Phase 8 Batch 3: workflow execution history & logs.

Creates src/lib/workflow-history.ts (pure + localStorage):
  - recordRun({workflowId, workflowName, run?, failure?}) -> WorkflowRunLog
  - listRuns(workflowId) newest-first, clearRuns, clearAllRuns
  - cap 50 runs globally, key du:v1:workflow-run-history
  - PRIVACY: stores timestamps, step labels, durations, success/failure
    message only. Never input, never output.

Patches src/pages/workflows.tsx (5 anchored edits, verified against the
file as rewritten in batch 2 / master 581cade):
  1. + import recordRun/listRuns/clearRuns/WorkflowRunLog
  2. + runs state after versions state
  3. + runs refresh effect after versions effect
  4. execute(): success path records run; catch path records failure
  5. Run history panel before </aside> (newest-first, clear, privacy note)

Patches scripts/verify.ts (+10 p8b3 tests).

Anchors (all x1, verified against master 581cade):
- page: 'import { snapshotVersion, listVersions, clearVersions, type WorkflowVersionRecord } from "../lib/workflow-versions";'
- page: '  const [versions, setVersions] = useState<WorkflowVersionRecord[]>([]);'
- page: '  useEffect(() => { setVersions(listVersions(selected.id)); }, [selected.id, saved]);'
- page: '      setRun(await executeWorkflow(selected, input));'
- page: '    } catch (cause) { setError(cause instanceof Error ? cause.message : "Workflow failed."); }'
- page: '        </aside>'
- verify: 'import { snapshotVersion, listVersions, clearVersions, clearAllVersions } from "../src/lib/workflow-versions";'
- verify: '  eq("p8b2: clearAllVersions empties history", listVersions("wf-other").length, 0);\n}'

Idempotent: history lib aborts if present; page aborts if "recordRun" present
(other than none); verify aborts if "p8b3:" present.
"""
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent


def one(s, old, new, n=1):
    c = s.count(old)
    assert c == n, "anchor found {}x (expected {}): {!r}".format(c, n, old[:70])
    return s.replace(old, new, n)


# ---------------- 1. src/lib/workflow-history.ts (new) ----------------
p = root / "src/lib/workflow-history.ts"
if p.exists():
    print("ABORT: workflow-history.ts already exists")
    sys.exit(1)

HISTORY = '''// Workflow run history - what ran, when, how long, and what failed.
// PRIVACY CONTRACT: timestamps, step labels, durations and a short failure
// message only. Workflow input and output content are never recorded.
import type { WorkflowRun } from "../platform/workflows";

const KEY = "du:v1:workflow-run-history";
const MAX_RUNS = 50;

export type WorkflowRunStepLog = { label: string; durationMs: number };

export type WorkflowRunLog = {
  id: string;
  workflowId: string;
  workflowName: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  success: boolean;
  failure?: string;
  steps: WorkflowRunStepLog[];
};

function read(): WorkflowRunLog[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as WorkflowRunLog[] : [];
  } catch { return []; }
}

function write(records: WorkflowRunLog[]): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(records)); } catch { /* quota/privacy mode */ }
}

/** Record a completed run (pass run) or a failure (pass failure). */
export function recordRun(input: { workflowId: string; workflowName: string; run?: WorkflowRun; failure?: string }): WorkflowRunLog {
  const now = new Date().toISOString();
  const record: WorkflowRunLog = {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    workflowId: input.workflowId,
    workflowName: input.workflowName,
    startedAt: input.run?.startedAt ?? now,
    completedAt: input.run?.completedAt ?? now,
    durationMs: input.run ? input.run.steps.reduce((sum, result) => sum + result.durationMs, 0) : 0,
    success: Boolean(input.run),
    failure: input.failure,
    steps: input.run ? input.run.steps.map((result) => ({ label: result.step.label, durationMs: result.durationMs })) : [],
  };
  write([record, ...read()].slice(0, MAX_RUNS));
  return record;
}

export function listRuns(workflowId: string): WorkflowRunLog[] {
  return read().filter((record) => record.workflowId === workflowId);
}

export function clearRuns(workflowId: string): void {
  write(read().filter((record) => record.workflowId !== workflowId));
}

export function clearAllRuns(): void {
  write([]);
}
'''
p.write_text(HISTORY, encoding="utf-8")
print("workflow-history.ts: privacy-safe run history written")

# ---------------- 2. src/pages/workflows.tsx (5 anchored edits) ----------------
p = root / "src/pages/workflows.tsx"
s = p.read_text(encoding="utf-8")
if "recordRun" in s:
    print("ABORT: workflows.tsx already patched")
    sys.exit(1)
assert "export function WorkflowsPage" in s, "unexpected workflows.tsx"

s = one(
    s,
    'import { snapshotVersion, listVersions, clearVersions, type WorkflowVersionRecord } from "../lib/workflow-versions";',
    'import { snapshotVersion, listVersions, clearVersions, type WorkflowVersionRecord } from "../lib/workflow-versions";\nimport { recordRun, listRuns, clearRuns, type WorkflowRunLog } from "../lib/workflow-history";',
    1,
)
s = one(
    s,
    '  const [versions, setVersions] = useState<WorkflowVersionRecord[]>([]);',
    '  const [versions, setVersions] = useState<WorkflowVersionRecord[]>([]);\n  const [runs, setRuns] = useState<WorkflowRunLog[]>([]);',
    1,
)
s = one(
    s,
    '  useEffect(() => { setVersions(listVersions(selected.id)); }, [selected.id, saved]);',
    '  useEffect(() => { setVersions(listVersions(selected.id)); }, [selected.id, saved]);\n  useEffect(() => { setRuns(listRuns(selected.id)); }, [selected.id]);',
    1,
)
s = one(
    s,
    '      setRun(await executeWorkflow(selected, input));',
    '      const result = await executeWorkflow(selected, input);\n      setRun(result);\n      recordRun({ workflowId: selected.id, workflowName: selected.name, run: result });\n      setRuns(listRuns(selected.id));',
    1,
)
s = one(
    s,
    '    } catch (cause) { setError(cause instanceof Error ? cause.message : "Workflow failed."); }',
    '    } catch (cause) {\n      const message = cause instanceof Error ? cause.message : "Workflow failed.";\n      setError(message);\n      recordRun({ workflowId: selected.id, workflowName: selected.name, failure: message });\n      setRuns(listRuns(selected.id));\n    }',
    1,
)
s = one(
    s,
    '        </aside>',
    '''        {runs.length > 0 && (
          <Panel className="p-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Run history</p>
              <button type="button" className="text-[10px] text-zinc-400 hover:text-red-500" onClick={() => { clearRuns(selected.id); setRuns([]); }}>Clear</button>
            </div>
            <div className="mt-2 space-y-1">
              {runs.map((record) => (
                <div key={record.id} className="flex items-center gap-1.5 px-2 py-1 text-[11.5px]">
                  <span className={cn(record.success ? "text-emerald-500" : "text-red-500")}>{record.success ? <Check size={12} /> : <X size={12} />}</span>
                  <span className="flex-1 truncate text-zinc-500">{new Date(record.completedAt).toLocaleTimeString()} · {(record.durationMs / 1000).toFixed(2)}s · {record.steps.length} steps</span>
                  <span title={record.failure ?? ""} className="max-w-24 truncate font-mono text-[10px] text-zinc-400">{record.success ? "ok" : "failed"}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 px-1 text-[10px] text-zinc-400">Timestamps and durations only. Inputs and outputs are never recorded.</p>
          </Panel>
        )}
        </aside>''',
    1,
)
p.write_text(s, encoding="utf-8")
print("workflows.tsx: run recording + history panel wired")

# ---------------- 3. scripts/verify.ts (+10 tests) ----------------
p = root / "scripts/verify.ts"
s = p.read_text(encoding="utf-8")
if "p8b3:" in s:
    print("ABORT: verify.ts already patched")
    sys.exit(1)

s = one(
    s,
    'import { snapshotVersion, listVersions, clearVersions, clearAllVersions } from "../src/lib/workflow-versions";',
    'import { snapshotVersion, listVersions, clearVersions, clearAllVersions } from "../src/lib/workflow-versions";\nimport type { WorkflowRun } from "../src/platform/workflows";\nimport { recordRun, listRuns, clearRuns, clearAllRuns } from "../src/lib/workflow-history";',
    1,
)

TESTS = r'''
// --- P8 B3: workflow run history - privacy-safe, no payloads ---
{
  clearAllRuns();
  const run = {
    workflowId: "wf-h",
    startedAt: "2026-01-01T00:00:01.000Z",
    completedAt: "2026-01-01T00:00:02.000Z",
    steps: [
      { step: { id: "v", operationId: "json.validate", label: "Validate" }, output: "supersecret-output-value", durationMs: 5 },
      { step: { id: "f", operationId: "json.format", label: "Format" }, output: { nested: "data" }, durationMs: 7 },
    ],
    output: "final-secret-payload",
  } as unknown as WorkflowRun;
  recordRun({ workflowId: "wf-h", workflowName: "History test", run });
  recordRun({ workflowId: "wf-h", workflowName: "History test", failure: "Step 2 exploded" });
  const logs = listRuns("wf-h");
  eq("p8b3: failure recorded newest-first", [logs.length, logs[0]!.success, logs[1]!.success], [2, false, true]);
  eq("p8b3: step labels and durations kept", logs[1]!.steps.map((entry) => entry.label), ["Validate", "Format"]);
  eq("p8b3: total duration summed", logs[1]!.durationMs, 12);
  eq("p8b3: no output payload persisted", JSON.stringify(logs).includes("secret"), false);
  eq("p8b3: failure message persisted", logs[0]!.failure ?? "", "Step 2 exploded");
  recordRun({ workflowId: "wf-other", workflowName: "Other", failure: "x" });
  eq("p8b3: per-workflow filter", listRuns("wf-h").length, 2);
  for (let i = 0; i < 60; i++) recordRun({ workflowId: "wf-cap", workflowName: "Cap", failure: "x" });
  eq("p8b3: history capped at 50", listRuns("wf-cap").length, 50);
  clearRuns("wf-h");
  eq("p8b3: clear removes only target", [listRuns("wf-h").length, listRuns("wf-other").length], [0, 1]);
  clearAllRuns();
  eq("p8b3: clearAll empties history", listRuns("wf-other").length, 0);
}
'''
s = one(
    s,
    '  eq("p8b2: clearAllVersions empties history", listVersions("wf-other").length, 0);\n}',
    '  eq("p8b2: clearAllVersions empties history", listVersions("wf-other").length, 0);\n}\n' + TESTS,
    1,
)
p.write_text(s, encoding="utf-8")
print("verify.ts: +10 run-history regression tests")
print("PATCH 3 OK — expect 303 passed, 0 failed (293 + 10)")
