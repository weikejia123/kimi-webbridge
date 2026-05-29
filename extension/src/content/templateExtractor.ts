/**
 * Kimi WebBridge v2.0 — Action Template Extractor
 *
 * Derives reusable action templates from recorded action sequences.
 */

import type { ElementInfo, TargetRef } from "../shared/protocol.js";

export interface RecordedAction {
  type: "click" | "fill" | "select" | "wait" | "keypress";
  timestamp: number;
  target?: TargetRef | undefined;
  selector?: string | undefined;
  text?: string | undefined;
  role?: string | undefined;
  value?: string | undefined;
  fieldType?: string | undefined;
  waitCondition?: "stable" | "ms" | undefined;
  waitMs?: number | undefined;
}

export interface ActionTemplate {
  name: string;
  steps: Array<
    | { type: "click"; target: { selector?: string | undefined; text?: string | undefined; role?: string | undefined } }
    | { type: "fill"; target: { selector?: string | undefined; fieldType?: string | undefined }; value: string }
    | { type: "wait"; condition: "stable" | "ms"; ms?: number | undefined }
    | { type: "select"; target: { selector?: string | undefined }; value: string }
  >;
}

export function extractTemplateFromActions(actions: RecordedAction[]): ActionTemplate {
  const steps: ActionTemplate["steps"] = [];

  for (const action of actions) {
    switch (action.type) {
      case "click": {
        steps.push({
          type: "click",
          target: {
            selector: action.selector,
            text: action.text,
            role: action.role,
          },
        });
        break;
      }
      case "fill": {
        steps.push({
          type: "fill",
          target: {
            selector: action.selector,
            fieldType: action.fieldType,
          },
          value: action.value ?? "",
        });
        break;
      }
      case "select": {
        steps.push({
          type: "select",
          target: {
            selector: action.selector,
          },
          value: action.value ?? "",
        });
        break;
      }
      case "wait": {
        steps.push({
          type: "wait",
          condition: action.waitCondition ?? "stable",
          ms: action.waitMs,
        });
        break;
      }
      default:
        // keypress and other actions are skipped for now
        break;
    }
  }

  return {
    name: `template_${actions.length}_steps`,
    steps,
  };
}

/**
 * Find table or list rows that match the click targets in a template.
 * Currently finds rows (tr) or list items (li) that contain elements
 * matching the first click step's text or selector.
 */
export function findMatchingRows(template: ActionTemplate): ElementInfo[] {
  const firstClick = template.steps.find((s): s is { type: "click"; target: { selector?: string | undefined; text?: string | undefined; role?: string | undefined } } => s.type === "click");
  if (!firstClick) return [];

  const rows: ElementInfo[] = [];

  const rowSelector = firstClick.target.selector
    ? `${firstClick.target.selector}, tr:has(${firstClick.target.selector}), li:has(${firstClick.target.selector})`
    : "tr, li, [role='row']";

  try {
    document.querySelectorAll(rowSelector).forEach((el, idx) => {
      if (idx > 100) return; // limit
      const text = el.textContent?.trim().slice(0, 120) ?? "";
      if (firstClick.target.text && !text.toLowerCase().includes(firstClick.target.text.toLowerCase())) {
        return;
      }
      rows.push({
        ref: `row_${idx}`,
        tag: el.tagName.toLowerCase(),
        visible: true,
        enabled: true,
        actionable: true,
        text,
      });
    });
  } catch {
    // ignore selector errors
  }

  return rows;
}
