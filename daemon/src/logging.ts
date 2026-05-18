/**
 * Kimi WebBridge v2.0 — Structured JSON Logger
 *
 * Worker-1D owns this file. Phase 6 adds redaction of sensitive values.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown> | undefined;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Sensitive keys whose values should be redacted from logs. */
const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "apiKey",
  "secret",
  "auth",
  "creditCard",
  "cvv",
  "ssn",
  "otp",
  "pin",
]);

/** Current minimum log level. Defaults to "info". */
let currentLevel: LogLevel = "info";

/** Set the global minimum log level. */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/** Get the current log level. */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

/**
 * Recursively clone an object, replacing values of sensitive keys with [REDACTED].
 */
export function redactSensitiveData<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return value as T;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitiveData) as unknown as T;
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactSensitiveData(val);
      }
    }
    return result as T;
  }

  return value;
}

function write(entry: LogEntry): void {
  const redactedContext = entry.context ? redactSensitiveData(entry.context) : undefined;
  const line = JSON.stringify({
    ...entry,
    context: redactedContext,
  });
  switch (entry.level) {
    case "debug":
      // eslint-disable-next-line no-console
      console.debug(line);
      break;
    case "info":
      // eslint-disable-next-line no-console
      console.info(line);
      break;
    case "warn":
      // eslint-disable-next-line no-console
      console.warn(line);
      break;
    case "error":
      // eslint-disable-next-line no-console
      console.error(line);
      break;
    default:
      // eslint-disable-next-line no-console
      console.log(line);
  }
}

export function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level)) {
    return;
  }
  write({
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
  });
}

export function debug(message: string, context?: Record<string, unknown>): void {
  log("debug", message, context);
}

export function info(message: string, context?: Record<string, unknown>): void {
  log("info", message, context);
}

export function warn(message: string, context?: Record<string, unknown>): void {
  log("warn", message, context);
}

export function error(message: string, context?: Record<string, unknown>): void {
  log("error", message, context);
}

/** Log a completed command with structured metadata. */
export function logCommand(
  tool: string,
  id: string,
  tabId: number,
  durationMs: number,
  ok: boolean,
): void {
  log("info", "[Command]", { tool, id, tabId, durationMs, status: ok ? "ok" : "error" });
}
