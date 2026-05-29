/**
 * Kimi WebBridge v2.0 — Workflow Schema
 *
 * Types and validation for declarative workflow definitions.
 */

export type WorkflowTool =
  | "click"
  | "fill"
  | "select_option"
  | "scroll_to"
  | "hover"
  | "click_at"
  | "wait"
  | "snapshot";

export interface WorkflowStep {
  id: string;
  tool: WorkflowTool;
  args: Record<string, unknown>;
  timeoutMs?: number;
  onError?: "continue" | "stop" | "retry";
}

export interface Workflow {
  name: string;
  version: string;
  variables: string[];
  steps: WorkflowStep[];
}

const VALID_TOOLS: WorkflowTool[] = [
  "click",
  "fill",
  "select_option",
  "scroll_to",
  "hover",
  "click_at",
  "wait",
  "snapshot",
];

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isValidTool(value: unknown): value is WorkflowTool {
  return typeof value === "string" && (VALID_TOOLS as string[]).includes(value);
}

export function validateWorkflow(wf: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof wf !== "object" || wf === null) {
    return { valid: false, errors: ["Workflow must be an object"] };
  }

  const obj = wf as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name.length === 0) {
    errors.push("Workflow 'name' must be a non-empty string");
  }

  if (typeof obj.version !== "string" || obj.version.length === 0) {
    errors.push("Workflow 'version' must be a non-empty string");
  }

  if (!isStringArray(obj.variables)) {
    errors.push("Workflow 'variables' must be an array of strings");
  }

  if (!Array.isArray(obj.steps)) {
    errors.push("Workflow 'steps' must be an array");
    return { valid: false, errors };
  }

  for (let i = 0; i < obj.steps.length; i++) {
    const step = obj.steps[i];
    if (typeof step !== "object" || step === null) {
      errors.push(`Step ${i} must be an object`);
      continue;
    }

    const s = step as Record<string, unknown>;

    if (typeof s.id !== "string" || s.id.length === 0) {
      errors.push(`Step ${i} must have a non-empty 'id'`);
    }

    if (!isValidTool(s.tool)) {
      errors.push(`Step ${i} has invalid tool "${String(s.tool)}"`);
    }

    if (typeof s.args !== "object" || s.args === null) {
      errors.push(`Step ${i} must have an 'args' object`);
    }

    if (s.timeoutMs !== undefined && typeof s.timeoutMs !== "number") {
      errors.push(`Step ${i} 'timeoutMs' must be a number`);
    }

    if (s.onError !== undefined && s.onError !== "continue" && s.onError !== "stop" && s.onError !== "retry") {
      errors.push(`Step ${i} 'onError' must be "continue", "stop", or "retry"`);
    }
  }

  return { valid: errors.length === 0, errors };
}
