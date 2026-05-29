/**
 * Kimi WebBridge v2.0 — rollback Tool Handler
 *
 * Best-effort undo for failed actions.
 */

import { z } from "zod";
import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

const RollbackActionSchema = z.object({
  type: z.enum(["undo_fill", "close_modal", "navigate_back", "click_cancel"]),
  target: z
    .object({
      ref: z.string().optional(),
      selector: z.string().optional(),
      text: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
});

const RollbackArgsSchema = z.object({
  actions: z.array(RollbackActionSchema).min(1),
});

export async function handleRollback(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = RollbackArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "rollback",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
