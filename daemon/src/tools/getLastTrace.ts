/**
 * Kimi WebBridge v2.0 — get_last_trace Tool Handler
 *
 * Routes the get_last_trace command to the extension.
 * Validates optional count argument (default 50, max 200).
 */

import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";
import { z } from "zod";

const GetLastTraceArgsSchema = z.object({
  count: z.number().min(1).max(200).optional().default(50),
});

export async function handleGetLastTrace(
  args: unknown,
  ctx: ToolContext,
): Promise<BridgeResponse> {
  const start = Date.now();

  const parsed = GetLastTraceArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "get_last_trace",
    parsed.data,
    ctx.timeoutMs ?? 10000,
    ctx.command.id,
  );

  return {
    ...response,
    id: ctx.command.id,
    tool: ctx.command.tool,
    telemetry: { ...response.telemetry, durationMs: Date.now() - start },
  };
}
