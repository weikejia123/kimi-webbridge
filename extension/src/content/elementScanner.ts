/**
 * Kimi WebBridge v2.0 — Element Scanner
 *
 * Scans the page for interactive elements and builds structured ElementInfo.
 */

import type { ElementInfo, ElementListResult } from "../shared/protocol.js";
import { isVisible } from "./actionRuntime.js";
import { elementRegistry } from "./elementRegistry.js";
import { computeBridgeName } from "./nameInference.js";

const INTERACTIVE_SELECTOR =
  'a, button, input, textarea, select, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [contenteditable="true"]';

export function buildSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList)
    .slice(0, 2)
    .join(".");
  if (classes) return `${tag}.${classes}`;
  return tag;
}

function getImplicitRole(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "a":
      return "link";
    case "button":
      return "button";
    case "input": {
      const type = (el as HTMLInputElement).type;
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "submit" || type === "button" || type === "image") return "button";
      return "textbox";
    }
    case "textarea":
      return "textbox";
    case "select":
      return "combobox";
    default:
      return null;
  }
}

export function buildElementInfo(
  el: Element,
  opts: { includeBoundingBoxes?: boolean; maxTextPerElement?: number },
): ElementInfo | null {
  const htmlEl = el instanceof HTMLElement ? el : null;
  const visible = isVisible(el);

  const tag = el.tagName.toLowerCase();
  const roleAttr = el.getAttribute("role");
  const implicitRole = getImplicitRole(el);
  const role = roleAttr ?? implicitRole ?? undefined;

  const targetRef = elementRegistry.register(el);
  const nameResult = computeBridgeName(el);

  const maxText = opts.maxTextPerElement ?? 160;
  const rawText = (el.textContent ?? "").trim();
  const text = rawText.length > maxText ? rawText.slice(0, maxText) + "…" : rawText;

  let valuePreview: string | undefined;
  if (htmlEl && "value" in htmlEl) {
    const val = (htmlEl as HTMLInputElement).value;
    if (val) valuePreview = val.slice(0, 80);
  }

  const enabled = htmlEl
    ? !(htmlEl as HTMLInputElement).disabled && htmlEl.getAttribute("aria-disabled") !== "true"
    : true;

  const rect = el.getBoundingClientRect();
  const actionable = visible && enabled && rect.width > 0 && rect.height > 0;

  const warnings: string[] = [];
  if (!nameResult.name) warnings.push("MISSING_ACCESSIBLE_NAME");
  if (nameResult.confidence < 0.7) warnings.push("LOW_CONFIDENCE_LABEL");
  if (!visible) warnings.push("NOT_VISIBLE");
  if (!enabled) warnings.push("DISABLED");
  if (rect.width <= 0 || rect.height <= 0) warnings.push("ZERO_SIZE");

  const info: ElementInfo = {
    ref: targetRef.ref!,
    tag,
    visible,
    enabled,
    actionable,
  };

  if (role !== undefined) info.role = role;
  if (nameResult.name) info.name = nameResult.name;
  if (nameResult.inferredName) info.inferredName = nameResult.inferredName;
  if (text) info.text = text;
  if (valuePreview !== undefined) info.valuePreview = valuePreview;
  info.selector = targetRef.selector ?? buildSelector(el);
  if (nameResult.confidence > 0) info.confidence = nameResult.confidence;
  if (warnings.length > 0) info.warnings = warnings;

  if (opts.includeBoundingBoxes) {
    info.rect = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    };
  }

  return info;
}

export function scanElements(opts: {
  maxElements?: number;
  includeBoundingBoxes?: boolean;
  cursor?: number;
  maxTextPerElement?: number;
}): {
  elements: ElementInfo[];
  truncated: boolean;
  nextCursor?: number;
} {
  const maxElements = opts.maxElements ?? 300;
  const cursor = opts.cursor ?? 0;

  const allEls = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));
  const elements: ElementInfo[] = [];

  for (let i = cursor; i < allEls.length; i++) {
    const el = allEls[i];
    if (!el) continue;
    const info = buildElementInfo(el, opts);
    if (info) {
      elements.push(info);
      if (elements.length >= maxElements) {
        const result: { elements: ElementInfo[]; truncated: true; nextCursor?: number } = {
          elements,
          truncated: true,
        };
        if (i + 1 < allEls.length) {
          result.nextCursor = i + 1;
        }
        return result;
      }
    }
  }

  return { elements, truncated: false };
}

export function queryElements(args: {
  role?: string;
  text?: string;
  selector?: string;
  visibleOnly?: boolean;
  actionableOnly?: boolean;
  limit?: number;
  placeholder?: string;
  label?: string;
  testId?: string;
  nearText?: string;
  nth?: number;
}): ElementListResult {
  const limit = args.limit ?? 50;
  const candidates = args.selector
    ? Array.from(document.querySelectorAll(args.selector))
    : Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));

  const elements: ElementInfo[] = [];
  let skipped = 0;

  for (const el of candidates) {
    const info = buildElementInfo(el, { maxTextPerElement: 160 });
    if (!info) continue;
    if (args.visibleOnly !== false && !info.visible) continue;
    if (args.actionableOnly && !info.actionable) continue;
    if (args.role && info.role !== args.role) continue;
    if (
      args.text &&
      !info.text?.toLowerCase().includes(args.text.toLowerCase()) &&
      !info.name?.toLowerCase().includes(args.text.toLowerCase()) &&
      !info.inferredName?.toLowerCase().includes(args.text.toLowerCase())
    ) {
      continue;
    }
    if (args.placeholder) {
      const ph = el.getAttribute("placeholder") ?? "";
      if (!ph.toLowerCase().includes(args.placeholder.toLowerCase())) continue;
    }
    if (args.label) {
      const name = (info.name ?? "").toLowerCase();
      const inferred = (info.inferredName ?? "").toLowerCase();
      if (!name.includes(args.label.toLowerCase()) && !inferred.includes(args.label.toLowerCase())) continue;
    }
    if (args.testId) {
      const tid = el.getAttribute("data-testid") ?? "";
      if (!tid.toLowerCase().includes(args.testId.toLowerCase())) continue;
    }
    if (args.nearText) {
      const near = args.nearText.toLowerCase();
      const parentText = (el.parentElement?.textContent ?? "").toLowerCase();
      const prevText = (el.previousElementSibling?.textContent ?? "").toLowerCase();
      if (!parentText.includes(near) && !prevText.includes(near) && !info.text?.toLowerCase().includes(near)) {
        continue;
      }
    }
    if (args.nth !== undefined && args.nth > 0) {
      if (skipped < args.nth) {
        skipped++;
        continue;
      }
    }
    elements.push(info);
    if (elements.length >= limit) {
      return { elements, total: candidates.length, truncated: true };
    }
  }

  return { elements, total: elements.length, truncated: false };
}
