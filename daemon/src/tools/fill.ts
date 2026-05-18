/**
 * Kimi WebBridge v2.0 — fill Tool Handler (Backward Compatibility)
 *
 * Wraps the new fill tool for legacy fill({ selector, value }) calls.
 * Deprecated: use fill({ target: { ref | selector }, value }) instead.
 */

import { z } from "zod";
import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

const FillArgsSchema = z.object({
  selector: z.string(),
  value: z.string(),
  clear: z.boolean().optional().default(true),
});

export async function handleFill(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = FillArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const mappedArgs = {
    target: { selector: parsed.data.selector },
    value: parsed.data.value,
    clear: parsed.data.clear,
  };

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "fill",
    mappedArgs,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  const warnings = [
    ...response.warnings,
    {
      code: "DEPRECATED",
      message: "fill({ selector, value }) is deprecated. Use fill({ target: { ref | selector }, value }) instead.",
    },
  ];

  return {
    ...response,
    id: ctx.command.id,
    tool: ctx.command.tool,
    warnings,
  };
}
