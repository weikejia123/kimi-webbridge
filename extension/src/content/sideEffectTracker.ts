/**
 * Kimi WebBridge v2.0 — Side Effect Tracker
 *
 * Wraps a function execution and detects DOM mutations and navigation
 * attempts using MutationObserver and location comparison.
 */

export type SideEffects = {
  domMutated?: boolean;
  navigationStarted?: boolean;
};

export type SideEffectResult<T> = {
  result: T;
  effects: SideEffects;
};

/**
 * Execute `fn` while tracking DOM mutations and navigation side effects.
 */
export async function trackSideEffects<T>(
  fn: () => T | Promise<T>,
): Promise<SideEffectResult<T>> {
  const urlBefore = location.href;
  const htmlLengthBefore = document.documentElement?.innerHTML?.length ?? 0;

  let mutationOccurred = false;

  const observer = new MutationObserver((mutations) => {
    if (mutations.length > 0) {
      mutationOccurred = true;
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true,
  });

  let result: T;
  try {
    result = await fn();
  } finally {
    observer.disconnect();
  }

  const urlAfter = location.href;
  const htmlLengthAfter = document.documentElement?.innerHTML?.length ?? 0;

  // Significant HTML length change (>10 chars) counts as DOM mutation
  const htmlChanged = Math.abs(htmlLengthAfter - htmlLengthBefore) > 10;

  const effects: SideEffects = {
    domMutated: mutationOccurred || htmlChanged,
    navigationStarted: urlBefore !== urlAfter,
  };

  return { result, effects };
}
