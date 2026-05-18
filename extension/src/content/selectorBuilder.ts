/**
 * Kimi WebBridge v2.0 — Selector Builder
 *
 * Builds short, stable CSS selectors for DOM elements.
 */

function isUnique(sel: string): boolean {
  try {
    return document.querySelectorAll(sel).length === 1;
  } catch {
    return false;
  }
}

function buildPart(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }
  const classes = Array.from(el.classList)
    .slice(0, 2)
    .map((c) => CSS.escape(c));
  if (classes.length > 0) {
    return `${tag}.${classes.join(".")}`;
  }
  const parent = el.parentElement;
  if (parent) {
    const idx = Array.from(parent.children).indexOf(el) + 1;
    return `${tag}:nth-child(${idx})`;
  }
  return tag;
}

export function buildStableSelector(el: Element): string {
  // 1. ID
  if (el.id) {
    const sel = `#${CSS.escape(el.id)}`;
    if (isUnique(sel)) return sel;
  }

  // 2. tag + up to 2 classes
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList)
    .slice(0, 2)
    .map((c) => CSS.escape(c));
  if (classes.length > 0) {
    const sel = `${tag}.${classes.join(".")}`;
    if (isUnique(sel)) return sel;
  }

  // 3. Walk up parent chain
  const parts: string[] = [];
  let current: Element | null = el;
  let depth = 0;
  const maxDepth = 5;

  while (current && depth < maxDepth) {
    parts.unshift(buildPart(current));
    const candidate = parts.join(" > ");
    if (candidate.length >= 200) break;
    if (isUnique(candidate)) return candidate;
    current = current.parentElement;
    depth++;
  }

  // Fallback
  return parts.join(" > ") || tag;
}
