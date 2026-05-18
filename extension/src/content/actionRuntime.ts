/**
 * Kimi WebBridge v2.0 — Content Script Action Runtime Core
 *
 * Element resolution, visibility checks, scrolling, telemetry helpers.
 */

import type { TargetRef, BridgeTelemetry, WaitAfterPolicy } from "../shared/protocol.js";
import type { ActionResult, ElementInfoLite } from "../shared/telemetry.js";
import { checkActionability } from "./actionability.js";
import { waitForDomStable } from "./domStability.js";
import { captureMiniPageState, computePageDiff } from "./pageDiff.js";

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
// Observe-and-Act helper
// ---------------------------------------------------------------------------

export async function performAction(
  actionName: string,
  target: Element,
  act: () => void,
  opts?: {
    waitAfter?: WaitAfterPolicy;
    returnDiff?: boolean;
  },
): Promise<ActionResult> {
  const waitAfter = opts?.waitAfter ?? { domStable: true, quietMs: 300, timeoutMs: 3000 };
  const returnDiff = opts?.returnDiff ?? false;

  const pre = captureMiniPageState();

  const actionability = await checkActionability(target);
  if (!actionability.actionable) {
    return {
      action: actionName,
      success: false,
      target: elementToLite(target),
      pre,
    };
  }

  let actError: string | undefined;
  try {
    act();
  } catch (err) {
    actError = err instanceof Error ? err.message : String(err);
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
  };
  if (actError !== undefined) {
    result.error = actError;
  }
  if (diff !== undefined) {
    result.diff = diff;
  }
  return result;
}
