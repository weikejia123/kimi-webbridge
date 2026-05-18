/**
 * Kimi WebBridge v2.0 — get_page_state Tool Handler
 *
 * Returns unified page observation: page info, summary, elements,
 * possible actions, recent errors, and network failures in one call.
 */

import { z } from "zod";
import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

const GetPageStateArgsSchema = z.object({
  mode: z.enum(["summary", "interactive", "full"]).optional().default("interactive"),
  maxElements: z.number().min(1).max(1000).optional().default(300),
  maxTextPerElement: z.number().min(10).max(1000).optional().default(160),
  includePossibleActions: z.boolean().optional().default(true),
  includeRecentErrors: z.boolean().optional().default(true),
  includeRecentNetworkFailures: z.boolean().optional().default(true),
  includeFrames: z.boolean().optional().default(true),
  includeBoundingBoxes: z.boolean().optional().default(true),
  cursor: z.string().optional(),
});

export async function handleGetPageState(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = GetPageStateArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "get_page_state",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
