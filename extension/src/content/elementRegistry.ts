/**
 * Kimi WebBridge v2.0 — Element Registry
 *
 * Persistent in-page element references with MutationObserver-based
 * staleness detection and multi-level fallback resolution.
 */

import type { TargetRef } from "../shared/protocol.js";
import { buildStableSelector } from "./selectorBuilder.js";

export class ElementRegistry {
  private elementToRef = new WeakMap<Element, string>();
  private refToElement = new Map<string, WeakRef<Element>>();
  private generation = 0;
  private nextId = 1;
  private observer: MutationObserver;

  constructor() {
    this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));
    if (document.readyState !== "loading") {
      this.startObserving();
    } else {
      document.addEventListener("DOMContentLoaded", () => this.startObserving());
    }
  }

  private startObserving(): void {
    if (!document.body) return;
    this.observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  }

  register(el: Element): TargetRef {
    const existingRef = this.elementToRef.get(el);
    if (existingRef) {
      const weak = this.refToElement.get(existingRef);
      if (weak?.deref() === el) {
        return this.buildTargetRef(el, existingRef);
      }
    }

    const ref = `el_${this.nextId++}`;
    this.elementToRef.set(el, ref);
    this.refToElement.set(ref, new WeakRef(el));
    return this.buildTargetRef(el, ref);
  }

  resolve(target: TargetRef): Element | null {
    if (target.ref) {
      const weak = this.refToElement.get(target.ref);
      const el = weak?.deref();
      if (el && el.isConnected) {
        return el;
      }
    }

    if (target.selector) {
      try {
        const el = document.querySelector(target.selector);
        if (el) return el;
      } catch {
        // ignore invalid selector
      }
    }

    if (target.textHash) {
      const found = this.findByTextHash(target.textHash);
      if (found) return found;
    }

    return null;
  }

  markStale(ref: string): void {
    this.refToElement.delete(ref);
  }

  incrementGeneration(_reason: string): void {
    this.generation++;
    // Drop all weak refs on major mutation; elements will be re-registered lazily
    this.refToElement.clear();
  }

  getGeneration(): number {
    return this.generation;
  }

  private buildTargetRef(el: Element, ref: string): TargetRef {
    const rect = el.getBoundingClientRect();
    return {
      ref,
      generation: this.generation,
      selector: buildStableSelector(el),
      textHash: this.buildTextHash(el),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
    };
  }

  private buildTextHash(el: Element): string {
    const text = (el.textContent ?? "").slice(0, 100);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(36);
  }

  private handleMutations(mutations: MutationRecord[]): void {
    let totalRemoved = 0;
    const staleRefs = new Set<string>();

    for (const m of mutations) {
      if (m.type === "childList") {
        totalRemoved += m.removedNodes.length;
        for (let i = 0; i < m.removedNodes.length; i++) {
          const node = m.removedNodes[i];
          if (node instanceof Element) {
            const ref = this.elementToRef.get(node);
            if (ref) staleRefs.add(ref);
          }
        }
      }
    }

    if (totalRemoved > 10) {
      this.incrementGeneration("large_mutation");
    } else {
      for (const ref of staleRefs) {
        this.markStale(ref);
      }
    }
  }

  private findByTextHash(textHash: string): Element | null {
    if (!document.body) return null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    while (true) {
      const node = walker.nextNode();
      if (!node) break;
      const el = node as Element;
      if (this.buildTextHash(el) === textHash) {
        return el;
      }
    }
    return null;
  }
}

export const elementRegistry = new ElementRegistry();
