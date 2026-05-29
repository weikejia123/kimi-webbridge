/**
 * Kimi WebBridge v2.0 — Batch Runner
 *
 * Executes a workflow against multiple CSV rows sequentially.
 */

import type { BridgeResponse } from "../shared/protocol.js";
import type { ToolContext } from "../tools/registry.js";
import { extensionRouter } from "../extension/router.js";
import type { Workflow, WorkflowStep } from "./workflowSchema.js";
import type { CsvRow } from "./csvParser.js";
import { substituteInObject } from "./variableSubstitutor.js";

export interface BatchResult {
  rowIndex: number;
  success: boolean;
  stepResults: Array<{ stepId: string; success: boolean; error?: string }>;
  durationMs: number;
}

const MAX_RETRIES = 3;

function mapWorkflowToolToExtensionTool(step: WorkflowStep): { tool: string; args: Record<string, unknown> } {
  switch (step.tool) {
    case "click":
      return { tool: "click_ref", args: step.args };
    case "snapshot":
      return { tool: "get_page_state", args: step.args };
    case "wait": {
      // If ms is provided, we'll handle locally; otherwise forward to wait_for
      if (typeof step.args.ms === "number") {
        return { tool: "__delay__", args: step.args };
      }
      return { tool: "wait_for", args: step.args };
    }
    default:
      return { tool: step.tool, args: step.args };
  }
}

async function executeDelay(args: Record<string, unknown>): Promise<BridgeResponse> {
  const ms = typeof args.ms === "number" ? args.ms : 0;
  await new Promise((resolve) => setTimeout(resolve, ms));
  return {
    v: "2.0",
    id: "",
    ok: true,
    tool: "wait",
    result: { delayedMs: ms },
    error: null,
    warnings: [],
    telemetry: { durationMs: ms },
  };
}

async function executeStep(
  step: WorkflowStep,
  ctx: ToolContext,
): Promise<{ success: boolean; error?: string; response: BridgeResponse }> {
  const mapped = mapWorkflowToolToExtensionTool(step);
  const timeoutMs = step.timeoutMs ?? ctx.timeoutMs ?? 30000;
  const requestId = `step_${step.id}_${Date.now()}`;

  try {
    let response: BridgeResponse;

    if (mapped.tool === "__delay__") {
      response = await executeDelay(mapped.args);
    } else {
      response = await extensionRouter.sendCommand(
        ctx.tabId,
        ctx.frameId,
        mapped.tool,
        mapped.args,
        timeoutMs,
        requestId,
      );
    }

    if (response.ok) {
      return { success: true, response };
    }

    const errorMessage = response.error?.message ?? "Unknown error";
    return { success: false, error: errorMessage, response };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
      response: {
        v: "2.0",
        id: requestId,
        ok: false,
        tool: mapped.tool,
        result: null,
        error: {
          code: "UNKNOWN_ERROR",
          message,
          recoverable: true,
        },
        warnings: [],
        telemetry: { durationMs: 0 },
      },
    };
  }
}

async function runRow(
  workflow: Workflow,
  row: CsvRow,
  ctx: ToolContext,
): Promise<BatchResult> {
  const start = Date.now();
  const stepResults: Array<{ stepId: string; success: boolean; error?: string }> = [];
  let rowSuccess = true;

  for (const step of workflow.steps) {
    const substitutedStep: WorkflowStep = {
      ...step,
      args: substituteInObject(step.args, row.values) as Record<string, unknown>,
    };

    let attempts = 0;
    let stepSuccess = false;
    let stepError: string | undefined;

    while (attempts < MAX_RETRIES) {
      attempts++;
      const result = await executeStep(substitutedStep, ctx);

      if (result.success) {
        stepSuccess = true;
        break;
      }

      stepError = result.error;

      if (step.onError !== "retry") {
        break;
      }

      // Small backoff before retry
      if (attempts < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempts));
      }
    }

    const stepResult: { stepId: string; success: boolean; error?: string } = {
      stepId: step.id,
      success: stepSuccess,
    };
    if (stepError !== undefined) {
      stepResult.error = stepError;
    }
    stepResults.push(stepResult);

    if (!stepSuccess) {
      rowSuccess = false;
      if (step.onError === "stop" || step.onError === undefined) {
        break;
      }
      // "continue" or "retry" (after exhausting retries) -> keep going
    }
  }

  return {
    rowIndex: row.rowIndex,
    success: rowSuccess,
    stepResults,
    durationMs: Date.now() - start,
  };
}

export async function runBatch(
  workflow: Workflow,
  csvRows: CsvRow[],
  ctx: ToolContext,
): Promise<BatchResult[]> {
  const results: BatchResult[] = [];

  for (const row of csvRows) {
    const result = await runRow(workflow, row, ctx);
    results.push(result);
  }

  return results;
}
