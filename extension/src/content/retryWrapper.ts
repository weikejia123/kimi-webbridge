/**
 * Kimi WebBridge v2.0 — Retry Wrapper with Exponential Backoff
 *
 * Wraps flaky DOM actions with configurable retry and backoff.
 */

import type { BridgeErrorCode } from "../shared/protocol.js";

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 4000,
};

export const RETRYABLE_ERROR_CODES: ReadonlySet<BridgeErrorCode> = new Set([
  "STALE_ELEMENT",
  "ELEMENT_NOT_VISIBLE",
  "DOM_STABLE_TIMEOUT",
  "EVALUATION_ERROR",
]);

export function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const code = (err as unknown as Record<string, unknown>).code;
    if (typeof code === "string") {
      return RETRYABLE_ERROR_CODES.has(code as BridgeErrorCode);
    }
    return RETRYABLE_ERROR_CODES.has(err.message as BridgeErrorCode);
  }
  if (typeof err === "object" && err !== null) {
    const code = (err as Record<string, unknown>).code;
    if (typeof code === "string") {
      return RETRYABLE_ERROR_CODES.has(code as BridgeErrorCode);
    }
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>,
  isRetryable?: (err: unknown) => boolean,
): Promise<T> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const shouldRetry = isRetryable ?? isRetryableError;

  let lastError: unknown;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= cfg.maxRetries || !shouldRetry(err)) {
        break;
      }
      const delay = Math.min(cfg.baseDelayMs * Math.pow(2, attempt), cfg.maxDelayMs);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
