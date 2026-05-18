/**
 * Kimi WebBridge v2.0 — list_actions Tool Handler
 *
 * List possible actions on the page with optional filtering.
 */

import { z } from "zod";
import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

const ListActionsArgsSchema = z.object({
  scope: z.enum(["viewport", "document"]).optional().default("document"),
  includeLowConfidence: z.boolean().optional().default(false),
  limit: z.number().min(1).max(200).optional().default(50),
});

export async function handleListActions(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = ListActionsArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "list_actions",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
