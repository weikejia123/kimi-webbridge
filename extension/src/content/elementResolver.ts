/**
 * Kimi WebBridge v2.0 — Element Resolver
 *
 * Fallback resolution chain: registry → selector → textHash → rect proximity.
 */

import type { TargetRef } from "../shared/protocol.js";
import { elementRegistry } from "./elementRegistry.js";

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
