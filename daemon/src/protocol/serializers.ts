/**
 * Kimi WebBridge v2.0 — Serializers and Result Utilities
 *
 * Validation and truncation helpers for evaluation results.
 */

import { z } from "zod";
import type { EvaluateResult } from "../shared/protocol.js";

const EvaluateResultSchema = z.object({
  type: z.enum(["json", "text", "preview"]),
  value: z.unknown().optional(),
  text: z.string().optional(),
  preview: z.string(),
  bytes: z.number(),
  truncated: z.boolean(),
  sideEffects: z
    .object({
      domMutated: z.boolean().optional(),
      navigationStarted: z.boolean().optional(),
    })
    .optional(),
});

/** Validate unknown data against the EvaluateResult shape. */
export function validateEvaluateResult(data: unknown): EvaluateResult {
  const parsed = EvaluateResultSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Invalid EvaluateResult: ${parsed.error.message}`);
  }
  return parsed.data as EvaluateResult;
}

const ESTIMATE_CAP = 10 * 1024 * 1024; // 10MB cap

/**
 * Estimate JSON byte length without full serialization beyond the cap.
 * Uses JSON.stringify and Buffer.byteLength for accuracy.
 */
export function estimateByteLength(value: unknown): number {
  try {
    const str = JSON.stringify(value);
    if (str === undefined) {
      return 0;
    }
    const bytes = Buffer.byteLength(str, "utf-8");
    return Math.min(bytes, ESTIMATE_CAP);
  } catch {
    return 0;
  }
}

const MAX_TRUNCATE_DEPTH = 6;

/**
 * Recursively truncate string fields within a value so that no individual
 * string exceeds maxStrBytes.
 */
function truncateStrings(value: unknown, maxStrBytes: number, depth: number): unknown {
  if (depth > MAX_TRUNCATE_DEPTH) {
    return "[DEPTH_EXCEEDED]";
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    const bytes = Buffer.byteLength(value, "utf-8");
    if (bytes <= maxStrBytes) {
      return value;
    }
    // Conservative UTF-8 worst case: 4 bytes per character
    const safeChars = Math.max(3, Math.floor(maxStrBytes / 4) - 3);
    return value.slice(0, safeChars) + "...";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => truncateStrings(item, maxStrBytes, depth + 1));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      out[key] = truncateStrings(obj[key], maxStrBytes, depth + 1);
    }
    return out;
  }

  return String(value);
}

/**
 * If result exceeds maxBytes, truncate string fields and set truncated flag.
 */
export function truncateResult<T>(result: T, maxBytes: number): { value: T; truncated: boolean } {
  const initialBytes = estimateByteLength(result);
  if (initialBytes <= maxBytes) {
    return { value: result, truncated: false };
  }

  // Binary search for the largest per-string byte limit that keeps total under maxBytes
  let low = 0;
  let high = maxBytes;
  let best: unknown = result;
  let bestFits = false;

  for (let i = 0; i < 20; i++) {
    const mid = Math.floor((low + high) / 2);
    const candidate = truncateStrings(result, mid, 0);
    const size = estimateByteLength(candidate);
    const fits = size <= maxBytes;
    if (fits) {
      best = candidate;
      bestFits = true;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
    if (low > high) {
      break;
    }
  }

  // Fallback: if structure alone exceeds the limit, produce a preview string
  if (!bestFits) {
    let preview = "";
    try {
      preview = JSON.stringify(result);
    } catch {
      preview = "[Non-serializable]";
    }
    const safeChars = Math.max(3, Math.floor(maxBytes / 2) - 3);
    best = preview.slice(0, safeChars) + "...";
  }

  return { value: best as T, truncated: true };
}
