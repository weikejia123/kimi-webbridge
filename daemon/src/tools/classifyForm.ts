/**
 * Kimi WebBridge v2.0 — classify_form Tool Handler
 *
 * Heuristically classifies form input fields by type (email, phone,
 * name, address, etc.) based on identifiers, labels, and placeholders.
 */

import type { BridgeResponse } from "../shared/protocol.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

export async function handleClassifyForm(
  _args: unknown,
  ctx: ToolContext,
): Promise<BridgeResponse> {
  const start = Date.now();

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "classify_form",
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
