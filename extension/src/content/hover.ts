/**
 * Kimi WebBridge v2.0 — hover Tool Handler
 *
 * Dispatches mouseenter and mouseover events on an element.
 */

import type { ActionResult } from "../shared/telemetry.js";

export function hoverElement(el: Element): ActionResult {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  const mouseenter = new MouseEvent("mouseenter", {
    bubbles: false,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  const mouseover = new MouseEvent("mouseover", {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });

  el.dispatchEvent(mouseenter);
  el.dispatchEvent(mouseover);

  return {
    action: "hover",
    success: true,
    target: {
      tag: el.tagName.toLowerCase(),
      visible: true,
      enabled: true,
      actionable: true,
      ...(el.getAttribute("data-bridge-ref") ? { ref: el.getAttribute("data-bridge-ref")! } : {}),
      ...(el.getAttribute("role") ? { role: el.getAttribute("role")! } : {}),
    },
  };
}
