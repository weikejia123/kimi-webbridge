/**
 * Kimi WebBridge v2.0 — wait_for Tool Handler
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

const WaitConditionSchema = z.union([
  z.object({ type: z.literal("url_changed"), from: z.string().optional() }),
  z.object({ type: z.literal("url_contains"), text: z.string() }),
  z.object({ type: z.literal("text_visible"), text: z.string() }),
  z.object({ type: z.literal("selector_visible"), selector: z.string() }),
  z.object({ type: z.literal("element_gone"), target: TargetRefSchema }),
  z.object({ type: z.literal("dom_stable"), quietMs: z.number().optional() }),
  z.object({ type: z.literal("navigation_idle"), quietMs: z.number().optional() }),
]);

const WaitForArgsSchema = z.object({
  condition: WaitConditionSchema,
  timeoutMs: z.number().optional(),
});

export async function handleWaitFor(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = WaitForArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "wait_for",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
