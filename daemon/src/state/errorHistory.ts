/**
 * Kimi WebBridge v2.0 — Error History
 *
 * Tracks recent errors per tab for failure analysis and recovery suggestions.
 */

export interface ErrorRecord {
  code: string;
  message: string;
  timestamp: number;
  tool: string;
  recoverable: boolean;
}

export class ErrorHistory {
  private readonly history = new Map<number, ErrorRecord[]>();
  private static readonly MAX_PER_TAB = 50;

  add(tabId: number, record: ErrorRecord): void {
    let records = this.history.get(tabId);
    if (!records) {
      records = [];
      this.history.set(tabId, records);
    }
    records.push(record);
    if (records.length > ErrorHistory.MAX_PER_TAB) {
      records.shift();
    }
  }

  getRecent(tabId: number, limit = 10): ErrorRecord[] {
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

export const errorHistory = new ErrorHistory();
