/**
 * Kimi WebBridge v2.0 — Tab Element Cache
 *
 * Caches the latest snapshot element refs per tab for reliable targeting.
 * Used by findElement and clickRef to cache element lookups.
 */

import type { ElementInfo } from "../shared/protocol.js";

export class TabElementCache {
  private readonly cache = new Map<number, ElementInfo[]>();

  set(tabId: number, elements: ElementInfo[]): void {
    this.cache.set(tabId, elements);
  }

  get(tabId: number): ElementInfo[] | undefined {
    return this.cache.get(tabId);
  }

  clear(tabId: number): void {
    this.cache.delete(tabId);
  }
}

export const tabElementCache = new TabElementCache();
