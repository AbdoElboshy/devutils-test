// Workflow validation and import/export parsing - pure module so it is
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
