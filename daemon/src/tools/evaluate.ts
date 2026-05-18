/**
 * Kimi WebBridge v2.0 — evaluate Tool Handler (Backward Compatibility)
 *
 * Wraps evaluate_v2 with legacy argument mapping.
 */

import { z } from "zod";
import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

const LegacyEvaluateArgsSchema = z.object({
  code: z.string().min(1),
  args: z.unknown().optional(),
});

export async function handleEvaluate(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = LegacyEvaluateArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const legacyArgs = parsed.data;

  const mappedArgs = {
    code: legacyArgs.code,
    args: legacyArgs.args,
    mode: "function-body" as const,
    world: "isolated" as const,
    timeoutMs: 5000,
    returnMode: "json" as const,
  };

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "evaluate_v2",
    mappedArgs,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  const warnings = [
    ...response.warnings,
    {
      code: "DEPRECATED",
      message: "evaluate() is deprecated. Use evaluate_v2() instead.",
    },
  ];

  return {
    ...response,
    id: ctx.command.id,
    tool: ctx.command.tool,
    warnings,
  };
}
