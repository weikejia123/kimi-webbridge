/**
 * Kimi WebBridge v2.0 — Audit Log
 *
 * Stores action history in chrome.storage.local with a FIFO ring buffer
 * (max 1000 entries). Arguments are sanitized before storage.
 */

const STORAGE_KEY = "audit_log";
const MAX_ENTRIES = 1000;

const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /pass/i,
  /token/i,
  /api.?key/i,
  /secret/i,
  /auth/i,
  /credit.?card/i,
  /cvv/i,
  /ssn/i,
  /social.?security/i,
  /otp/i,
  /pin/i,
  /2fa/i,
  /mfa/i,
  /authorization/i,
  /bearer/i,
];

const SENSITIVE_VALUE_PATTERNS: Array<{ regex: RegExp; redaction: string }> = [
  { regex: /^\\d{3}-\\d{2}-\\d{4}$/, redaction: "[REDACTED-SSN]" },
  { regex: /^\\d{4}[ -]?\\d{4}[ -]?\\d{4}[ -]?\\d{4}$/, redaction: "[REDACTED-CC]" },
];

export interface AuditEntry {
  id: string;
  timestamp: number;
  tabId: number;
  url: string;
  tool: string;
  args: Record<string, unknown>;
  success: boolean;
  errorCode?: string | undefined;
  durationMs: number;
}

function looksSensitive(key: string, value: unknown): boolean {
  if (SENSITIVE_KEY_PATTERNS.some((p) => p.test(key))) {
    return true;
  }
  if (typeof value === "string") {
    if (SENSITIVE_VALUE_PATTERNS.some((p) => p.regex.test(value))) {
      return true;
    }
  }
  return false;
}

function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (looksSensitive(key, value)) {
      result[key] = "[REDACTED]";
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitizeArgs(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === "object" ? sanitizeArgs(item as Record<string, unknown>) : item
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

function generateId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function logAction(entry: Omit<AuditEntry, "id">): Promise<void> {
  const fullEntry: AuditEntry = {
    ...entry,
    id: generateId(),
    args: sanitizeArgs(entry.args),
  };

  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const log: AuditEntry[] = Array.isArray(stored [STORAGE_KEY])
      ? (stored [STORAGE_KEY] as AuditEntry[])
      : [];

    log.push(fullEntry);
    while (log.length > MAX_ENTRIES) {
      log.shift();
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: log });
  } catch (err) {
    console.error("[Fahd's WebBridge] Failed to write audit log:", err);
  }
}

export async function getAuditLog(filter?: {
  tabId?: number;
  since?: number;
  tool?: string;
}): Promise<AuditEntry[]> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const log: AuditEntry[] = Array.isArray(stored [STORAGE_KEY])
      ? (stored [STORAGE_KEY] as AuditEntry[])
      : [];

    if (!filter) {
      return log.slice();
    }

    return log.filter((entry) => {
      if (filter.tabId !== undefined && entry.tabId !== filter.tabId) {        return false;
      }
      if (filter.since !== undefined && entry.timestamp < filter.since) {
        return false;
      }
      if (filter.tool !== undefined && entry.tool !== filter.tool) {
        return false;
      }
      return true;
    });
  } catch (err) {
    console.error("[Fahd's WebBridge] Failed to read audit log:", err);
    return [];
  }
}

export async function clearAuditLog(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch (err) {
    console.error("[Fahd's WebBridge] Failed to clear audit log:", err);
  }
}
