/**
 * Kimi WebBridge v2.0 — scroll_to Tool Handler
 *
 * Scrolls an element into view or scrolls the page by offset.
 */

import type { ActionResult } from "../shared/telemetry.js";

export type ScrollToArgs = {
  target?: { ref?: string; selector?: string } | "active";
  behavior?: "smooth" | "auto";
  block?: "start" | "center" | "end" | "nearest";
  inline?: "start" | "center" | "end" | "nearest";
  x?: number;
  y?: number;
};

export function scrollToElement(el: Element, args: ScrollToArgs): ActionResult {
  const behavior = args.behavior ?? "auto";
  const block = args.block ?? "center";
  const inline = args.inline ?? "nearest";

  el.scrollIntoView({ behavior, block, inline });

  return {
    action: "scroll_to",
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

export function scrollByOffset(args: ScrollToArgs): ActionResult {
  const x = args.x ?? 0;
  const y = args.y ?? 0;
  const behavior = args.behavior ?? "auto";

  window.scrollBy({ left: x, top: y, behavior });

  return {
    action: "scroll_to",
    success: true,
  };
}
