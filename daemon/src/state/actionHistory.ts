/**
 * Kimi WebBridge v2.0 — Action History
 *
 * Tracks recent actions per tab for reliability analysis and recovery.
 */

export interface ActionRecord {
  id: string;
  tool: string;
  args: unknown;
  timestamp: number;
  result: "success" | "failure" | "timeout";
  errorCode?: string;
  durationMs: number;
}

export class ActionHistory {
  private readonly history = new Map<number, ActionRecord[]>();
  private static readonly MAX_PER_TAB = 100;

  add(tabId: number, record: ActionRecord): void {
    let records = this.history.get(tabId);
    if (!records) {
      records = [];
      this.history.set(tabId, records);
    }
    records.push(record);
    if (records.length > ActionHistory.MAX_PER_TAB) {
      records.shift();
    }
  }

  getRecent(tabId: number, limit = 10): ActionRecord[] {
    const records = this.history.get(tabId);
    if (!records) {
      return [];
    }
    return records.slice(-limit);
  }

  clear(tabId: number): void {
    this.history.delete(tabId);
  }
}

export const actionHistory = new ActionHistory();
