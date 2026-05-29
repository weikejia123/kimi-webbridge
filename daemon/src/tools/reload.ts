/**
 * Kimi WebBridge v2.0 — reload Tool Handler
 */

import { z } from "zod";
import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

const ReloadArgsSchema = z.object({
  bypassCache: z.boolean().optional().default(false),
});

export async function handleReload(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = ReloadArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "reload",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
