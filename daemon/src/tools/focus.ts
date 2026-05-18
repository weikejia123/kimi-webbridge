/**
 * Kimi WebBridge v2.0 — focus Tool Handler
 */

import { z } from "zod";
import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

const TargetRefSchema = z.object({
  ref: z.string().optional(),
  tabId: z.number().optional(),
  frameId: z.number().optional(),
  selector: z.string().optional(),
  generation: z.number().optional(),
  textHash: z.string().optional(),
  rect: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }).optional(),
  xpath: z.string().optional(),
});

const FocusArgsSchema = z.object({
  target: TargetRefSchema,
  scrollIntoView: z.boolean().optional(),
});

export async function handleFocus(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = FocusArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "focus",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
