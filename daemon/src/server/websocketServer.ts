/**
 * Kimi WebBridge v2.0 — Hardened WebSocket Server
 *
 * Worker-1D owns this file. Phase 6 (Worker-6B) hardens it with:
 * - Local-only binding and connection rejection
 * - Session token authentication
 * - Protocol version negotiation
 * - Heartbeat ping/pong
 * - Max payload size enforcement
 * - Request ID tracking and duplicate detection
 * - Command cancellation via AbortController
 * - Server-level timeout capping
 * - Daemon-side trace recording
 * - Structured redacted logging
 */

import { WebSocketServer, WebSocket } from "ws";
import type { BridgeCommand, BridgeResponse } from "../shared/protocol.js";
import { resolveTool } from "../tools/registry.js";
import type { ToolContext } from "../tools/registry.js";
import { validateBridgeCommand, createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import { info, warn, error, debug, logCommand } from "../logging.js";
import { extensionRouter } from "../extension/router.js";
import { actionHistory } from "../state/actionHistory.js";
import { errorHistory } from "../state/errorHistory.js";
import type { ActionRecord } from "../state/actionHistory.js";
import { sessionAuth } from "../security/sessionAuth.js";
import { originPolicy } from "../security/originPolicy.js";
import { isVersionSupported } from "../protocol/versionNegotiation.js";
import { daemonTraceStore } from "../tracing/traceStore.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.WEBBRIDGE_PORT) || 10086;
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const SERVER_TIMEOUT_CAP_MS = 60000; // 60s
const HEARTBEAT_INTERVAL_MS = 30000; // 30s
const HEARTBEAT_TIMEOUT_MS = 10000; // 10s

interface AgentClientState {
  ws: WebSocket;
  id: number;
  authenticated: boolean;
  versionNegotiated: boolean;
  lastPong: number;
  abortControllers: Map<string, AbortController>;
  seenRequestIds: Set<string>;
  pingTimer: ReturnType<typeof setInterval>;
  pongTimer: ReturnType<typeof setTimeout> | null;
}

let clientIdCounter = 0;
const agentClients = new Set<AgentClientState>();

/** Get the current number of active agent client connections. */
export function getConnectionCount(): number {
  return agentClients.size;
}

function isLocalAddress(address: string | undefined): boolean {
  if (!address) {
    return false;
  }
  const normalized = address.startsWith("::ffff:") ? address.slice(7) : address;
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
}

function sendResponse(ws: WebSocket, response: BridgeResponse): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(response));
  }
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function handleCommand(
  cmd: BridgeCommand,
  client: AgentClientState,
): Promise<BridgeResponse> {
  const start = Date.now();
  const handler = resolveTool(cmd);

  if (!handler) {
    const durationMs = Date.now() - start;
    logCommand(cmd.tool, cmd.id, cmd.tabId ?? 0, durationMs, false);
    recordTrace(cmd, durationMs, false, "UNKNOWN_ERROR");
    return createErrorResponse(
      cmd,
      errorFactory.unknownError(`Unknown tool: ${cmd.tool}`),
      { durationMs },
    );
  }

  // Cap timeout at server maximum
  let timeoutMs = cmd.timeoutMs;
  if (timeoutMs !== undefined && timeoutMs > SERVER_TIMEOUT_CAP_MS) {
    timeoutMs = SERVER_TIMEOUT_CAP_MS;
    debug("[WebSocketServer] Timeout capped to server max", {
      clientId: client.id,
      id: cmd.id,
      original: cmd.timeoutMs,
      capped: timeoutMs,
    });
  }

  // Create abort controller for this request
  const abortController = new AbortController();
  client.abortControllers.set(cmd.id, abortController);

  const context: ToolContext = {
    tabId: cmd.tabId ?? 0,
    command: cmd,
    authenticated: client.authenticated,
    abortSignal: abortController.signal,
  };
  if (cmd.frameId !== undefined) {
    context.frameId = cmd.frameId;
  }
  if (timeoutMs !== undefined) {
    context.timeoutMs = timeoutMs;
  }

  try {
    const response = await handler(cmd.args, context);
    const durationMs = Date.now() - start;
    if (response.telemetry.durationMs === 0) {
      response.telemetry.durationMs = durationMs;
    }

    const result: ActionRecord["result"] = response.ok
      ? "success"
      : response.error?.code === "NAVIGATION_TIMEOUT" ||
          response.error?.code === "DOM_STABLE_TIMEOUT"
        ? "timeout"
        : "failure";

    const record: ActionRecord = {
      id: cmd.id,
      tool: cmd.tool,
      args: cmd.args,
      timestamp: Date.now(),
      result,
      durationMs: response.telemetry.durationMs,
    };
    if (response.error?.code !== undefined) {
      record.errorCode = response.error.code;
    }
    actionHistory.add(context.tabId, record);

    if (!response.ok && response.error) {
      errorHistory.add(context.tabId, {
        code: response.error.code,
        message: response.error.message,
        timestamp: Date.now(),
        tool: cmd.tool,
        recoverable: response.error.recoverable,
      });
    }

    logCommand(cmd.tool, cmd.id, context.tabId, durationMs, response.ok);
    recordTrace(cmd, durationMs, response.ok, response.error?.code);
    client.abortControllers.delete(cmd.id);
    return response;
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    error("[WebSocketServer] Tool handler threw", { tool: cmd.tool, error: msg });
    logCommand(cmd.tool, cmd.id, context.tabId, durationMs, false);

    const errorResponse = createErrorResponse(
      cmd,
      errorFactory.unknownError(msg),
      { durationMs },
    );

    actionHistory.add(context.tabId, {
      id: cmd.id,
      tool: cmd.tool,
      args: cmd.args,
      timestamp: Date.now(),
      result: "failure",
      errorCode: "UNKNOWN_ERROR",
      durationMs,
    });

    errorHistory.add(context.tabId, {
      code: "UNKNOWN_ERROR",
      message: msg,
      timestamp: Date.now(),
      tool: cmd.tool,
      recoverable: true,
    });

    recordTrace(cmd, durationMs, false, "UNKNOWN_ERROR");
    client.abortControllers.delete(cmd.id);
    return errorResponse;
  }
}

