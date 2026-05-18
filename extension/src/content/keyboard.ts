/**
 * Kimi WebBridge v2.0 — Keyboard Action Runtime
 *
 * press_key, key_combo, and related helpers.
 */

import type { TargetRef } from "../shared/protocol.js";
import type { ActionResult } from "../shared/telemetry.js";
import { makeActionResult } from "../shared/telemetry.js";
import { resolveTarget, scrollIntoView, elementToLite } from "./actionRuntime.js";

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

export type PressKeyArgs = {
  key: string;
  code?: string;
  modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };
  target?: TargetRef | "active";
  repeat?: number;
  delayMs?: number;
};

export type KeyComboArgs = {
  combo: string;
  target?: TargetRef | "active";
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getTabbableElements(): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
  ].join(", ");
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return elements.filter((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

function dispatchKeyboardEvent(
  target: EventTarget,
  type: "keydown" | "keypress" | "keyup",
  key: string,
  code: string,
  modifiers: NonNullable<PressKeyArgs["modifiers"]>,
): boolean {
  const event = new KeyboardEvent(type, {
    key,
    code,
    bubbles: true,
    cancelable: true,
    ctrlKey: modifiers.ctrl ?? false,
    altKey: modifiers.alt ?? false,
    shiftKey: modifiers.shift ?? false,
    metaKey: modifiers.meta ?? false,
  });
  return target.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// press_key
// ---------------------------------------------------------------------------

export function dispatchKey(args: PressKeyArgs): ActionResult {
  const key = args.key;
  const code = args.code ?? key;
  const modifiers = args.modifiers ?? {};
  const repeat = args.repeat ?? 1;
  const targetRef = args.target ?? "active";

  let targetEl = resolveTarget(targetRef);

  // ---- Tab: manual focus cycling -----------------------------------------
  if (key === "Tab" && targetRef === "active") {
    const tabbable = getTabbableElements();
    if (tabbable.length === 0) {
      return makeActionResult("press_key", false);
    }
    const activeIndex = tabbable.findIndex((el) => el === document.activeElement);
    const direction = modifiers.shift ? -1 : 1;
    let nextIndex: number;
    if (activeIndex === -1) {
      nextIndex = direction === 1 ? 0 : tabbable.length - 1;
    } else {
      nextIndex = (activeIndex + direction + tabbable.length) % tabbable.length;
    }
    const nextEl = tabbable[nextIndex];
    if (!nextEl) {
      return makeActionResult("press_key", false);
    }

    if (targetEl) {
      dispatchKeyboardEvent(targetEl, "keydown", key, code, modifiers);
      dispatchKeyboardEvent(targetEl, "keypress", key, code, modifiers);
    }
    nextEl.focus();
    scrollIntoView(nextEl);
    dispatchKeyboardEvent(nextEl, "keyup", key, code, modifiers);
    return {
      action: "press_key",
      success: true,
      target: elementToLite(nextEl),
    };
  }

  // ---- Escape: dispatch to active element AND document --------------------
  if (key === "Escape") {
    const activeEl = document.activeElement ?? document;
    dispatchKeyboardEvent(activeEl, "keydown", key, code, modifiers);
    dispatchKeyboardEvent(activeEl, "keypress", key, code, modifiers);
    dispatchKeyboardEvent(activeEl, "keyup", key, code, modifiers);
    dispatchKeyboardEvent(document, "keydown", key, code, modifiers);
    dispatchKeyboardEvent(document, "keyup", key, code, modifiers);
    const result: ActionResult = {
      action: "press_key",
      success: true,
    };
    if (activeEl instanceof Element) {
      result.target = elementToLite(activeEl);
    }
    return result;
  }

  // ---- Resolve target -----------------------------------------------------
  if (!targetEl) {
    targetEl = document.activeElement;
  }
  if (!targetEl) {
    return makeActionResult("press_key", false);
  }

  const isInputLike =
    targetEl instanceof HTMLInputElement ||
    targetEl instanceof HTMLTextAreaElement;

  // ---- Dispatch sequence --------------------------------------------------
  for (let i = 0; i < repeat; i++) {
    dispatchKeyboardEvent(targetEl, "keydown", key, code, modifiers);
    dispatchKeyboardEvent(targetEl, "keypress", key, code, modifiers);

    // Ctrl+A fallback: select all text in input/textarea
    if (
      key.toLowerCase() === "a" &&
      modifiers.ctrl &&
      !modifiers.alt &&
      !modifiers.meta &&
      isInputLike
    ) {
      (targetEl as HTMLInputElement | HTMLTextAreaElement).select();
    }

    dispatchKeyboardEvent(targetEl, "keyup", key, code, modifiers);

    // NOTE: delayMs between repeats is intentionally skipped in Phase 1
    // because ActionResult is synchronous. Async delays can be added later.
  }

  return {
    action: "press_key",
    success: true,
    target: elementToLite(targetEl),
  };
}

// ---------------------------------------------------------------------------
// key_combo
// ---------------------------------------------------------------------------

export function dispatchKeyCombo(args: KeyComboArgs): ActionResult {
  const parts = args.combo.split("+").map((p) => p.trim());
  if (parts.length === 0) {
    return makeActionResult("key_combo", false);
  }

  const key = parts.at(-1);
  if (!key) {
    return makeActionResult("key_combo", false);
  }

  const modifierNames = parts.slice(0, -1);
  const modifiers: NonNullable<PressKeyArgs["modifiers"]> = {};
  for (const mod of modifierNames) {
    const lower = mod.toLowerCase();
    if (lower === "ctrl" || lower === "control") modifiers.ctrl = true;
    if (lower === "alt") modifiers.alt = true;
    if (lower === "shift") modifiers.shift = true;
    if (lower === "meta" || lower === "cmd" || lower === "command" || lower === "win")
      modifiers.meta = true;
  }

  const pressArgs = {
    key,
    modifiers,
    ...(typeof args.target !== "undefined" ? { target: args.target } : {}),
  } satisfies PressKeyArgs;

  return dispatchKey(pressArgs);
}
