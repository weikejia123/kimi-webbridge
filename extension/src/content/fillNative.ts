/**
 * Kimi WebBridge v2.0 — Native Value Setter
 *
 * Bypasses React/Vue/Angular synthetic event systems by writing directly
 * to the native DOM value descriptor, then dispatching input/change events.
 */

import type { ActionResult } from "../shared/telemetry.js";

export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const descriptor =
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value") ||
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");

  if (descriptor && descriptor.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }

  el.dispatchEvent(
    new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText" }),
  );
  el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
}

export function fillElement(el: Element, value: string, clear = true): ActionResult {
  const htmlEl = el instanceof HTMLElement ? el : null;
  if (!htmlEl) {
    return { action: "fill", success: false };
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (clear) {
      el.select();
    }
    setNativeValue(el, value);
  } else if (el.getAttribute("contenteditable") === "true" || (el as HTMLElement).isContentEditable) {
    if (clear) {
      el.textContent = "";
    }
    el.textContent = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  } else {
    return { action: "fill", success: false };
  }

  return { action: "fill", success: true };
}
