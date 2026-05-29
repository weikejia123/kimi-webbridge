/**
 * Kimi WebBridge v2.0 — list_tabs Tool Handler
 */

import type { BridgeResponse } from "../shared/protocol.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

export async function handleListTabs(_args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "list_tabs",
    {},
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
