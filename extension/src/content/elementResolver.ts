/**
 * Kimi WebBridge v2.0 — Element Resolver
 *
 * Fallback resolution chain: registry → selector → textHash → rect proximity.
 * Phase 3 adds self-healing text / aria-label / rect heuristics.
 */

import type { TargetRef } from "../shared/protocol.js";
import { elementRegistry } from "./elementRegistry.js";

export interface ResolveResult {
  element: Element | null;
  confidence: number;
}

export function resolveWithFallback(target: TargetRef): Element | null {
  // 1-3. Registry handles ref, selector, and textHash fallbacks
  const el = elementRegistry.resolve(target);
  if (el) return el;

  // 4. Rect proximity
  if (target.rect) {
    const targetCenterX = target.rect.x + target.rect.w / 2;
    const targetCenterY = target.rect.y + target.rect.h / 2;
    let bestEl: Element | null = null;
    let bestDist = Infinity;

    if (document.body) {
      const all = document.querySelectorAll("body *");
      for (let i = 0; i < all.length; i++) {
        const candidate = all[i];
        if (!candidate) continue;
        const r = candidate.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const dist = Math.hypot(cx - targetCenterX, cy - targetCenterY);
        if (dist < bestDist) {
          bestDist = dist;
          bestEl = candidate;
        }
      }
    }

    if (bestEl && bestDist < 200) {
      return bestEl;
    }
  }

  return null;
}

export function resolveWithFallbackSelfHealing(target: TargetRef): ResolveResult {
  const el = resolveWithFallback(target);
  if (el) {
    return { element: el, confidence: 1.0 };
  }

  let bestEl: Element | null = null;
  let bestScore = 0;

  // Text heuristic
  if (target.text) {
    const targetText = target.text.toLowerCase();
    const candidates = document.querySelectorAll("body *");
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (!c) continue;
      const text = c.textContent?.trim().toLowerCase() ?? "";
      if (text.includes(targetText)) {
        const score = text === targetText ? 0.9 : 0.7;
        if (score > bestScore) {
          bestScore = score;
          bestEl = c;
        }
      }
    }
  }

  // Name / aria-label / placeholder heuristic
  if (bestScore < 0.9 && target.name) {
    const targetName = target.name.toLowerCase();
    const candidates = document.querySelectorAll("body *");
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (!c) continue;
      const aria = c.getAttribute("aria-label")?.toLowerCase() ?? "";
      const title = c.getAttribute("title")?.toLowerCase() ?? "";
      const placeholder = c.getAttribute("placeholder")?.toLowerCase() ?? "";
      if (aria.includes(targetName) || title.includes(targetName) || placeholder.includes(targetName)) {
        const exact = aria === targetName || title === targetName || placeholder === targetName;
        const score = exact ? 0.85 : 0.6;
        if (score > bestScore) {
          bestScore = score;
          bestEl = c;
        }
      }
    }
  }

  // Rect proximity fallback with relaxed threshold
  if (bestScore < 0.5 && target.rect) {
    const targetCenterX = target.rect.x + target.rect.w / 2;
    const targetCenterY = target.rect.y + target.rect.h / 2;
    let bestDist = Infinity;

    if (document.body) {
      const all = document.querySelectorAll("body *");
      for (let i = 0; i < all.length; i++) {
        const candidate = all[i];
        if (!candidate) continue;
        const r = candidate.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const dist = Math.hypot(cx - targetCenterX, cy - targetCenterY);
        if (dist < bestDist) {
          bestDist = dist;
          bestEl = candidate;
        }
      }
    }

    if (bestEl && bestDist < 400) {
      bestScore = Math.max(bestScore, Math.max(0, 0.5 - bestDist / 800));
    }
  }

  return { element: bestEl, confidence: bestScore };
}
