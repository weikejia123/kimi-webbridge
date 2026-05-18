/**
 * Kimi WebBridge v2.0 — Highlight Overlay
 *
 * Visual element highlighting with optional labels and auto-removal.
 */

const HIGHLIGHT_CLASS = "kimi-wb-highlight";
const LABEL_CLASS = "kimi-wb-highlight-label";

export function highlightElement(
  el: Element,
  opts?: { color?: string; label?: string; durationMs?: number },
): void {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const color = opts?.color ?? "#ff6b6b";
  const durationMs = opts?.durationMs ?? 3000;

  const overlay = document.createElement("div");
  overlay.className = HIGHLIGHT_CLASS;
  overlay.style.position = "absolute";
  overlay.style.left = `${window.scrollX + rect.left}px`;
  overlay.style.top = `${window.scrollY + rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.border = `2px solid ${color}`;
  overlay.style.boxSizing = "border-box";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "999999";
  overlay.style.borderRadius = "2px";

  document.body.appendChild(overlay);

  if (opts?.label) {
    const labelEl = document.createElement("div");
    labelEl.className = LABEL_CLASS;
    labelEl.textContent = opts.label;
    labelEl.style.position = "absolute";
    labelEl.style.left = `${window.scrollX + rect.left}px`;
    labelEl.style.top = `${window.scrollY + rect.top - 20}px`;
    labelEl.style.background = color;
    labelEl.style.color = "#fff";
    labelEl.style.fontSize = "11px";
    labelEl.style.padding = "1px 4px";
    labelEl.style.borderRadius = "2px";
    labelEl.style.pointerEvents = "none";
    labelEl.style.zIndex = "999999";
    labelEl.style.whiteSpace = "nowrap";
    document.body.appendChild(labelEl);

    setTimeout(() => {
      labelEl.remove();
    }, durationMs);
  }

  setTimeout(() => {
    overlay.remove();
  }, durationMs);
}

export function removeHighlights(): void {
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => el.remove());
  document.querySelectorAll(`.${LABEL_CLASS}`).forEach((el) => el.remove());
}
