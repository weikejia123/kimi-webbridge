/**
 * Kimi WebBridge v2.0 — Full Actionability Checks
 *
 * Comprehensive pre-action validation with position-stability sampling.
 */

import { isVisible } from "./actionRuntime.js";

export type ActionabilityResult = {
  actionable: boolean;
  reason?: string;
  warnings: string[];
};

/**
 * Run all actionability checks (including async position-stability sampling).
 */
export async function checkActionability(el: Element): Promise<ActionabilityResult> {
  const warnings: string[] = [];

  // 1. Exists
  if (!el) {
    return { actionable: false, reason: "ELEMENT_NOT_FOUND", warnings: ["NOT_FOUND"] };
  }

  // 2. Connected
  if (!el.isConnected) {
    return { actionable: false, reason: "STALE_ELEMENT", warnings: ["NOT_CONNECTED"] };
  }

  // 3. Visible
  if (!isVisible(el)) {
    warnings.push("NOT_VISIBLE");
    return { actionable: false, reason: "ELEMENT_NOT_VISIBLE", warnings };
  }

  // 4. Non-zero bounding box
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    warnings.push("ZERO_SIZE");
    return { actionable: false, reason: "ELEMENT_NOT_VISIBLE", warnings };
  }

  // 5. Enabled
  const htmlEl = el instanceof HTMLElement ? el : null;
  const inputDisabled = htmlEl && "disabled" in htmlEl && (htmlEl as HTMLInputElement).disabled;
  const ariaDisabled = el.getAttribute("aria-disabled") === "true";
  if (inputDisabled || ariaDisabled) {
    warnings.push("DISABLED");
    return { actionable: false, reason: "ELEMENT_DISABLED", warnings };
  }

  // 6. Not covered by another element
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const topEl = document.elementFromPoint(centerX, centerY);
  if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
    warnings.push("COVERED");
    return { actionable: false, reason: "ELEMENT_COVERED", warnings };
  }

  // 7. In or scrollable to viewport
  const vpWidth = window.innerWidth;
  const vpHeight = window.innerHeight;
  const inViewport = !(
    rect.right < 0 || rect.left > vpWidth || rect.bottom < 0 || rect.top > vpHeight
  );
  if (!inViewport) {
    if (typeof el.scrollIntoView !== "function") {
      warnings.push("OUT_OF_VIEWPORT");
      return { actionable: false, reason: "ELEMENT_NOT_VISIBLE", warnings };
    }
    warnings.push("NEEDS_SCROLL");
  }

  // 8. Position stable — sample across 2 animation frames
  const x1 = rect.x;
  const y1 = rect.y;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
  const rect2 = el.getBoundingClientRect();
  const delta = Math.abs(rect2.x - x1) + Math.abs(rect2.y - y1);
  if (delta > 2) {
    warnings.push("UNSTABLE_POSITION");
    return { actionable: false, reason: "ELEMENT_UNSTABLE", warnings };
  }

  return { actionable: true, warnings };
}