function recordTrace(
  cmd: BridgeCommand,
  durationMs: number,
  ok: boolean,
  errorCode?: string,
): void {
  daemonTraceStore.add({
    id: cmd.id,
    timestamp: Date.now(),
    tool: cmd.tool,
    tabId: cmd.tabId ?? 0,
    durationMs,
    ok,
    errorCode,
  });
}

function startHeartbeat(client: AgentClientState): void {
  client.lastPong = Date.now();

  client.pingTimer = setInterval(() => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.ping();
      client.pongTimer = setTimeout(() => {
        warn("[WebSocketServer] Heartbeat timeout", { clientId: client.id });
        client.ws.close(1001, "Heartbeat timeout");
      }, HEARTBEAT_TIMEOUT_MS);
    }
  }, HEARTBEAT_INTERVAL_MS);

  client.ws.on("pong", () => {
    client.lastPong = Date.now();
    if (client.pongTimer) {
      clearTimeout(client.pongTimer);
      client.pongTimer = null;
    }
  });
}

function cleanupClient(client: AgentClientState): void {
  clearInterval(client.pingTimer);
  if (client.pongTimer) {
    clearTimeout(client.pongTimer);
    client.pongTimer = null;
  }
  // Abort any pending requests
  for (const controller of client.abortControllers.values()) {
    controller.abort("Connection closed");
  }
  client.abortControllers.clear();
  agentClients.delete(client);
}

