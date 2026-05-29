/**
 * Kimi WebBridge v2.0 — hover Tool Handler
 */

import { z } from "zod";
import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

const TargetSchema = z.object({
  ref: z.string().optional(),
  selector: z.string().optional(),
});

const HoverArgsSchema = z.object({
  target: TargetSchema,
});

export async function handleHover(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = HoverArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "hover",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
