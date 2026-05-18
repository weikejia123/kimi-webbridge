/**
 * Kimi WebBridge v2.0 — evaluate_v2 Tool Handler
 *
 * Safe JavaScript evaluation with fresh scope per call.
 */

import { z } from "zod";
import type { BridgeResponse, EvaluateResult } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";
import { validateEvaluateResult, truncateResult, estimateByteLength } from "../protocol/serializers.js";

const EvaluateArgsSchema = z.object({
  code: z.string().min(1).max(100000),
  args: z.unknown().optional(),
  mode: z.enum(["expression", "function-body", "async-function-body"]).optional().default("async-function-body"),
  world: z.enum(["isolated", "main"]).optional().default("isolated"),
  timeoutMs: z.number().min(100).max(60000).optional().default(5000),
  returnMode: z.enum(["json", "text", "preview"]).optional().default("json"),
  maxResultBytes: z.number().min(1024).max(1048576).optional().default(262144),
  allowDomMutation: z.boolean().optional().default(false),
});

export async function handleEvaluateV2(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = EvaluateArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const validatedArgs = parsed.data;
  const timeoutMs = validatedArgs.timeoutMs ?? 5000;

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "evaluate_v2",
    validatedArgs,
    timeoutMs,
    ctx.command.id,
  );

  if (!response.ok || response.result === null) {
    return { ...response, id: ctx.command.id, tool: ctx.command.tool };
  }

  try {
    const evaluateResult = validateEvaluateResult(response.result);
    const maxBytes = validatedArgs.maxResultBytes ?? 262144;
    const { value: truncatedValue, truncated: daemonTruncated } = truncateResult(evaluateResult, maxBytes);

    const finalResult: EvaluateResult = daemonTruncated
      ? { ...truncatedValue, truncated: true, bytes: estimateByteLength(truncatedValue) }
      : truncatedValue;

    const warnings = [...response.warnings];
    if (daemonTruncated || finalResult.truncated) {
      warnings.push({
        code: "RESULT_TRUNCATED",
        message: "Evaluation result exceeded maxResultBytes and was truncated",
      });
    }

    return {
      ...response,
      id: ctx.command.id,
      tool: ctx.command.tool,
      result: finalResult,
      warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return createErrorResponse(
      ctx.command,
      errorFactory.scriptError(`Result validation failed: ${message}`),
    );
  }
}
