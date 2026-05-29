/**
 * Kimi WebBridge v2.0 — run_batch Tool Handler
 *
 * Executes a workflow against CSV input rows.
 */

import type { BridgeResponse } from "../shared/protocol.js";
import { createResponse, createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import type { Workflow } from "../workflow/workflowSchema.js";
import { validateWorkflow } from "../workflow/workflowSchema.js";
import { parseCsv } from "../workflow/csvParser.js";
import { runBatch } from "../workflow/batchRunner.js";

export async function handleRunBatch(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
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

  if (typeof obj.csv !== "string") {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument("Missing 'csv' string"));
  }

  const { rows } = parseCsv(obj.csv);

  if (rows.length === 0) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument("CSV contains no data rows"));
  }

  const results = await runBatch(workflow, rows, ctx);

  return createResponse(
    ctx.command,
    {
      totalRows: rows.length,
      successCount: results.filter((r) => r.success).length,
      failureCount: results.filter((r) => !r.success).length,
      results,
    },
    { durationMs: Date.now() - start },
  );
}
