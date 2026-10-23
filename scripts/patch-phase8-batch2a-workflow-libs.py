#!/usr/bin/env python3
"""Phase 8 Batch 2, part A of 2: pure workflow libs + verify tests.

Part B (scripts/patch-phase8-batch2b-workflows-page.py) rewrites the
/workflows page using these libs. Run A first, then B.

Creates:
  src/lib/workflow-io.ts       - validateSteps(), serializeWorkflowExport(),
                                 parseWorkflowExport() (schema-validated).
  src/lib/workflow-versions.ts - snapshotVersion(), listVersions(),
                                 clearVersions(), clearAllVersions()
                                 (localStorage, 5 snapshots per workflow).

Patches scripts/verify.ts: +17 p8b2 tests.

Anchors (verified against master 2ed2015):
- 'import { localPinnedTools, localCollections, localPresets } from "../src/platform/local-repositories";' (x1)
- 'import { parsePresetExport } from "../src/lib/preset-io";' (x1)
- '  eq("p8b1: cleanup restores count", (await localPresets.list()).length, before);\n}' (x1)

Idempotent: new files abort if they exist; verify.ts aborts if "p8b2:" present.
"""
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent


def one(s, old, new, n=1):
    c = s.count(old)
    assert c == n, "anchor found {}x (expected {}): {!r}".format(c, n, old[:70])
    return s.replace(old, new, n)


# ---------------- 1. src/lib/workflow-io.ts (new, pure) ----------------
p = root / "src/lib/workflow-io.ts"
if p.exists():
    print("ABORT: workflow-io.ts already exists")
    sys.exit(1)

WORKFLOW_IO = '''// Workflow validation and import/export parsing - pure module so it is
// unit-testable in Node without importing React or localStorage.
import type { SavedWorkflow, WorkflowStep } from "../platform/models";

/** Portable workflow file shape (no ids or timestamps - those are local). */
export type WorkflowExport = {
  name: string;
  description: string;
  steps: { operationId: string; label: string; config?: Record<string, boolean | number | string> }[];
};

export type StepIssue = { index: number; message: string };

export const MAX_WORKFLOW_STEPS = 20;

/** Static validation between and within steps. Runs before save and before run. */
export function validateSteps(
  steps: Pick<WorkflowStep, "id" | "operationId" | "label" | "config">[],
  knownOperationIds: readonly string[],
): StepIssue[] {
  const issues: StepIssue[] = [];
  if (!steps.length) issues.push({ index: 0, message: "A workflow needs at least one step." });
  if (steps.length > MAX_WORKFLOW_STEPS) issues.push({ index: MAX_WORKFLOW_STEPS, message: `Workflows support at most ${MAX_WORKFLOW_STEPS} steps.` });
  const seenIds = new Set<string>();
  steps.forEach((step, index) => {
    if (seenIds.has(step.id)) issues.push({ index, message: `Duplicate step id: "${step.id}".` });
    else seenIds.add(step.id);
    if (!knownOperationIds.includes(step.operationId)) issues.push({ index, message: `Unknown operation: "${step.operationId}".` });
    const label = (step.label ?? "").trim();
    if (!label) issues.push({ index, message: "Step label cannot be empty." });
    else if (label.length > 100) issues.push({ index, message: "Step label is longer than 100 characters." });
    if (step.config) {
      for (const [key, value] of Object.entries(step.config)) {
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
          issues.push({ index, message: `Config "${key}" must be a string, number or boolean.` });
        }
      }
    }
  });
  return issues;
}

export function serializeWorkflowExport(workflow: SavedWorkflow): WorkflowExport {
  return {
    name: workflow.name,
    description: workflow.description,
    steps: workflow.steps.map((step) => ({ operationId: step.operationId, label: step.label, config: step.config })),
  };
}

/** Parse and validate a workflow file. Throws a plain Error with a fix message. */
export function parseWorkflowExport(raw: string): SavedWorkflow {
  const value = JSON.parse(raw) as Record<string, unknown>;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Workflow file must be a JSON object.");
  const name = String(value.name ?? "").trim().slice(0, 100);
  if (!name) throw new Error("Workflow file has no name.");
  const description = String(value.description ?? "").trim().slice(0, 500);
  if (!Array.isArray(value.steps)) throw new Error("Workflow file has no steps array.");
  if (!value.steps.length) throw new Error("Workflow file has no steps.");
  if (value.steps.length > MAX_WORKFLOW_STEPS) throw new Error(`Workflows support at most ${MAX_WORKFLOW_STEPS} steps.`);
  const steps: WorkflowStep[] = value.steps.map((entry, index) => {
    const step = entry as Record<string, unknown>;
    const operationId = String(step?.operationId ?? "");
    const label = String(step?.label ?? "").trim().slice(0, 100) || operationId;
    const config: Record<string, boolean | number | string> = {};
    if (step?.config && typeof step.config === "object" && !Array.isArray(step.config)) {
      for (const [key, val] of Object.entries(step.config as Record<string, unknown>)) {
        if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") config[key] = val;
      }
    }
    return { id: `imported-${index}`, operationId, label, config: Object.keys(config).length ? config : undefined };
  });
  const now = new Date().toISOString();
  return {
    id: `imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description,
    steps,
    source: "custom",
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}
'''
p.write_text(WORKFLOW_IO, encoding="utf-8")
print("workflow-io.ts: validation + import/export written")

