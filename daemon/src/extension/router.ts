/**
 * Kimi WebBridge v2.0 — Extension Router
 *
 * Routes daemon commands to the Chrome extension via WebSocket.
 * Each tab registers its own WebSocket connection on /extension?tabId=N.
 */

import { WebSocket } from "ws";
import type { BridgeResponse } from "../shared/protocol.js";
import { errorFactory } from "../protocol/errors.js";
import { info, warn, error } from "../logging.js";

type PendingRequest = {
  resolve: (value: BridgeResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  tabId: number;
};

const tabConnections = new Map<number, WebSocket>();
const pendingRequests = new Map<string, PendingRequest>();

let requestCounter = 0;

function generateRequestId(): string {
  return `req_${++requestCounter}_${Date.now()}`;
}

export class ExtensionRouter {
  registerTab(tabId: number, ws: WebSocket): void {
    const existing = tabConnections.get(tabId);
    if (existing && existing !== ws && existing.readyState === WebSocket.OPEN) {
      existing.close();
    }
    tabConnections.set(tabId, ws);

    ws.on("message", (data) => {
      try {
        const text = data.toString("utf-8");
        const msg = JSON.parse(text) as unknown;
        if (typeof msg !== "object" || msg === null) {
          return;
        }
        const obj = msg as Record<string, unknown>;
        const requestId = typeof obj.requestId === "string" ? obj.requestId : undefined;
        if (!requestId) {
          return;
        }
        const pending = pendingRequests.get(requestId);
        if (pending) {
          clearTimeout(pending.timer);
          pendingRequests.delete(requestId);
          pending.resolve(obj.response as BridgeResponse);
        }
      } catch (e) {
        error("[ExtensionRouter] Failed to parse extension message", { error: String(e) });
      }
    });

    ws.on("close", () => {
      if (tabConnections.get(tabId) === ws) {
        tabConnections.delete(tabId);
        info("[ExtensionRouter] Extension disconnected", { tabId });

        for (const [id, pending] of pendingRequests.entries()) {
          if (pending.tabId === tabId) {
            clearTimeout(pending.timer);
            pendingRequests.delete(id);
            pending.reject(new Error("Extension disconnected"));
          }
        }
      }
    });

    ws.on("error", (err) => {
      error("[ExtensionRouter] Extension WebSocket error", { tabId, error: err.message });
    });

    info("[ExtensionRouter] Extension registered", { tabId });
  }

  unregisterTab(tabId: number): void {
    const ws = tabConnections.get(tabId);
    if (ws) {
      ws.close();
    }
    tabConnections.delete(tabId);
  }

  isConnected(tabId: number): boolean {
    const ws = tabConnections.get(tabId);
    return ws !== undefined && ws.readyState === WebSocket.OPEN;
  }

  getConnectedTabs(): number[] {
    const tabs: number[] = [];
    for (const [tabId, ws] of tabConnections.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        tabs.push(tabId);
      }
    }
    return tabs;
  }

  async sendCommand(
    tabId: number,
    frameId: number | undefined,
    tool: string,
    args: unknown,
    timeoutMs = 30000,
    requestId = "",
  ): Promise<BridgeResponse> {
    const ws = tabConnections.get(tabId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return {
        v: "2.0",
        id: requestId,
        ok: false,
        tool,
        result: null,
        error: errorFactory.notImplemented("Extension not connected for this tab"),
        warnings: [],
        telemetry: { durationMs: 0 },
      };
    }

    const generatedRequestId = generateRequestId();
    const start = Date.now();

    try {
      ws.send(JSON.stringify({
        requestId: generatedRequestId,
        v: "2.0",
        id: requestId,
        tool,
        args,
        timeoutMs,
        tabId,
        frameId,
      }));

      const response = await new Promise<BridgeResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRequests.delete(generatedRequestId);
          reject(new Error(`Extension command timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        pendingRequests.set(generatedRequestId, {
          resolve,
          reject,
          timer,
          tabId,
        });
      });

      return response;
    } catch (err) {
      const durationMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      warn("[ExtensionRouter] sendCommand failed", { tabId, tool, error: message });
      return {
        v: "2.0",
        id: requestId,
        ok: false,
        tool,
        result: null,
        error: errorFactory.timedOut(message),
        warnings: [],
        telemetry: { durationMs },
      };
    }
  }
}

export const extensionRouter = new ExtensionRouter();
