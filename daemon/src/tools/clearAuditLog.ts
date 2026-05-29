/**
 * Kimi WebBridge v2.0 — clear_audit_log Tool Handler
 *
 * Routes the clear_audit_log command to the extension.
 */

import type { BridgeResponse } from "../shared/protocol.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

export async function handleClearAuditLog(
  _args: unknown,
  ctx: ToolContext,
): Promise<BridgeResponse> {
  const start = Date.now();
  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "clear_audit_log",
    {},
    ctx.timeoutMs ?? 5000,
    ctx.command.id,
  );
  return {
    ...response,
    id: ctx.command.id,
    tool: ctx.command.tool,
    telemetry: { ...response.telemetry, durationMs: Date.now() - start },
  };
}
