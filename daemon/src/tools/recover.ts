/**
 * Kimi WebBridge v2.0 — recover Tool Handler
 *
 * Routes recovery requests to the extension and returns a recovery report.
 */

import { z } from "zod";
import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

const RecoverArgsSchema = z.object({
  afterError: z.string().optional(),
});

export async function handleRecover(
  args: unknown,
  ctx: ToolContext,
): Promise<BridgeResponse> {
  const parsed = RecoverArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(
      ctx.command,
      errorFactory.invalidArgument(parsed.error.message),
    );
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "recover",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return {
    ...response,
    id: ctx.command.id,
    tool: ctx.command.tool,
  };
}
