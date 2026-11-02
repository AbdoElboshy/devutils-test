// Workflow run history - what ran, when, how long, and what failed.
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
  const others = read().filter((entry) => entry.workflowId !== input.workflowId);
  const mine = [record, ...read().filter((entry) => entry.workflowId === input.workflowId)].slice(0, MAX_RUNS);
  write([...mine, ...others]);
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
