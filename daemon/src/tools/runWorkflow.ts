/**
 * Kimi WebBridge v2.0 — run_workflow Tool Handler
 *
 * Executes a single workflow with optional inline variable substitution.
 */

import type { BridgeResponse } from "../shared/protocol.js";
import { createResponse, createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import type { Workflow } from "../workflow/workflowSchema.js";
import { validateWorkflow } from "../workflow/workflowSchema.js";
import { runBatch } from "../workflow/batchRunner.js";

export async function handleRunWorkflow(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const start = Date.now();

  if (typeof args !== "object" || args === null) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument("args must be an object"));
  }

  const obj = args as Record<string, unknown>;
  const workflow = obj.workflow as Workflow | undefined;

  if (!workflow || typeof workflow !== "object") {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument("Missing 'workflow' object"));
  }

  const validation = validateWorkflow(workflow);
  if (!validation.valid) {
    return createErrorResponse(
      ctx.command,
      errorFactory.invalidArgument(`Workflow validation failed: ${validation.errors.join("; ")}`),
    );
  }

  const variables =
    typeof obj.variables === "object" && obj.variables !== null
      ? (obj.variables as Record<string, string>)
      : {};

  const syntheticRow = { rowIndex: 0, values: variables };
  const results = await runBatch(workflow, [syntheticRow], ctx);
  const rowResult = results[0];

  if (!rowResult) {
    return createErrorResponse(ctx.command, errorFactory.unknownError("Batch runner returned no results"));
  }

  return createResponse(
    ctx.command,
    {
      success: rowResult.success,
      stepResults: rowResult.stepResults,
      durationMs: rowResult.durationMs,
    },
    { durationMs: Date.now() - start },
  );
}
