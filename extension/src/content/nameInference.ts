/**
 * Kimi WebBridge v2.0 — Name Inference
 *
 * Computes accessible names and inferred labels for elements,
 * especially icon-only buttons that lack ARIA annotations.
 */

type NameResult = {
  name: string;
  inferredName: string;
  confidence: number;
  sources: string[];
};

const CLASS_HEURISTICS = [
  "close",
  "search",
  "send",
  "menu",
  "settings",
  "delete",
  "edit",
  "plus",
  "minus",
];

export function computeBridgeName(el: Element): NameResult {
  const sources: string[] = [];

  // 1. aria-label
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    const name = ariaLabel.trim();
    sources.push("aria-label");
    return { name, inferredName: name, confidence: 0.95, sources };
  }

  // 2. aria-labelledby
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) {
      const name = (labelEl.textContent ?? "").trim();
      sources.push("aria-labelledby");
      return { name, inferredName: name, confidence: 0.95, sources };
    }
  }

  // 3. Visible text content
  const text = (el.textContent ?? "").trim();
  if (text) {
    const name = text.slice(0, 80);
    sources.push("visible-text");
    return { name, inferredName: name, confidence: 0.85, sources };
  }

  // 4. title
  const title = el.getAttribute("title");
  if (title) {
    const name = title.trim();
    sources.push("title");
    return { name, inferredName: name, confidence: 0.85, sources };
  }

  // 5. input value
  const htmlEl = el instanceof HTMLElement ? el : null;
  if (htmlEl && "value" in htmlEl && (htmlEl as HTMLInputElement).value) {
    const name = (htmlEl as HTMLInputElement).value.trim();
    sources.push("value");
    return { name, inferredName: name, confidence: 0.85, sources };
  }

  // 6. placeholder
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) {
    const name = placeholder.trim();
    sources.push("placeholder");
    return { name, inferredName: name, confidence: 0.85, sources };
  }

  // 7. img alt (for img elements or img inside button)
  if (el.tagName.toLowerCase() === "img") {
    const alt = (el as HTMLImageElement).alt;
    if (alt) {
      const name = alt.trim();
      sources.push("img-alt");
      return { name, inferredName: name, confidence: 0.8, sources };
    }
  }
  const imgInside = el.querySelector("img");
  if (imgInside) {
    const alt = (imgInside as HTMLImageElement).alt;
    if (alt) {
      const name = alt.trim();
      sources.push("img-alt");
      return { name, inferredName: name, confidence: 0.8, sources };
    }
  }

  // 8. SVG <title>
  const svgTitle = el.querySelector("svg title");
  if (svgTitle) {
    const name = (svgTitle.textContent ?? "").trim();
    sources.push("svg-title");
    return { name, inferredName: name, confidence: 0.8, sources };
  }

  // --- Inference sources (no accessible name) ---

  // 9. data-testid
  const testId = el.getAttribute("data-testid");
  if (testId) {
    const inferredName = testId.trim();
    sources.push("data-testid");
    return { name: "", inferredName, confidence: 0.75, sources };
  }

  // 10. data-action
  const dataAction = el.getAttribute("data-action");
  if (dataAction) {
    const inferredName = dataAction.trim();
    sources.push("data-action");
    return { name: "", inferredName, confidence: 0.75, sources };
  }

  // 11. Class token heuristic
  const classTokens = Array.from(el.classList);
  for (const token of classTokens) {
    const lower = token.toLowerCase();
    if (CLASS_HEURISTICS.includes(lower)) {
      const inferredName = lower;
      sources.push("class-heuristic");
      return { name: "", inferredName, confidence: 0.65, sources };
    }
  }

  // 12. Nearby text
  const prev = el.previousElementSibling;
  if (prev) {
    const prevText = (prev.textContent ?? "").trim();
    if (prevText) {
      const inferredName = prevText.slice(0, 80);
      sources.push("nearby-text");
      return { name: "", inferredName, confidence: 0.55, sources };
    }
  }
  const parent = el.parentElement;
  if (parent) {
    const parentText = (parent.textContent ?? "").trim();
    if (parentText && parentText !== text) {
      const inferredName = parentText.slice(0, 80);
      sources.push("parent-text");
      return { name: "", inferredName, confidence: 0.55, sources };
    }
  }

  // 13. Tooltip text
  const tooltip = el.getAttribute("data-tooltip") ?? el.getAttribute("data-title");
  if (tooltip) {
    const inferredName = tooltip.trim();
    sources.push("tooltip");
    return { name: "", inferredName, confidence: 0.55, sources };
  }

  // 14. Parent menu item text
  const menuItem = el.closest("[role='menuitem']");
  if (menuItem) {
    const menuText = (menuItem.textContent ?? "").trim();
    if (menuText) {
      const inferredName = menuText.slice(0, 80);
      sources.push("parent-menuitem");
      return { name: "", inferredName, confidence: 0.55, sources };
    }
  }

  // 15. Modal context
  const dialog = el.closest("[role='dialog']");
  if (dialog) {
    const dialogLabel = dialog.getAttribute("aria-label") ?? (dialog.textContent ?? "").trim();
    if (dialogLabel) {
      const inferredName = dialogLabel.slice(0, 80);
      sources.push("modal-context");
      return { name: "", inferredName, confidence: 0.5, sources };
    }
  }

  return { name: "", inferredName: "", confidence: 0, sources: [] };
}
