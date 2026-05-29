/**
 * Kimi WebBridge v2.0 — Content Script Action Runtime Core
 *
 * Element resolution, visibility checks, scrolling, telemetry helpers.
 * Phase 3 adds pre-action screenshot capture and ring buffer.
 */

import type { TargetRef, BridgeTelemetry, WaitAfterPolicy } from "../shared/protocol.js";
import type { ActionResult, ElementInfoLite } from "../shared/telemetry.js";
import { checkActionability } from "./actionability.js";
import { waitForDomStable } from "./domStability.js";
import { captureMiniPageState, computePageDiff } from "./pageDiff.js";
import { withRetry } from "./retryWrapper.js";
import { buildRollbackPlan, rollback } from "./rollback.js";

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

export function resolveTarget(target: TargetRef | "active"): Element | null {
  if (target === "active") {
    return document.activeElement;
  }
  if (target.ref !== undefined) {
    return document.querySelector(`[data-bridge-ref="${CSS.escape(target.ref)}"]`);
  }
  if (target.selector !== undefined) {
    return document.querySelector(target.selector);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

export function isVisible(el: Element): boolean {
  if (!el.isConnected) {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (style.display === "none") {
    return false;
  }
  if (style.visibility === "hidden" || style.visibility === "collapse") {
    return false;
  }
  if (parseFloat(style.opacity) === 0) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Scrolling
// ---------------------------------------------------------------------------

export function scrollIntoView(el: Element): void {
  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

export function buildTelemetry(startTime: number): BridgeTelemetry {
  return {
    durationMs: Math.round(performance.now() - startTime),
  };
}

// ---------------------------------------------------------------------------
// Element lite conversion
// ---------------------------------------------------------------------------

export function elementToLite(el: Element): ElementInfoLite {
  const htmlEl = el instanceof HTMLElement ? el : null;
  const info: ElementInfoLite = {
    tag: el.tagName,
    visible: isVisible(el),
    enabled: htmlEl
      ? !(htmlEl as HTMLInputElement).disabled &&
        htmlEl.getAttribute("aria-disabled") !== "true"
      : true,
    actionable: htmlEl ? htmlEl.isConnected && isVisible(el) : el.isConnected,
  };
  const role = el.getAttribute("role");
  if (role !== null) {
    info.role = role;
  }
  return info;
}

// ---------------------------------------------------------------------------
// Pre-action screenshot capture
// ---------------------------------------------------------------------------

export interface ActionContext {
  preScreenshot?: string;
  timestamp: number;
}

const SCREENSHOT_RING_BUFFER_SIZE = 10;
const screenshotRingBuffer: ActionContext[] = [];

function pushToScreenshotBuffer(_action: string, screenshot: string | undefined): void {
  if (!screenshot) return;
  screenshotRingBuffer.push({ preScreenshot: screenshot, timestamp: Date.now() });
  if (screenshotRingBuffer.length > SCREENSHOT_RING_BUFFER_SIZE) {
    screenshotRingBuffer.shift();
  }
}

export function getRecentScreenshots(count = 10): ActionContext[] {
  return screenshotRingBuffer.slice(-count);
}

function requestScreenshot(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), 1500);
    try {
      chrome.runtime.sendMessage({ type: "capture_screenshot" }, (result: unknown) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          resolve(undefined);
        } else {
          const r = result as { success?: boolean; screenshot?: string } | undefined;
          if (r?.success && typeof r.screenshot === "string") {
            resolve(r.screenshot);
          } else {
            resolve(undefined);
          }
        }
      });
    } catch {
      clearTimeout(timer);
      resolve(undefined);
    }
  });
}

// ---------------------------------------------------------------------------
// Observe-and-Act helper
// ---------------------------------------------------------------------------

export async function performAction(
  actionName: string,
  target: Element,
  act: () => void | Record<string, unknown>,
  opts?: {
    waitAfter?: WaitAfterPolicy;
    returnDiff?: boolean;
  },
): Promise<ActionResult> {
  const waitAfter = opts?.waitAfter ?? { domStable: true, quietMs: 300, timeoutMs: 3000 };
  const returnDiff = opts?.returnDiff ?? false;

  const preScreenshot = await requestScreenshot();
  pushToScreenshotBuffer(actionName, preScreenshot);

  const pre = captureMiniPageState();

  const actionability = await checkActionability(target);
  if (!actionability.actionable) {
    return {
      action: actionName,
      success: false,
      target: elementToLite(target),
      pre,
      error: actionability.reason ?? "Element not actionable",
      preScreenshot,
    };
  }

  const retryableErrors = ["STALE_ELEMENT", "ELEMENT_NOT_VISIBLE", "DOM_STABLE_TIMEOUT", "ELEMENT_COVERED"];

  let actError: string | undefined;
  let actExtra: Record<string, unknown> | undefined;
  try {
    const res = await withRetry(
      async () => act(),
      { maxRetries: 2, baseDelayMs: 300, maxDelayMs: 2000 },
      (err) => retryableErrors.includes((err as Error)?.message ?? ""),
    );
    if (res !== undefined && typeof res === "object") {
      actExtra = res as Record<string, unknown>;
    }
  } catch (err) {
    actError = err instanceof Error ? err.message : String(err);

    const rollbackPlan = buildRollbackPlan(actionName, target);
    if (rollbackPlan.length > 0) {
      await rollback(rollbackPlan);
    }
  }

  let timedOut = false;
  if (waitAfter.domStable !== false) {
    const stableResult = await waitForDomStable({
      quietMs: waitAfter.quietMs ?? 300,
      timeoutMs: waitAfter.timeoutMs ?? 3000,
    });
    timedOut = stableResult.timedOut;
  }

  const post = captureMiniPageState();
  const diff = returnDiff ? computePageDiff(pre, post) : undefined;

  const result: ActionResult = {
    action: actionName,
    success: actError === undefined,
    target: elementToLite(target),
    timedOut,
    pre,
    post,
    preScreenshot,
  };
  if (actError !== undefined) {
    result.error = actError;
  }
  if (actExtra) {
    Object.assign(result, actExtra);
  }
  if (diff !== undefined) {
    result.diff = diff;
  }
  return result;
}
