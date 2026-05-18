/**
 * Kimi WebBridge v2.0 — Safe Evaluation API (Phase 2)
 *
 * Runs user JavaScript inside a fresh function scope per call, avoiding
 * shared-state problems like "SyntaxError: Identifier has already been declared".
 */

import type { EvaluateResult } from "../shared/protocol.js";
import { createBridgeError } from "../shared/errors.js";
import { safeSerialize } from "./safeSerialize.js";
import { trackSideEffects } from "./sideEffectTracker.js";
import { evaluateSandbox } from "./evaluateSandbox.js";

export type EvaluateArgs = {
  code: string;
  args?: unknown;
  mode?: "expression" | "function-body" | "async-function-body";
  world?: "isolated" | "main" | "sandbox";
  timeoutMs?: number;
  returnMode?: "json" | "text" | "preview";
  maxResultBytes?: number;
  allowDomMutation?: boolean;
};

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESULT_BYTES = 262144; // 256 KB

class TimeoutError extends Error {
  constructor(message = "Evaluation timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Run a promise-returning function with a timeout.
 */
async function runWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new TimeoutError()), timeoutMs);
    }),
  ]);
}

/**
 * Evaluate user code in a fresh function scope.
 *
 * - Uses `new Function()` to create a fresh scope each time
 * - Wraps in an async IIFE for `await` support
 * - Supports expression, function-body, and async-function-body modes
 * - Tracks side effects (DOM mutation, navigation)
 * - Serializes results safely with size limits
 */
export async function evaluateV2(args: EvaluateArgs): Promise<EvaluateResult> {
  const {
    code,
    args: userArgs,
    mode = "async-function-body",
    world = "isolated",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    returnMode = "json",
    maxResultBytes = DEFAULT_MAX_RESULT_BYTES,
    allowDomMutation = false,
  } = args;

  if (typeof code !== "string") {
    throw createBridgeError("EVALUATION_ERROR", "Missing or invalid 'code' argument", {
      recoverable: true,
    });
  }

  // Sandboxed iframe execution — truly isolated, no DOM access
  if (world === "sandbox") {
    return evaluateSandbox({
      code,
      userArgs,
      mode,
      timeoutMs,
      returnMode,
      maxResultBytes,
    });
  }

  // Main-world execution runs via chrome.scripting.executeScript
  if (world === "main") {
    throw createBridgeError("PERMISSION_DENIED", "world: 'main' requires scripting permission", {
      recoverable: true,
    });
  }

  // Build function body based on mode
  const body = mode === "expression" ? `return (${code});` : code;

  // Create fresh function scope — NEVER reuses top-level scope
  const fn = new Function(
    "__bridgeArgs",
    `"use strict";
    return (async () => {
      ${body}
    })();
    `,
  ) as (bridgeArgs: unknown) => Promise<unknown>;

  // Execute with side-effect tracking and timeout
  const { result: rawResult, effects } = await trackSideEffects(() =>
    runWithTimeout(() => fn(userArgs), timeoutMs),
  );

  // Warn if DOM was mutated but not allowed
  if (effects.domMutated && !allowDomMutation) {
    // We still return the result; the caller can inspect sideEffects
  }

  // Serialize and format result based on returnMode
  const result = formatResult(rawResult, returnMode, maxResultBytes);

  return {
    ...result,
    sideEffects: effects,
  };
}

/**
 * Format a raw result into the EvaluateResult shape.
 */
function formatResult(
  rawResult: unknown,
  returnMode: "json" | "text" | "preview",
  maxResultBytes: number,
): Omit<EvaluateResult, "sideEffects"> {
  if (returnMode === "text") {
    const text = rawResult == null ? "" : String(rawResult);
    const bytes = new TextEncoder().encode(text).length;
    const truncated = bytes > maxResultBytes;
    const finalText = truncated ? truncateBytes(text, maxResultBytes) : text;
    return {
      type: "text",
      text: finalText,
      preview: previewOf(finalText),
      bytes: new TextEncoder().encode(finalText).length,
      truncated,
    };
  }

  if (returnMode === "preview") {
    const preview = previewOf(rawResult);
    const bytes = new TextEncoder().encode(preview).length;
    return {
      type: "preview",
      preview,
      bytes,
      truncated: false,
    };
  }

  // returnMode === "json" (default)
  const serialized = safeSerialize(rawResult);
  let jsonText: string;
  try {
    jsonText = JSON.stringify(serialized);
  } catch (_err) {
    jsonText = "[Unserializable]";
  }

  const bytes = new TextEncoder().encode(jsonText).length;
  const truncated = bytes > maxResultBytes;

  if (truncated) {
    const truncatedText = truncateBytes(jsonText, maxResultBytes);
    let truncatedValue: unknown;
    try {
      truncatedValue = JSON.parse(truncatedText);
    } catch (_err) {
      truncatedValue = truncatedText;
    }
    return {
      type: "json",
      value: truncatedValue,
      preview: previewOf(truncatedText),
      bytes: new TextEncoder().encode(truncatedText).length,
      truncated: true,
    };
  }

  return {
    type: "json",
    value: serialized,
    preview: previewOf(jsonText),
    bytes,
    truncated: false,
  };
}

/**
 * Generate a short preview string (≤ 200 chars) for any value.
 */
function previewOf(value: unknown): string {
  let str: string;
  if (typeof value === "string") {
    str = value;
  } else {
    try {
      str = JSON.stringify(value);
    } catch (_err) {
      str = String(value);
    }
  }
  if (str.length > 200) {
    return str.slice(0, 200) + "...";
  }
  return str;
}

/**
 * Truncate a UTF-8 string so its byte length does not exceed maxBytes.
 * Uses binary search for correctness with multi-byte characters.
 */
function truncateBytes(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) {
    return text;
  }

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const slice = text.slice(0, mid);
    if (encoder.encode(slice).length <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return text.slice(0, low);
}
