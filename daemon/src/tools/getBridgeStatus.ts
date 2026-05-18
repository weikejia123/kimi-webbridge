/**
 * Kimi WebBridge v2.0 — get_bridge_status Tool Handler
 *
 * Returns comprehensive daemon, extension, session, and policy status.
 */

import type { BridgeResponse } from "../shared/protocol.js";
import { createResponse } from "../protocol/v2.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";
import { registry } from "./registry.js";
import { sessionAuth } from "../security/sessionAuth.js";
import { originPolicy } from "../security/originPolicy.js";
import { getConnectionCount } from "../server/websocketServer.js";

export async function handleGetBridgeStatus(
  _args: unknown,
  ctx: ToolContext,
): Promise<BridgeResponse> {
  const start = Date.now();

  // Daemon internal state
  const daemonStatus = {
    version: "1.0.0",
    uptime: Math.floor(process.uptime()),
    connections: getConnectionCount(),
    toolsAvailable: Array.from(registry.keys()),
  };

  // Session state
  const sessionStatus = {
    authenticated: ctx.authenticated ?? false,
    tokenRequired: sessionAuth.isTokenRequired(),
  };

  // Policy state
  const policyStatus = {
    allowedOrigins: originPolicy.getAllowedOrigins(),
  };

  // Extension state — try to route to extension, fall back to local knowledge
  let extensionStatus: { connected: boolean; activeTabId: number | null } = {
    connected: false,
    activeTabId: null,
  };

  const targetTabId = ctx.tabId > 0 ? ctx.tabId : undefined;
  if (targetTabId !== undefined && extensionRouter.isConnected(targetTabId)) {
    const extResponse = await extensionRouter.sendCommand(
      targetTabId,
      ctx.frameId,
      "get_bridge_status",
      {},
      ctx.timeoutMs ?? 10000,
      ctx.command.id,
    );
    if (extResponse.ok && extResponse.result && typeof extResponse.result === "object") {
      const result = extResponse.result as Record<string, unknown>;
      const ext = result.extension as Record<string, unknown> | undefined;
      if (ext) {
        extensionStatus = {
          connected: Boolean(ext.connected),
          activeTabId: typeof ext.activeTabId === "number" ? ext.activeTabId : null,
        };
      } else {
        extensionStatus = {
          connected: true,
          activeTabId: targetTabId,
        };
      }
    } else {
      extensionStatus = {
        connected: true,
        activeTabId: targetTabId,
      };
    }
  } else {
    // Find any connected tab as fallback
    const connectedTabs = extensionRouter.getConnectedTabs();
    if (connectedTabs.length > 0) {
      extensionStatus = {
        connected: true,
        activeTabId: connectedTabs[0] ?? null,
      };
    }
  }

  const result = {
    daemon: daemonStatus,
    extension: extensionStatus,
    session: sessionStatus,
    policy: policyStatus,
  };

  return createResponse(ctx.command, result, { durationMs: Date.now() - start });
}
