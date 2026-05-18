/**
 * Kimi WebBridge v2.0 — Protocol v2 Helpers
 *
 * Command validation, response creation, and error response helpers.
 */

import type { BridgeCommand, BridgeResponse, BridgeError, BridgeTelemetry } from "../shared/protocol.js";

export function validateBridgeCommand(msg: unknown): BridgeCommand | null {
  if (typeof msg !== "object" || msg === null) {
    return null;
  }
  const obj = msg as Record<string, unknown>;
  if (obj.v !== "2.0") {
    return null;
  }
  if (typeof obj.id !== "string") {
    return null;
  }
  if (typeof obj.tool !== "string") {
    return null;
  }
  if (typeof obj.args !== "object" || obj.args === null) {
    return null;
  }

  const cmd: BridgeCommand = {
    v: "2.0",
    id: obj.id,
    tool: obj.tool,
    args: obj.args,
  };
  if (typeof obj.tabId === "number") {
    cmd.tabId = obj.tabId;
  }
  if (typeof obj.frameId === "number") {
    cmd.frameId = obj.frameId;
  }
  if (typeof obj.timeoutMs === "number") {
    cmd.timeoutMs = obj.timeoutMs;
  }
  return cmd;
}

export function createResponse<T>(cmd: BridgeCommand, result: T, telemetry?: BridgeTelemetry): BridgeResponse<T> {
  return {
    v: "2.0",
    id: cmd.id,
    ok: true,
    tool: cmd.tool,
    result,
    error: null,
    warnings: [],
    telemetry: telemetry ?? { durationMs: 0 },
  };
}

export function createErrorResponse(cmd: BridgeCommand, error: BridgeError, telemetry?: BridgeTelemetry): BridgeResponse<null> {
  return {
    v: "2.0",
    id: cmd.id,
    ok: false,
    tool: cmd.tool,
    result: null,
    error,
    warnings: [],
    telemetry: telemetry ?? { durationMs: 0 },
  };
}
