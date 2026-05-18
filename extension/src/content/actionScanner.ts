/**
 * Kimi WebBridge v2.0 — Action Scanner
 *
 * Infers possible actions from scanned page elements.
 */

import type { ElementInfo, PossibleAction, TargetRef } from "../shared/protocol.js";

function inferRisk(type: PossibleAction["type"], label: string): PossibleAction["risk"] {
  const lower = label.toLowerCase();
  if (
    type === "submit" ||
    lower.includes("delete") ||
    lower.includes("remove") ||
    lower.includes("confirm")
  ) {
    return "medium";
  }
  if (lower.includes("logout") || lower.includes("sign out") || lower.includes("delete account")) {
    return "high";
  }
  return "low";
}

export function scanActions(elements: ElementInfo[]): PossibleAction[] {
  const actions: PossibleAction[] = [];
  const maxActions = 50;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el?.actionable) continue;

    let type: PossibleAction["type"] | null = null;

    switch (el.role) {
      case "button":
      case "link":
      case "checkbox":
      case "radio":
        type = "click";
        break;
      case "textbox":
      case "searchbox":
        type = "fill";
        break;
      case "combobox":
        type = "select";
        break;
      default:
        if (el.tag === "button" || el.tag === "a") type = "click";
        else if (el.tag === "input" || el.tag === "textarea") type = "fill";
        else if (el.tag === "select") type = "select";
    }

    if (!type) continue;

    const label = el.name || el.inferredName || el.text || "unnamed";
    const lowerLabel = label.toLowerCase();
    const lowerText = (el.text ?? "").toLowerCase();

    if (
      type === "click" &&
      (lowerLabel.includes("send") ||
        lowerText.includes("send") ||
        lowerLabel.includes("submit") ||
        lowerText.includes("submit"))
    ) {
      type = "submit";
    }

    const target: TargetRef = el.ref ? { ref: el.ref } : el.selector ? { selector: el.selector } : {};

    actions.push({
      id: `A${actions.length}`,
      type,
      label: label.slice(0, 100),
      target,
      risk: inferRisk(type, label),
      confidence: el.confidence ?? (el.name ? 1.0 : 0.7),
    });

    if (actions.length >= maxActions) break;
  }

  return actions;
}