# ---------------- 2. src/lib/workflow-versions.ts (new) ----------------
p = root / "src/lib/workflow-versions.ts"
if p.exists():
    print("ABORT: workflow-versions.ts already exists")
    sys.exit(1)

VERSIONS = '''// Local workflow version history - snapshots of the state that was replaced,
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
'''
p.write_text(VERSIONS, encoding="utf-8")
print("workflow-versions.ts: snapshot/rollback history written")

# ---------------- 3. scripts/verify.ts (+17 tests) ----------------
p = root / "scripts/verify.ts"
s = p.read_text(encoding="utf-8")
if "p8b2:" in s:
    print("ABORT: verify.ts already patched")
    sys.exit(1)

s = one(
    s,
    'import { localPinnedTools, localCollections, localPresets } from "../src/platform/local-repositories";',
    'import { localPinnedTools, localCollections, localPresets } from "../src/platform/local-repositories";\nimport { operations } from "../src/platform/operations";',
    1,
)
s = one(
    s,
    'import { parsePresetExport } from "../src/lib/preset-io";',
    'import { parsePresetExport } from "../src/lib/preset-io";\nimport { validateSteps, serializeWorkflowExport, parseWorkflowExport } from "../src/lib/workflow-io";\nimport { snapshotVersion, listVersions, clearVersions, clearAllVersions } from "../src/lib/workflow-versions";',
    1,
)

TESTS = r'''
// --- P8 B2: workflows — static validation, import/export, versioning ---
{
  const known = operations.list().map((op) => op.id);
  const step = (id: string, operationId: string, label: string, config?: Record<string, boolean | number | string>) => ({ id, operationId, label, ...(config ? { config } : {}) });
  eq("p8b2: empty steps rejected", validateSteps([], known).length > 0, true);
  eq("p8b2: unknown operation rejected", validateSteps([step("a", "nope.nope", "A")], known).some((i) => i.message.includes("Unknown operation")), true);
  eq("p8b2: over 20 steps rejected", validateSteps(Array.from({ length: 21 }, (_, i) => step(`s${i}`, "json.validate", `S${i}`)), known).length > 0, true);
  eq("p8b2: duplicate step ids rejected", validateSteps([step("a", "json.validate", "A"), step("a", "json.format", "B")], known).some((i) => i.message.includes("Duplicate")), true);
  eq("p8b2: bad config type rejected", validateSteps([step("a", "json.validate", "A", { bad: null as unknown as boolean })], known).some((i) => i.message.includes("must be a string")), true);
  eq("p8b2: over-long label rejected", validateSteps([step("a", "json.validate", "x".repeat(101))], known).some((i) => i.message.includes("100 characters")), true);
  eq("p8b2: valid chain passes", validateSteps([step("v", "json.validate", "Validate"), step("f", "json.format", "Format"), step("y", "json.to-yaml", "To YAML")], known), []);
  let threw = false;
  try { parseWorkflowExport("{bad json"); } catch { threw = true; }
  eq("p8b2: malformed import rejected", threw, true);
  threw = false;
  try { parseWorkflowExport('{"steps":[{"operationId":"json.validate","label":"V"}]}'); } catch { threw = true; }
  eq("p8b2: nameless import rejected", threw, true);
  threw = false;
  try { parseWorkflowExport('{"name":"x","steps":[]}'); } catch { threw = true; }
  eq("p8b2: steps-less import rejected", threw, true);
  const imported = parseWorkflowExport('{"name":"Imported","description":"d","steps":[{"operationId":"json.validate","label":"V"},{"operationId":"json.format","label":"F"}]}');
  eq("p8b2: import maps steps and source", [imported.source, imported.steps.map((st) => st.operationId)], ["custom", ["json.validate", "json.format"]]);
  const base = { id: "wf-rt", name: "RT", description: "roundtrip", steps: [step("v", "json.validate", "Validate"), step("f", "json.format", "Format")], source: "custom" as const, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", version: 1 as const };
  const rt = parseWorkflowExport(JSON.stringify(serializeWorkflowExport(base)));
  eq("p8b2: export round trip keeps steps", rt.steps.map((st) => st.operationId), ["json.validate", "json.format"]);
  clearAllVersions();
  const wf = { ...base, id: "wf-ver" };
  snapshotVersion(wf);
  eq("p8b2: snapshot creates version 1", listVersions("wf-ver")[0]!.version, 1);
  snapshotVersion({ ...wf, name: "Second" });
  eq("p8b2: second snapshot newest-first", listVersions("wf-ver").map((r) => r.version), [2, 1]);
  for (let i = 0; i < 7; i++) snapshotVersion({ ...wf, name: `N${i}` });
  eq("p8b2: history capped at 5", listVersions("wf-ver").length, 5);
  snapshotVersion({ ...base, id: "wf-other" });
  clearVersions("wf-ver");
  eq("p8b2: clearVersions removes only target", [listVersions("wf-ver").length, listVersions("wf-other").length], [0, 1]);
  clearAllVersions();
  eq("p8b2: clearAllVersions empties history", listVersions("wf-other").length, 0);
}
'''
s = one(
    s,
    '  eq("p8b1: cleanup restores count", (await localPresets.list()).length, before);\n}',
    '  eq("p8b1: cleanup restores count", (await localPresets.list()).length, before);\n}\n' + TESTS,
    1,
)
p.write_text(s, encoding="utf-8")
print("verify.ts: +17 workflow regression tests")
print("PATCH A OK — expect 293 passed, 0 failed (276 + 17)")
