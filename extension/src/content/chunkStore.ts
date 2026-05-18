/**
 * Kimi WebBridge v2.0 — Chunk Store
 *
 * Simple in-memory session store for cursor-based text pagination.
 */

export class ChunkStore {
  private readonly store = new Map<string, string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly ttlMs: number;

  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  createSession(data: string): string {
    const sessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.store.set(sessionId, data);
    const timer = setTimeout(() => this.deleteSession(sessionId), this.ttlMs);
    this.timers.set(sessionId, timer);
    return sessionId;
  }

  getChunk(
    sessionId: string,
    cursor: number,
    chunkSize: number,
  ): { text: string; nextCursor?: number } {
    const data = this.store.get(sessionId);
    if (!data) {
      return { text: "" };
    }
    const text = data.slice(cursor, cursor + chunkSize);
    const nextOffset = cursor + text.length;
    if (nextOffset < data.length) {
      return { text, nextCursor: nextOffset };
    }
    this.deleteSession(sessionId);
    return { text };
  }

  deleteSession(sessionId: string): void {
    this.store.delete(sessionId);
    const timer = this.timers.get(sessionId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }
  }
}
