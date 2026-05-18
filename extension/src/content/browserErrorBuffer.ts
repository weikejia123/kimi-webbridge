/**
 * Kimi WebBridge v2.0 — Browser Error Buffer
 *
 * Captures recent JavaScript console errors for observation APIs.
 */

import type { BrowserError } from "../shared/protocol.js";

const MAX_ERRORS = 50;
const buffer: BrowserError[] = [];
let started = false;

function pushError(err: BrowserError): void {
  buffer.push(err);
  if (buffer.length > MAX_ERRORS) {
    buffer.shift();
  }
}

type ErrorHandler = (
  message: string | Event,
  source?: string,
  line?: number,
  column?: number,
  error?: Error,
) => boolean | void;

export function startErrorBuffer(): void {
  if (started) return;
  started = true;

  const origOnError = (window as unknown as { onerror: ErrorHandler | null }).onerror;
  (window as unknown as { onerror: ErrorHandler | null }).onerror = (
    message,
    source,
    line,
    column,
    error,
  ) => {
    const err: BrowserError = {
      timestamp: Date.now(),
      message: String(message),
    };
    if (source !== undefined) err.source = source;
    if (line !== undefined) err.line = line;
    if (column !== undefined) err.column = column;
    if (error instanceof Error && error.stack !== undefined) err.stack = error.stack;
    pushError(err);
    if (typeof origOnError === "function") {
      return origOnError.call(window, message, source, line, column, error) as boolean;
    }
    return false;
  };

  window.addEventListener("error", (ev: ErrorEvent) => {
    const err: BrowserError = {
      timestamp: Date.now(),
      message: ev.message,
    };
    if (ev.filename !== undefined) err.source = ev.filename;
    if (ev.lineno !== undefined) err.line = ev.lineno;
    if (ev.colno !== undefined) err.column = ev.colno;
    if (ev.error instanceof Error && ev.error.stack !== undefined) err.stack = ev.error.stack;
    pushError(err);
  });

  const origConsoleError = console.error;
  console.error = (...args: unknown[]): void => {
    pushError({
      timestamp: Date.now(),
      message: args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" "),
    });
    origConsoleError.apply(console, args);
  };
}

export function getRecentErrors(limit = 10): BrowserError[] {
  return buffer.slice(-limit);
}
