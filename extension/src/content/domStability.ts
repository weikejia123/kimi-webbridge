/**
 * Kimi WebBridge v2.0 — DOM Stability Watcher
 *
 * Resolves when the DOM has not mutated for a configurable quiet period.
 */

export function waitForDomStable(opts: {
  quietMs?: number;
  timeoutMs?: number;
}): Promise<{ stable: boolean; timedOut: boolean; waitedMs: number }> {
  const quietMs = opts.quietMs ?? 300;
  const timeoutMs = opts.timeoutMs ?? 3000;
  const start = performance.now();

  return new Promise((resolve) => {
    if (!document.documentElement) {
      resolve({
        stable: false,
        timedOut: true,
        waitedMs: Math.round(performance.now() - start),
      });
      return;
    }

    let resolved = false;
    let quietTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const observer = new MutationObserver(() => {
      if (resolved) return;
      if (quietTimeoutId !== null) {
        clearTimeout(quietTimeoutId);
      }
      quietTimeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          resolve({
            stable: true,
            timedOut: false,
            waitedMs: Math.round(performance.now() - start),
          });
        }
      }, quietMs);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    // Initial quiet timer
    quietTimeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        resolve({
          stable: true,
          timedOut: false,
          waitedMs: Math.round(performance.now() - start),
        });
      }
    }, quietMs);

    // Overall timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        if (quietTimeoutId !== null) {
          clearTimeout(quietTimeoutId);
        }
        resolve({
          stable: false,
          timedOut: true,
          waitedMs: Math.round(performance.now() - start),
        });
      }
    }, timeoutMs);
  });
}
