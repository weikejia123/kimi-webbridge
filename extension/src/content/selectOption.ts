/**
 * Kimi WebBridge v2.0 — select_option Tool Handler
 *
 * Selects one or more options in a <select> element by value, label, or index.
 */

import type { ActionResult } from "../shared/telemetry.js";

export type SelectOptionArgs = {
  target: { ref?: string; selector?: string };
  values?: string[];
  labels?: string[];
  indices?: number[];
  clear?: boolean;
};

export function selectOption(el: Element, args: SelectOptionArgs): ActionResult {
  if (!(el instanceof HTMLSelectElement)) {
    return { action: "select_option", success: false };
  }

  const select = el;
  const values = args.values ?? [];
  const labels = args.labels ?? [];
  const indices = args.indices ?? [];

  if (values.length === 0 && labels.length === 0 && indices.length === 0) {
    return { action: "select_option", success: false };
  }

  if (args.clear !== false) {
    for (let i = 0; i < select.options.length; i++) {
      select.options[i]!.selected = false;
    }
  }

  let matched = 0;

  for (const value of values) {
    for (let i = 0; i < select.options.length; i++) {
      const opt = select.options[i];
      if (opt && opt.value === value) {
        opt.selected = true;
        matched++;
        break;
      }
    }
  }

  for (const label of labels) {
    for (let i = 0; i < select.options.length; i++) {
      const opt = select.options[i];
      if (opt && opt.text.trim() === label) {
        opt.selected = true;
        matched++;
        break;
      }
    }
  }

  for (const index of indices) {
    const opt = select.options[index];
    if (opt) {
      opt.selected = true;
      matched++;
    }
  }

  select.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  select.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));

  return {
    action: "select_option",
    success: matched > 0,
    matched,
  };
}
