/**
 * Kimi WebBridge v2.0 — start_trace Tool Handler
 *
 * Routes the start_trace command to the extension.
 */

import type { BridgeResponse } from "../shared/protocol.js";
import { createResponse } from "../protocol/v2.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

export async function handleStartTrace(
  _args: unknown,
  ctx: ToolContext,
): Promise<BridgeResponse> {
  const start = Date.now();

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "start_trace",
    {},
    ctx.timeoutMs ?? 10000,
    ctx.command.id,
  );

  if (response.ok) {
    return createResponse(ctx.command, { started: true }, { durationMs: Date.now() - start });
  }

  return {
    ...response,
    id: ctx.command.id,
    tool: ctx.command.tool,
    telemetry: { ...response.telemetry, durationMs: Date.now() - start },
  };
}
