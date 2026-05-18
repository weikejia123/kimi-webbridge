/**
 * Kimi WebBridge v2.0 — capture_screenshot Tool Handler
 *
 * Captures a screenshot of the active tab via the extension.
 */

import type { BridgeResponse } from "../shared/protocol.js";

import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

export async function handleCaptureScreenshot(
  _args: unknown,
  ctx: ToolContext,
): Promise<BridgeResponse> {
  const start = Date.now();

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "capture_screenshot",
    {},
    ctx.timeoutMs ?? 15000,
    ctx.command.id,
  );

  return {
    ...response,
    id: ctx.command.id,
    tool: ctx.command.tool,
    telemetry: { ...response.telemetry, durationMs: Date.now() - start },
  };
}
