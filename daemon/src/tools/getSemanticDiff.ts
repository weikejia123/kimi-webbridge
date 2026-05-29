/**
 * Kimi WebBridge v2.0 — get_semantic_diff Tool Handler
 *
 * Returns semantic changes (modal open/close, dropdown appear/hide,
 * form loaded, toast appeared, page navigated, content updated) since
 * the last captured snapshot.
 */

import type { BridgeResponse } from "../shared/protocol.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

export async function handleGetSemanticDiff(
  _args: unknown,
  ctx: ToolContext,
): Promise<BridgeResponse> {
  const start = Date.now();

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "get_semantic_diff",
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
