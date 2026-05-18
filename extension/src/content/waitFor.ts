/**
 * Kimi WebBridge v2.0 — Wait Condition Runtime
 *
 * Polling and MutationObserver-based waiting.
 */

import type { TargetRef } from "../shared/protocol.js";
import type { WaitResult } from "../shared/telemetry.js";
import { resolveTarget, isVisible } from "./actionRuntime.js";

// ---------------------------------------------------------------------------
// Argument type
// ---------------------------------------------------------------------------

export type WaitForArgs = {
  condition:
    | { type: "url_changed"; from?: string }
    | { type: "url_contains"; text: string }
    | { type: "text_visible"; text: string }
    | { type: "selector_visible"; selector: string }
    | { type: "element_gone"; target: TargetRef }
    | { type: "dom_stable"; quietMs?: number }
    | { type: "navigation_idle"; quietMs?: number };
  timeoutMs?: number;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function waitFor(args: WaitForArgs): Promise<WaitResult> {
  const start = performance.now();
  const timeoutMs = args.timeoutMs ?? 10000;
  const condition = args.condition;

  switch (condition.type) {
    case "url_changed": {
      const from = condition.from ?? location.href;
      return poll(() => location.href !== from, timeoutMs, start);
    }
    case "url_contains": {
      return poll(() => location.href.includes(condition.text), timeoutMs, start);
    }
    case "text_visible": {
      return poll(
        () => !!document.body?.textContent?.includes(condition.text),
        timeoutMs,
        start,
      );
    }
    case "selector_visible": {
      return poll(() => {
        const el = document.querySelector(condition.selector);
        return !!(el && isVisible(el));
      }, timeoutMs, start);
    }
    case "element_gone": {
      return poll(() => {
        const el = resolveTarget(condition.target);
        return !el || !el.isConnected;
      }, timeoutMs, start);
    }
    case "dom_stable": {
      return waitDomStable(condition.quietMs ?? 300, timeoutMs, start);
    }
    case "navigation_idle": {
      return waitNavigationIdle(condition.quietMs ?? 300, timeoutMs, start);
    }
    default: {
      (condition as never);
      return {
        conditionMet: false,
        timedOut: true,
        waitedMs: Math.round(performance.now() - start),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function poll(
  check: () => boolean,
  timeoutMs: number,
  start: number,
): Promise<WaitResult> {
  const deadline = start + timeoutMs;

  return new Promise((resolve) => {
    const tick = () => {
      if (check()) {
        resolve({
          conditionMet: true,
          timedOut: false,
          waitedMs: Math.round(performance.now() - start),
        });
        return;
      }
      if (performance.now() >= deadline) {
        resolve({
          conditionMet: false,
          timedOut: true,
          waitedMs: Math.round(performance.now() - start),
        });
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function waitDomStable(
  quietMs: number,
  timeoutMs: number,
  start: number,
): Promise<WaitResult> {
  return new Promise((resolve) => {
    if (!document.body) {
      resolve({
        conditionMet: false,
        timedOut: true,
        waitedMs: Math.round(performance.now() - start),
      });
      return;
    }

    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const observer = new MutationObserver(() => {
      if (resolved) return;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          resolve({
            conditionMet: true,
            timedOut: false,
            waitedMs: Math.round(performance.now() - start),
          });
        }
      }, quietMs);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // Initial quiet timer
    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        resolve({
          conditionMet: true,
          timedOut: false,
          waitedMs: Math.round(performance.now() - start),
        });
      }
    }, quietMs);

    // Hard deadline
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        if (timeoutId !== null) clearTimeout(timeoutId);
        resolve({
          conditionMet: false,
          timedOut: true,
          waitedMs: Math.round(performance.now() - start),
        });
      }
    }, timeoutMs);
  });
}

function waitNavigationIdle(
  quietMs: number,
  timeoutMs: number,
  start: number,
): Promise<WaitResult> {
  const deadline = start + timeoutMs;

  return new Promise((resolve) => {
    let resolved = false;

    const checkReady = () => {
      if (resolved) return;
      if (performance.now() >= deadline) {
        resolved = true;
        resolve({
          conditionMet: false,
          timedOut: true,
          waitedMs: Math.round(performance.now() - start),
        });
        return;
      }
      if (document.readyState === "complete") {
        waitDomStable(quietMs, deadline - performance.now(), start).then((result) => {
          if (!resolved) {
            resolved = true;
            resolve(result);
          }
        });
      } else {
        setTimeout(checkReady, 50);
      }
    };

    checkReady();
  });
}
