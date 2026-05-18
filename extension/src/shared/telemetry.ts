/**
 * Kimi WebBridge v2.0 — Telemetry & Result Types
 *
 * Frozen by Worker-0. All workers read; only Worker-0 writes.
 */

import type {
  BridgeTelemetry,
  PageState,
  PageStateDiff,
} from "./protocol.js";

export type { BridgeTelemetry, PageState };

// ---------------------------------------------------------------------------
// Lightweight variants used inside ActionResult
// ---------------------------------------------------------------------------

/** Minimal element info for embedding in telemetry / diffs. */
export type ElementInfoLite = {
  ref?: string;
  role?: string;
  tag: string;
  visible: boolean;
  enabled: boolean;
  actionable: boolean;
};

/** Minimal page snapshot captured before/after actions. */
export type MiniPageState = {
  url: string;
  title: string;
  readyState?: DocumentReadyState;
  textLength?: number;
  elementCount?: number;
};

// ---------------------------------------------------------------------------
// Action Result Types
// ---------------------------------------------------------------------------

export type ActionResult = {
  action: string;
  success: boolean;
  strategyUsed?: string;
  target?: ElementInfoLite;
  timedOut?: boolean;
  pre?: MiniPageState;
  post?: MiniPageState;
  diff?: PageStateDiff;
  error?: string;
};

export type ActionResultWithOptionalState = ActionResult & {
  pageState?: PageState;
};

// ---------------------------------------------------------------------------
// Wait Result
// ---------------------------------------------------------------------------

export type WaitResult = {
  conditionMet: boolean;
  timedOut: boolean;
  waitedMs: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a default BridgeTelemetry object for successful stub responses. */
export function makeTelemetry(startMs: number): BridgeTelemetry {
  return {
    durationMs: Math.round(performance.now() - startMs),
  };
}

/** Create a minimal successful ActionResult. */
export function makeActionResult(
  action: string,
  success: boolean,
): ActionResult {
  return {
    action,
    success,
  };
}
