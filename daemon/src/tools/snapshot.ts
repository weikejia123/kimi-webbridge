/**
 * Kimi WebBridge v2.0 — snapshot Tool Handler (Backward Compatibility)
 *
 * Wraps get_page_state with legacy argument mapping.
 */

import type { BridgeResponse } from "../shared/protocol.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

export async function handleSnapshot(_args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "get_page_state",
    { mode: "interactive" },
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  const warnings = [
    ...response.warnings,
    {
      code: "DEPRECATED",
      message: "snapshot() is deprecated. Use get_page_state() instead.",
    },
  ];

  return {
    ...response,
    id: ctx.command.id,
    tool: ctx.command.tool,
    warnings,
  };
}
