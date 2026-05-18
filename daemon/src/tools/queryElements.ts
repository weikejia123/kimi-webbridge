/**
 * Kimi WebBridge v2.0 — query_elements Tool Handler
 *
 * Query elements by role, text, selector, visibility, and actionability.
 */

import { z } from "zod";
import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

const QueryElementsArgsSchema = z.object({
  role: z.string().optional(),
  text: z.string().optional(),
  selector: z.string().optional(),
  visibleOnly: z.boolean().optional().default(true),
  actionableOnly: z.boolean().optional().default(false),
  limit: z.number().min(1).max(500).optional().default(50),
});

export async function handleQueryElements(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = QueryElementsArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "query_elements",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
