/**
 * Kimi WebBridge v2.0 — Daemon-Side Trace Store
 *
 * Keeps the last N command trace records on the daemon for
 * observability and debugging without relying solely on the extension.
 */

export interface DaemonTraceRecord {
  id: string;
  timestamp: number;
  tool: string;
  tabId: number;
  durationMs: number;
  ok: boolean;
  errorCode?: string | undefined;
}

const MAX_TRACES = 500;

export class DaemonTraceStore {
  private traces: DaemonTraceRecord[] = [];

  /** Add a trace record, evicting oldest if over capacity. */
  add(record: DaemonTraceRecord): void {
    this.traces.push(record);
    if (this.traces.length > MAX_TRACES) {
      this.traces.shift();
    }
  }

  /** Get the last N trace records (most recent first). */
  getLast(count = 50): DaemonTraceRecord[] {
    const safeCount = Math.min(count, this.traces.length);
    return this.traces.slice(-safeCount).reverse();
  }

  /** Clear all stored traces. */
  clear(): void {
    this.traces.length = 0;
  }

  /** Get total number of stored traces. */
  size(): number {
    return this.traces.length;
  }
}

/** Global singleton trace store. */
export const daemonTraceStore = new DaemonTraceStore();
