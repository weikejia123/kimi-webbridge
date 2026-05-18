/**
 * Action trace recording.
 */

export interface TraceRecord {
  id: string;
  timestamp: number;
  tool: string;
  args: unknown;
  result: unknown;
  durationMs: number;
  url: string;
  screenshot?: string;
}

const MAX_TRACES = 200;
const SCREENSHOT_MAX_BYTES = 1024 * 1024; // 1 MB per screenshot

export class TraceStore {
  private traces: TraceRecord[] = [];
  private active = false;

  start(): void {
    this.active = true;
    this.traces = [];
  }

  stop(): TraceRecord[] {
    this.active = false;
    const copy = this.traces.slice();
    this.traces = [];
    return copy;
  }

  add(record: TraceRecord): void {
    if (!this.active) return;
    this.traces.push(record);
    if (this.traces.length > MAX_TRACES) {
      this.traces = this.traces.slice(-MAX_TRACES);
    }
  }

  /** Attach a screenshot to an existing trace record (fire-and-forget). */
  addScreenshot(recordId: string, screenshot: string): void {
    if (!this.active) return;
    const record = this.traces.find((r) => r.id === recordId);
    if (record) {
      record.screenshot = screenshot;
    }
  }

  getLast(count = 10): TraceRecord[] {
    return this.traces.slice(-count);
  }

  isActive(): boolean {
    return this.active;
  }
}

/**
 * Capture a screenshot of the currently-visible tab in the target window.
 * Returns a base64 data URL (JPEG, 80% quality) or undefined on failure.
 */
export async function captureTraceScreenshot(
  tabId: number,
): Promise<string | undefined> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const windowId = tab.windowId;
    // captureVisibleTab captures the active tab of the specified window.
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: "jpeg",
      quality: 80,
    });
    if (!dataUrl) return undefined;
    // Enforce max size by truncating the base64 payload if needed.
    const base64 = dataUrl.split(",")[1] ?? "";
    if (base64.length > SCREENSHOT_MAX_BYTES) {
      return dataUrl.slice(0, SCREENSHOT_MAX_BYTES + dataUrl.indexOf(base64));
    }
    return dataUrl;
  } catch {
    return undefined;
  }
}
