import { operations } from "./operations";
import type { SavedWorkflow, WorkflowStep } from "./models";

export type WorkflowStepResult = {
  step: WorkflowStep;
  output: unknown;
  durationMs: number;
};

export type WorkflowRun = {
  workflowId: string;
  startedAt: string;
  completedAt: string;
  steps: WorkflowStepResult[];
  output: unknown;
};

export async function executeWorkflow(workflow: SavedWorkflow, input: unknown): Promise<WorkflowRun> {
  const startedAt = new Date().toISOString();
  let value = input;
  const results: WorkflowStepResult[] = [];
  for (const step of workflow.steps) {
    const start = performance.now();
    value = await operations.execute(step.operationId, value, step.config);
    results.push({ step, output: value, durationMs: Math.max(0, performance.now() - start) });
  }
  return {
    workflowId: workflow.id,
    startedAt,
    completedAt: new Date().toISOString(),
    steps: results,
    output: value,
  };
}

export function displayWorkflowValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}