/**
 * Kimi WebBridge v2.0 — stop_recording Tool Handler
 *
 * Stops video recording and returns the WebM video as base64.
 */

import type { BridgeResponse } from "../shared/protocol.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

export async function handleStopRecording(
  _args: unknown,
  ctx: ToolContext,
): Promise<BridgeResponse> {
  const start = Date.now();

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "stop_recording",
    {},
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return {
    ...response,
    id: ctx.command.id,
    tool: ctx.command.tool,
    telemetry: { ...response.telemetry, durationMs: Date.now() - start },
  };
}
