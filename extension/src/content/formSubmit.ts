/**
 * Kimi WebBridge v2.0 — Form Submission Runtime
 *
 * Multi-strategy form submit with contenteditable composer support.
 */

import type { TargetRef } from "../shared/protocol.js";
import type { ActionResultWithOptionalState } from "../shared/telemetry.js";
import { resolveTarget, isVisible, elementToLite } from "./actionRuntime.js";
import { dispatchKey } from "./keyboard.js";

// ---------------------------------------------------------------------------
// Argument type
// ---------------------------------------------------------------------------

export type SubmitFormArgs = {
  target?: TargetRef | "active";
  strategy?:
    | "auto"
    | "requestSubmit"
    | "click-submit-button"
    | "enter"
    | "ctrl-enter"
    | "nearby-submit";
  verify?: unknown;
  returnPageState?: boolean;
};

// ---------------------------------------------------------------------------
// Contenteditable detection
// ---------------------------------------------------------------------------

export function isContentEditableInput(el: Element | null): boolean {
  if (!el) return false;
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.getAttribute("contenteditable") === "true" ||
    !!el.closest("[contenteditable='true']")
  );
}

// ---------------------------------------------------------------------------
// Nearby submit button search
// ---------------------------------------------------------------------------

export function findNearbySubmitButton(activeEl: Element): HTMLElement | null {
  // 1. Inside same form
  const form = activeEl.closest("form");
  if (form) {
    const submitBtn = form.querySelector<HTMLElement>(
      'button[type="submit"], input[type="submit"]',
    );
    if (submitBtn && isVisible(submitBtn)) return submitBtn;
  }

  // 2. Inside same container / composer area
  const container =
    activeEl.closest(
      '[class*="chat"], [class*="composer"], [class*="message"], [class*="input"], [id*="chat"], [id*="composer"]',
    ) || activeEl.parentElement;

  if (container) {
    const selectors = [
      'button[type="submit"]',
      'button[aria-label*="send" i]',
      'button[aria-label*="submit" i]',
      'button[data-testid*="send" i]',
      'button[data-testid*="submit" i]',
      '[role="button"][aria-label*="send" i]',
      '[role="button"][aria-label*="submit" i]',
    ];
    for (const sel of selectors) {
      const btn = container.querySelector<HTMLElement>(sel);
      if (btn && isVisible(btn)) return btn;
    }
  }

  // 3. Siblings and nearby DOM (within ~3 siblings)
  const parent = activeEl.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(activeEl);
    for (let offset = 1; offset <= 3; offset++) {
      const next = siblings[index + offset];
      const prev = siblings[index - offset];
      for (const el of [next, prev]) {
        if (!el) continue;
        if (el instanceof HTMLElement && isVisible(el)) {
          const role = el.getAttribute("role");
          const tag = el.tagName.toLowerCase();
          if ((tag === "button" || role === "button") && !(el as HTMLButtonElement).disabled) {
            return el;
          }
          const innerBtn = el.querySelector<HTMLElement>(
            'button:not([disabled]), [role="button"]:not([aria-disabled="true"])',
          );
          if (innerBtn && isVisible(innerBtn)) return innerBtn;
        }
      }
    }
  }

  // 4. Proximity search (~200px from active element's right edge)
  const rect = activeEl.getBoundingClientRect();
  const allButtons = Array.from(
    document.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [role="button"]:not([aria-disabled="true"])',
    ),
  );
  let best: HTMLElement | null = null;
  let bestDistance = Infinity;
  for (const btn of allButtons) {
    if (!isVisible(btn)) continue;
    const btnRect = btn.getBoundingClientRect();
    const dx = Math.abs(btnRect.left - rect.right);
    const dy = Math.abs(btnRect.top - rect.top);
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 200 && distance < bestDistance) {
      best = btn;
      bestDistance = distance;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// submit_form
// ---------------------------------------------------------------------------

export function submitForm(args: SubmitFormArgs): ActionResultWithOptionalState {
  const strategy = args.strategy ?? "auto";
  const targetEl = resolveTarget(args.target ?? "active");

  if (!targetEl) {
    return {
      action: "submit_form",
      success: false,
      strategyUsed: strategy,
    };
  }

  const strategiesToTry: Array<Exclude<SubmitFormArgs["strategy"], undefined>> =
    strategy === "auto"
      ? ["requestSubmit", "click-submit-button", "nearby-submit", "enter", "ctrl-enter"]
      : [strategy];

  for (const s of strategiesToTry) {
    if (s === "requestSubmit") {
      const form = targetEl.closest("form");
      if (form && form instanceof HTMLFormElement) {
        form.requestSubmit();
        return {
          action: "submit_form",
          success: true,
          strategyUsed: "requestSubmit",
          target: elementToLite(targetEl),
        };
      }
    }

    if (s === "click-submit-button") {
      const form = targetEl.closest("form");
      if (form) {
        const btn = form.querySelector<HTMLElement>(
          'button[type="submit"], input[type="submit"]',
        );
        if (btn && isVisible(btn)) {
          btn.click();
          return {
            action: "submit_form",
            success: true,
            strategyUsed: "click-submit-button",
            target: elementToLite(targetEl),
          };
        }
      }
    }

    if (s === "nearby-submit") {
      const btn = findNearbySubmitButton(targetEl);
      if (btn) {
        btn.click();
        return {
          action: "submit_form",
          success: true,
          strategyUsed: "nearby-submit",
          target: elementToLite(targetEl),
        };
      }
    }

    if (s === "enter") {
      dispatchKey({
        key: "Enter",
        target: args.target ?? "active",
      });
      return {
        action: "submit_form",
        success: true,
        strategyUsed: "enter",
        target: elementToLite(targetEl),
      };
    }

    if (s === "ctrl-enter") {
      dispatchKey({
        key: "Enter",
        target: args.target ?? "active",
        modifiers: { ctrl: true },
      });
      return {
        action: "submit_form",
        success: true,
        strategyUsed: "ctrl-enter",
        target: elementToLite(targetEl),
      };
    }
  }

  return {
    action: "submit_form",
    success: false,
    strategyUsed: strategy,
    target: elementToLite(targetEl),
  };
}
