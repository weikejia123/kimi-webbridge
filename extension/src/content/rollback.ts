/**
 * Kimi WebBridge v2.0 — Rollback Actions
 *
 * Best-effort undo for failed actions.
 */

import type { TargetRef } from "../shared/protocol.js";
import { resolveWithFallbackSelfHealing } from "./elementResolver.js";

export interface RollbackAction {
  type: "undo_fill" | "close_modal" | "navigate_back" | "click_cancel";
  target?: TargetRef;
}

export function buildRollbackPlan(failedAction: string, _target: Element | null): RollbackAction[] {
  const plan: RollbackAction[] = [];
  if (failedAction.includes("click")) {
    plan.push({ type: "close_modal" });
  }
  return plan;
}

export async function rollback(actions: RollbackAction[]): Promise<boolean> {
  let anySuccess = false;

  for (const action of actions) {
    try {
      switch (action.type) {
        case "undo_fill": {
          if (action.target) {
            const resolved = resolveWithFallbackSelfHealing(action.target);
            if (resolved.element) {
              const el = resolved.element;
              if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                el.value = "";
                el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
                el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
                anySuccess = true;
              } else if ((el as HTMLElement).isContentEditable) {
                el.textContent = "";
                el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
                anySuccess = true;
              }
            }
          }
          break;
        }
        case "close_modal": {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          const dismissBtn = document.querySelector('[data-dismiss="modal"]');
          if (dismissBtn instanceof HTMLElement) {
            dismissBtn.click();
            anySuccess = true;
          }
          break;
        }
        case "navigate_back": {
          history.back();
          anySuccess = true;
          break;
        }
        case "click_cancel": {
          const cancelBtn = Array.from(document.querySelectorAll("button, a")).find((el) => {
            const text = el.textContent?.trim().toLowerCase();
            return text === "cancel" || text === "close" || text === "dismiss";
          });
          if (cancelBtn instanceof HTMLElement) {
            cancelBtn.click();
            anySuccess = true;
          }
          break;
        }
      }
    } catch {
      // Ignore individual rollback errors
    }
  }

  return anySuccess;
}
