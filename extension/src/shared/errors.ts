/**
 * Kimi WebBridge v2.0 — Error Types (API-SPEC.md Section 7)
 *
 * Frozen by Worker-0. All workers read; only Worker-0 writes.
 */

import type { BridgeError, BridgeErrorCode, BridgeWarning } from "./protocol.js";

export type { BridgeError, BridgeErrorCode, BridgeWarning };

/** All known error codes as a runtime array. */
export const BRIDGE_ERROR_CODES: BridgeErrorCode[] = [
  "ELEMENT_NOT_FOUND",
  "STALE_ELEMENT",
  "ELEMENT_NOT_VISIBLE",
  "ELEMENT_COVERED",
  "ELEMENT_DISABLED",
  "NO_FORM_FOUND",
  "NAVIGATION_TIMEOUT",
  "DOM_STABLE_TIMEOUT",
  "EVALUATION_ERROR",
  "SNAPSHOT_TOO_LARGE",
  "PERMISSION_DENIED",
  "USER_INTERVENTION_REQUIRED",
  "INVALID_ARGUMENT",
  "SCREENSHOT_ERROR",
  "RECORDING_ERROR",
  "FILE_UPLOAD_ERROR",
  "UNKNOWN_ERROR",
];

/** Factory for creating structured BridgeError objects. */
export function createBridgeError(
  code: BridgeErrorCode,
  message: string,
  options?: {
    recoverable?: boolean;
    suggestedNextTools?: string[];
    details?: unknown;
  },
): BridgeError {
  const err: BridgeError = {
    code,
    message,
    recoverable: options?.recoverable ?? true,
  };
  if (options?.suggestedNextTools !== undefined) {
    err.suggestedNextTools = options.suggestedNextTools;
  }
  if (options?.details !== undefined) {
    err.details = options.details;
  }
  return err;
}

/** Helper to check whether a string is a valid BridgeErrorCode. */
export function isBridgeErrorCode(value: string): value is BridgeErrorCode {
  return BRIDGE_ERROR_CODES.includes(value as BridgeErrorCode);
}
