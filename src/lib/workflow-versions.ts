// Local workflow version history - snapshots of the state that was replaced,
// so an edit can be rolled back. Five most recent snapshots per workflow.
import type { SavedWorkflow } from "../platform/models";

const KEY = "du:v1:workflow-versions";
const MAX_VERSIONS = 5;

export type WorkflowVersionRecord = {
  workflowId: string;
  version: number;
  savedAt: string;
  workflow: SavedWorkflow;
};

function read(): WorkflowVersionRecord[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as WorkflowVersionRecord[] : [];
  } catch { return []; }
}

function write(records: WorkflowVersionRecord[]): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(records)); } catch { /* quota/privacy mode */ }
}

/** Snapshot the workflow state that is about to be replaced. */
export function snapshotVersion(workflow: SavedWorkflow): void {
  const mine = read().filter((record) => record.workflowId === workflow.id);
  const version = mine.reduce((max, record) => Math.max(max, record.version), 0) + 1;
  const next = [...mine, { workflowId: workflow.id, version, savedAt: new Date().toISOString(), workflow }].slice(-MAX_VERSIONS);
  write([...read().filter((record) => record.workflowId !== workflow.id), ...next]);
}

export function listVersions(workflowId: string): WorkflowVersionRecord[] {
  return read().filter((record) => record.workflowId === workflowId).sort((a, b) => b.version - a.version);
}

export function clearVersions(workflowId: string): void {
  write(read().filter((record) => record.workflowId !== workflowId));
}

export function clearAllVersions(): void {
  write([]);
}