export function startServer(): WebSocketServer {
  const wss = new WebSocketServer({ host: HOST, port: PORT });

  wss.on("listening", () => {
    info(`[WebSocketServer] Listening on ws://${HOST}:${PORT}`);
  });

  wss.on("connection", (ws, req) => {
    const remoteAddress = req.socket.remoteAddress;

    // B. Reject non-local connections
    if (!isLocalAddress(remoteAddress)) {
      warn("[WebSocketServer] Rejected non-local connection", { remoteAddress });
      ws.close(1008, "Non-local connections not allowed");
      return;
    }

    // Defense-in-depth origin check
    if (remoteAddress && !originPolicy.isAllowed(remoteAddress)) {
      warn("[WebSocketServer] Rejected connection by origin policy", { remoteAddress });
      ws.close(1008, "Origin not allowed");
      return;
    }

    const url = req.url ? new URL(req.url, "http://localhost") : null;
    const pathname = url?.pathname ?? "/";

    if (pathname === "/extension") {
      handleExtensionConnection(ws, url);
      return;
    }

    const clientId = ++clientIdCounter;
    const client: AgentClientState = {
      ws,
      id: clientId,
      authenticated: !sessionAuth.isTokenRequired(),
      versionNegotiated: false,
      lastPong: Date.now(),
      abortControllers: new Map(),
      seenRequestIds: new Set(),
      pingTimer: null as unknown as ReturnType<typeof setInterval>,
      pongTimer: null,
    };
    agentClients.add(client);

    info("[WebSocketServer] Agent client connected", { clientId, ip: remoteAddress });

    // E. Heartbeat ping/pong
    startHeartbeat(client);

    ws.on("message", async (data) => {
      // F. Max payload size
      const dataByteLength = Buffer.isBuffer(data)
        ? data.length
        : typeof data === "string"
          ? Buffer.byteLength(data)
          : (data as ArrayBuffer).byteLength;
      if (dataByteLength > MAX_PAYLOAD_BYTES) {
        warn("[WebSocketServer] Payload too large", { clientId, size: dataByteLength });
        sendJson(ws, {
          type: "error",
          message: "Payload exceeds maximum size of 10MB",
        });
        ws.close(1009, "Payload too large");
        return;
      }

      debug("[WebSocketServer] Received message", { clientId });

      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString("utf-8"));
      } catch {
        warn("[WebSocketServer] Invalid JSON", { clientId });
        sendResponse(
          ws,
          createErrorResponse(
            { v: "2.0", id: "unknown", tool: "unknown", args: {} },
            errorFactory.unknownError("Invalid JSON"),
            { durationMs: 0 },
          ),
        );
        return;
      }

      if (typeof parsed !== "object" || parsed === null) {
        warn("[WebSocketServer] Invalid message type", { clientId });
        return;
      }

      const obj = parsed as Record<string, unknown>;

      // Handle control messages
      if (typeof obj.type === "string") {
        // I. Protocol version negotiation
        if (obj.type === "version") {
          const clientVersion = typeof obj.version === "string" ? obj.version : "";
          if (!isVersionSupported(clientVersion)) {
            warn("[WebSocketServer] Unsupported protocol version", { clientId, version: clientVersion });
            sendJson(ws, {
              type: "version_rejected",
              supported: ["2.0"],
            });
            ws.close(1008, "Unsupported protocol version");
            return;
          }
          client.versionNegotiated = true;
          sendJson(ws, { type: "version_accepted", version: clientVersion });
          return;
        }

        // C. Session token authentication
        if (obj.type === "auth") {
          const token = typeof obj.token === "string" ? obj.token : "";
          if (sessionAuth.validateToken(token)) {
            client.authenticated = true;
            sendJson(ws, { type: "auth_accepted" });
            info("[WebSocketServer] Client authenticated", { clientId });
          } else {
            warn("[WebSocketServer] Invalid auth token", { clientId });
            sendJson(ws, { type: "auth_rejected" });
            ws.close(1008, "Invalid authentication token");
          }
          return;
        }

        // H. Command cancellation
        if (obj.type === "cancel") {
          const cancelId = typeof obj.id === "string" ? obj.id : "";
          const controller = client.abortControllers.get(cancelId);
          if (controller) {
            controller.abort("Cancelled by client");
            sendJson(ws, { type: "cancel_acknowledged", id: cancelId });
            debug("[WebSocketServer] Request cancelled", { clientId, id: cancelId });
          } else {
            sendJson(ws, { type: "cancel_not_found", id: cancelId });
          }
          return;
        }
      }

      // Validate as BridgeCommand
      const cmd = validateBridgeCommand(parsed);
      if (!cmd) {
        warn("[WebSocketServer] Malformed message", { clientId });
        sendResponse(
          ws,
          createErrorResponse(
            { v: "2.0", id: "unknown", tool: "unknown", args: {} },
            errorFactory.unknownError("Malformed command envelope"),
            { durationMs: 0 },
          ),
        );
        return;
      }

      // I. Implicit version negotiation on first valid command
      if (!client.versionNegotiated) {
        if (isVersionSupported(cmd.v)) {
          client.versionNegotiated = true;
        } else {
          warn("[WebSocketServer] Unsupported protocol version in command", { clientId, version: cmd.v });
          ws.close(1008, "Unsupported protocol version");
          return;
        }
      }

      // C. Enforce authentication
      if (sessionAuth.isTokenRequired() && !client.authenticated) {
        warn("[WebSocketServer] Unauthenticated command rejected", { clientId });
        sendResponse(
          ws,
          createErrorResponse(
            cmd,
            errorFactory.securityError("Authentication required"),
            { durationMs: 0 },
          ),
        );
        ws.close(1008, "Authentication required");
        return;
      }

      // D. Request ID tracking — detect duplicates
      if (client.seenRequestIds.has(cmd.id)) {
        warn("[WebSocketServer] Duplicate request ID detected", { clientId, id: cmd.id });
        sendResponse(
          ws,
          createErrorResponse(
            cmd,
            errorFactory.securityError("Duplicate request ID"),
            { durationMs: 0 },
          ),
        );
        return;
      }
      client.seenRequestIds.add(cmd.id);
      // Bound the set size to prevent unbounded growth
      if (client.seenRequestIds.size > 10000) {
        const first = client.seenRequestIds.values().next().value;
        if (first !== undefined) {
          client.seenRequestIds.delete(first);
        }
      }

      const response = await handleCommand(cmd, client);
      sendResponse(ws, response);
    });

    ws.on("close", () => {
      info("[WebSocketServer] Agent client disconnected", { clientId });
      cleanupClient(client);
    });

    ws.on("error", (err) => {
      error("[WebSocketServer] Client error", { clientId, error: err.message });
    });
  });

  wss.on("error", (err) => {
    error("[WebSocketServer] Server error", { error: err.message });
  });

  return wss;
}

