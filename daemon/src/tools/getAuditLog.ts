/**
 * Kimi WebBridge v2.0 — get_audit_log Tool Handler
 *
 * Routes the get_audit_log command to the extension.
 */

import type { BridgeResponse } from "../shared/protocol.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

export async function handleGetAuditLog(
  args: unknown,
  ctx: ToolContext,
): Promise<BridgeResponse> {
  const start = Date.now();
  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "get_audit_log",
    args,
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
