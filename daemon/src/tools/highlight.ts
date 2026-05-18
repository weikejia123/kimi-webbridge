/**
 * Kimi WebBridge v2.0 — highlight Tool Handler
 *
 * Visually highlight elements on the page by ref or selector.
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

const HighlightArgsSchema = z.object({
  targets: z.array(TargetSchema).min(1).max(10),
  labels: z.boolean().optional().default(false),
  durationMs: z.number().min(100).max(30000).optional().default(3000),
});

export async function handleHighlight(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = HighlightArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "highlight",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
