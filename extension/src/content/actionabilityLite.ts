/**
 * Kimi WebBridge v2.0 — Actionability Lite
 *
 * Lightweight pre-action checks with diagnostic warnings.
 */

import { isVisible } from "./actionRuntime.js";
import { computeBridgeName } from "./nameInference.js";

export function checkActionabilityLite(el: Element): {
  actionable: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  const htmlEl = el instanceof HTMLElement ? el : null;

  // Visibility
  if (!isVisible(el)) {
    warnings.push("NOT_VISIBLE");
  }

  // Enabled
  let disabled = false;
  if (htmlEl && "disabled" in htmlEl && (htmlEl as HTMLInputElement).disabled) {
    disabled = true;
    warnings.push("DISABLED");
  }
  if (el.getAttribute("aria-disabled") === "true") {
    disabled = true;
    if (!warnings.includes("DISABLED")) {
      warnings.push("DISABLED");
    }
  }

  // Size
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    warnings.push("ZERO_SIZE");
  }

  // Accessible name / confidence
  const { name, inferredName, confidence } = computeBridgeName(el);
  if (!name && !inferredName) {
    warnings.push("MISSING_ACCESSIBLE_NAME");
  } else if (!name) {
    warnings.push("MISSING_ACCESSIBLE_NAME");
  }
  if (confidence < 0.7) {
    warnings.push("LOW_CONFIDENCE_LABEL");
  }

  const actionable = isVisible(el) && !disabled && rect.width > 0 && rect.height > 0;
  return { actionable, warnings };
}
