/**
 * Kimi WebBridge v2.0 — click_at Tool Handler
 *
 * Forwards coordinate-based click commands to the extension content script.
 */

import type { BridgeResponse } from "../shared/protocol.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

export async function handleClickAt(
  _args: unknown,
  ctx: ToolContext,
): Promise<BridgeResponse> {
  const start = Date.now();

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "click_at",
    _args,
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
