/**
 * CDP 工具透传处理（Daemon → Extension）
 *
 * 这些工具本身由 Extension 的 CDP 层实现（cdpTools.ts），
 * Daemon 只需透传，不进行任何参数转换。
 * V1-20260714
 */

import type { BridgeResponse } from "../shared/protocol.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

type Handler = (args: unknown, ctx: ToolContext) => Promise<BridgeResponse>;

/** 通用透传：直接将命令转发给 Extension */
function passthrough(toolName: string): Handler {
  return async (args: unknown, ctx: ToolContext): Promise<BridgeResponse> => {
    const start = Date.now();
    const response = await extensionRouter.sendCommand(
      ctx.tabId,
      ctx.frameId,
      toolName,
      args ?? {},
      ctx.timeoutMs ?? 30000,
      ctx.command.id,
    );
    return {
      ...response,
      id: ctx.command.id,
      tool: ctx.command.tool,
      telemetry: { ...response.telemetry, durationMs: Date.now() - start },
    };
  };
}

export const handleMouseClick = passthrough("mouse_click");
export const handleCdpSnapshot = passthrough("snapshot");
export const handleNetwork = passthrough("network");
export const handleSaveAsPdf = passthrough("save_as_pdf");
export const handleUpload = passthrough("upload");
export const handleCdp = passthrough("cdp");
export const handleCloseTab = passthrough("close_tab");
export const handleCloseSession = passthrough("close_session");
