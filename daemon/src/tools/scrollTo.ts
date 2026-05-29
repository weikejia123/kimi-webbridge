/**
 * Kimi WebBridge v2.0 — scroll_to Tool Handler
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

const ScrollToArgsSchema = z.object({
  target: z.union([TargetSchema, z.literal("active")]).optional(),
  behavior: z.enum(["smooth", "auto"]).optional().default("auto"),
  block: z.enum(["start", "center", "end", "nearest"]).optional().default("center"),
  inline: z.enum(["start", "center", "end", "nearest"]).optional().default("nearest"),
  x: z.number().optional(),
  y: z.number().optional(),
});

export async function handleScrollTo(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = ScrollToArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "scroll_to",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
