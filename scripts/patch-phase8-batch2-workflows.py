#!/usr/bin/env python3
"""Phase 8 Batch 2: workflow editor on the existing /workflows page.

Verified state of master 2ed2015:
- src/platform/workflows.ts: executeWorkflow (sequential loop over
  platform.operations) + displayWorkflowValue. No validation before run.
- src/data/workflows.ts: 7 templates (WorkflowTemplate = SavedWorkflow +
  category/sampleInput/relatedToolIds), getWorkflowTemplate.
- src/pages/workflows.tsx: templates library, save-to-local, run + per-step
  results, favorites, usage consume. NO editing, duplication, import/export,
  versioning, or save/run validation.
- SavedWorkflow model: version is literal 1; repo caps 20 steps and
  sanitizes config on save (validWorkflow in local-repositories.ts).
- capabilities.getLimit(null, "saved_workflows") = 12 (anonymous).

Batch 2 changes:
1. src/lib/workflow-io.ts (NEW, pure, Node-testable): validateSteps()
   static validation (>=1 step, <=20 steps, known operation, unique step ids,
   label 1..100, config values string/number/boolean only),
   serializeWorkflowExport(), parseWorkflowExport() (schema-validated import).
2. src/lib/workflow-versions.ts (NEW, pure + localStorage): snapshotVersion()
   records the state about to be replaced; listVersions() newest-first;
   clearVersions()/clearAllVersions(); cap 5 per workflow; key
   du:v1:workflow-versions.
3. src/pages/workflows.tsx: full rewrite preserving ALL existing behavior
   (templates, favorites, save-locally, run + per-step timings, usage
   consume, related tools, privacy badge) and adding: New workflow,
   Duplicate (custom copy, plan-limit checked), Export (JSON download),
   Import (file, schema-validated, plan-limit checked), Edit (label,
   operation select, config JSON, move up/down, remove, add step),
   pre-run validateSteps, save-time snapshot + Version history panel with
   one-click rollback.
4. scripts/verify.ts: +17 tests (p8b2:) — validation rejections (empty,
   unknown op, >20, duplicate ids, bad config type, long label), valid chain
   passes, import rejections (malformed, no name, no steps), import mapping,
   version numbering/order/content/cap/clear, save+reload round-trip.

Anchors (verified against master 2ed2015):
- verify.ts import: 'import { localPinnedTools, localCollections, localPresets } from "../src/platform/local-repositories";' (x1)
- verify.ts import: 'import { parsePresetExport } from "../src/lib/preset-io";' (x1)
- verify.ts p8b1 block end: '  eq("p8b1: cleanup restores count", (await localPresets.list()).length, before);' + '\\n}' (x1)

Idempotency: workflow-io.ts / workflow-versions.ts abort if present;
workflows.tsx aborts if it already contains startNew; verify.ts aborts on p8b2:.
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

# ---------------- 3. src/pages/workflows.tsx (full rewrite) ----------------
p = root / "src/pages/workflows.tsx"
s = p.read_text(encoding="utf-8")
if "startNew" in s:
    print("ABORT: workflows.tsx already upgraded")
    sys.exit(1)
# Sanity: the file must be the known current version before a full rewrite.
assert "export function WorkflowsPage" in s, "unexpected workflows.tsx content"
assert "Chain deterministic DevUtils operations." in s, "unexpected workflows.tsx content"

NEW_PAGE = '''import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BookmarkPlus, Check, Copy, Download, Pencil, Play, Plus, Star, Trash2, Upload, Workflow as WorkflowIcon, X } from "lucide-react";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "../data/workflows";
import { displayWorkflowValue, executeWorkflow, type WorkflowRun } from "../platform/workflows";
import { capabilities, platform, type SavedWorkflow, type Workflow