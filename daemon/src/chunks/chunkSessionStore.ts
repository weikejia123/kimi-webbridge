/**
 * Kimi WebBridge v2.0 — Chunk Session Store
 *
 * Simple in-memory store for daemon-side chunk sessions.
 * Mirrors the extension chunkStore pattern for consistency.
 */

import { randomUUID } from "crypto";

export class ChunkSessionStore {
  private sessions = new Map<string, string>();

  createSession(data: string): string {
    const sessionId = randomUUID();
    this.sessions.set(sessionId, data);
    return sessionId;
  }

  getChunk(
    sessionId: string,
    cursor: number,
    chunkSize: number,
  ): { text: string; nextCursor?: number | undefined } {
    const data = this.sessions.get(sessionId);
    if (!data) {
      return { text: "" };
    }

    const text = data.slice(cursor, cursor + chunkSize);
    const nextCursor = cursor + chunkSize < data.length ? cursor + chunkSize : undefined;

    return { text, nextCursor };
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