function handleExtensionConnection(ws: WebSocket, url: URL | null): void {
  const tabIdStr = url?.searchParams.get("tabId");
  if (!tabIdStr) {
    warn("[WebSocketServer] Extension connection missing tabId", { url: url?.toString() });
    ws.close(1002, "Missing tabId");
    return;
  }
  const tabId = parseInt(tabIdStr, 10);
  if (Number.isNaN(tabId)) {
    warn("[WebSocketServer] Extension connection invalid tabId", { tabIdStr });
    ws.close(1002, "Invalid tabId");
    return;
  }

  const authTimeout = setTimeout(() => {
    warn("[WebSocketServer] Extension auth timeout", { tabId });
    ws.close(1008, "Authentication timeout");
  }, 5000);

  let authenticated = false;

  ws.on("message", (data) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString("utf-8"));
    } catch {
      warn("[WebSocketServer] Extension message invalid JSON", { tabId });
      if (!authenticated) {
        clearTimeout(authTimeout);
        ws.close(1008, "Invalid auth message");
      }
      return;
    }
    if (typeof parsed !== "object" || parsed === null) {
      if (!authenticated) {
        clearTimeout(authTimeout);
        ws.close(1008, "Invalid auth message");
      }
      return;
    }
    const obj = parsed as Record<string, unknown>;

    if (obj.type === "auth") {
      clearTimeout(authTimeout);
      if (
        typeof obj.token !== "string" ||
        !sessionAuth.validateToken(obj.token)
      ) {
        warn("[WebSocketServer] Extension auth rejected", { tabId });
        ws.close(1008, "Invalid authentication token");
        return;
      }
      authenticated = true;
      extensionRouter.registerTab(tabId, ws);
      info("[WebSocketServer] Extension connected", { tabId });
      return;
    }

    if (obj.type === "register") {
      // Registration is informational; tab is already registered after auth.
      debug("[WebSocketServer] Extension registration received", { tabId, version: obj.version });
      return;
    }

    // Unknown message type from extension
    if (!authenticated) {
      warn("[WebSocketServer] Extension sent unexpected message before auth", { tabId, type: obj.type });
      ws.close(1008, "Authentication required");
    }
  });
}

// ---------------------------------------------------------------------------
// Auto-start when executed directly
// ---------------------------------------------------------------------------

if (import.meta.url.endsWith(process.argv[1] ?? "")) {
  startServer();
}
