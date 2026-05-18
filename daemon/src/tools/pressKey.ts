/**
 * Kimi WebBridge v2.0 — press_key Tool Handler
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

const PressKeyArgsSchema = z.object({
  key: z.string(),
  code: z.string().optional(),
  modifiers: z.object({
    ctrl: z.boolean().optional(),
    alt: z.boolean().optional(),
    shift: z.boolean().optional(),
    meta: z.boolean().optional(),
  }).optional(),
  target: z.union([TargetRefSchema, z.literal("active")]).optional(),
  repeat: z.number().optional(),
  delayMs: z.number().optional(),
});

export async function handlePressKey(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = PressKeyArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "press_key",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
