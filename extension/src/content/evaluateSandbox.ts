/**
 * Kimi WebBridge v2.0 — Sandboxed Evaluation (iframe-based)
 *
 * Creates a sandboxed iframe with no same-origin access, injects user code,
 * runs it, and returns the result via postMessage. This provides a clean
 * JavaScript environment isolated from both the page and the extension.
 */

import type { EvaluateResult } from "../shared/protocol.js";
import { createBridgeError } from "../shared/errors.js";
import { safeSerialize } from "./safeSerialize.js";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESULT_BYTES = 262144; // 256 KB

class TimeoutError extends Error {
  constructor(message = "Sandbox evaluation timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

function runWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new TimeoutError()), timeoutMs);
    }),
  ]);
}

/**
 * Evaluate user code inside a sandboxed iframe.
 *
 * The iframe has `sandbox="allow-scripts"` with no `allow-same-origin`,
 * so it cannot access the parent DOM, cookies, or storage.
 * Communication happens strictly via postMessage.
 */
export async function evaluateSandbox(args: {
  code: string;
  userArgs?: unknown;
  mode?: "expression" | "function-body" | "async-function-body";
  timeoutMs?: number;
  returnMode?: "json" | "text" | "preview";
  maxResultBytes?: number;
}): Promise<EvaluateResult> {
  const {
    code,
    userArgs,
    mode = "async-function-body",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    returnMode = "json",
    maxResultBytes = DEFAULT_MAX_RESULT_BYTES,
  } = args;

  if (typeof code !== "string") {
    throw createBridgeError("EVALUATION_ERROR", "Missing or invalid 'code' argument", {
      recoverable: true,
    });
  }

  const body = mode === "expression" ? `return (${code});` : code;

  // Build a self-contained HTML document for the sandbox
  const sandboxHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script>
(function() {
  "use strict";
  window.addEventListener("message", function onMessage(event) {
    if (event.source !== window.parent) return;
    var payload = event.data;
    if (payload && payload.__sandboxRun === true) {
      window.removeEventListener("message", onMessage);
      run(payload.code, payload.args);
    }
  });

  async function run(code, args) {
    try {
      var fn = new Function("__bridgeArgs", code);
      var result = await fn(args);
      window.parent.postMessage({ __sandboxResult: true, ok: true, result: result }, "*");
    } catch (err) {
      window.parent.postMessage({ __sandboxResult: true, ok: false, error: String(err) }, "*");
    }
  }
})();
<\/script>
</head>
<body></body>
</html>`;

  const blob = new Blob([sandboxHtml], { type: "text/html" });
  const blobUrl = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);
  iframe.src = blobUrl;

  try {
    const contentWindow = iframe.contentWindow;
    if (!contentWindow) {
      throw createBridgeError("EVALUATION_ERROR", "Failed to create sandbox iframe", {
        recoverable: true,
      });
    }

    const result = await runWithTimeout(
      () =>
        new Promise<unknown>((resolve, reject) => {
          const onMessage = (event: MessageEvent) => {
            if (event.source !== contentWindow) return;
            const data = event.data as Record<string, unknown>;
            if (data?.__sandboxResult === true) {
              window.removeEventListener("message", onMessage);
              clearTimeout(fallbackTimer);
              if (data.ok) {
                resolve(data.result);
              } else {
                reject(new Error(String(data.error ?? "Sandbox evaluation failed")));
              }
            }
          };
          window.addEventListener("message", onMessage);

          // Safety fallback: reject if iframe never responds
          const fallbackTimer = setTimeout(() => {
            window.removeEventListener("message", onMessage);
            reject(new TimeoutError());
          }, timeoutMs + 500);

          // Wait for iframe to load before posting
          const postRun = () => {
            contentWindow.postMessage(
              {
                __sandboxRun: true,
                code: `"use strict"; return (async () => { ${body} })();`,
                args: userArgs,
              },
              "*",
            );
          };

          if (iframe.contentDocument?.readyState === "complete") {
            postRun();
          } else {
            iframe.addEventListener("load", postRun, { once: true });
          }
        }),
      timeoutMs,
    );

    return formatResult(result, returnMode, maxResultBytes);
  } finally {
    iframe.remove();
    URL.revokeObjectURL(blobUrl);
  }
}

function formatResult(
  rawResult: unknown,
  returnMode: "json" | "text" | "preview",
  maxResultBytes: number,
): EvaluateResult {
  if (returnMode === "text") {
    const text = rawResult == null ? "" : String(rawResult);
    const bytes = new TextEncoder().encode(text).length;
    const truncated = bytes > maxResultBytes;
    const finalText = truncated ? truncateBytes(text, maxResultBytes) : text;
    return {
      type: "text",
      text: finalText,
      preview: previewOf(finalText),
      bytes: new TextEncoder().encode(finalText).length,
      truncated,
      sideEffects: { domMutated: false, navigationStarted: false },
    };
  }

  if (returnMode === "preview") {
    const preview = previewOf(rawResult);
    const bytes = new TextEncoder().encode(preview).length;
    return {
      type: "preview",
      preview,
      bytes,
      truncated: false,
      sideEffects: { domMutated: false, navigationStarted: false },
    };
  }

  const serialized = safeSerialize(rawResult);
  let jsonText: string;
  try {
    jsonText = JSON.stringify(serialized);
  } catch (_err) {
    jsonText = "[Unserializable]";
  }

  const bytes = new TextEncoder().encode(jsonText).length;
  const truncated = bytes > maxResultBytes;

  if (truncated) {
    const truncatedText = truncateBytes(jsonText, maxResultBytes);
    let truncatedValue: unknown;
    try {
      truncatedValue = JSON.parse(truncatedText);
    } catch (_err) {
      truncatedValue = truncatedText;
    }
    return {
      type: "json",
      value: truncatedValue,
      preview: previewOf(truncatedText),
      bytes: new TextEncoder().encode(truncatedText).length,
      truncated: true,
      sideEffects: { domMutated: false, navigationStarted: false },
    };
  }

  return {
    type: "json",
    value: serialized,
    preview: previewOf(jsonText),
    bytes,
    truncated: false,
    sideEffects: { domMutated: false, navigationStarted: false },
  };
}

function previewOf(value: unknown): string {
  let str: string;
  if (typeof value === "string") {
    str = value;
  } else {
    try {
      str = JSON.stringify(value);
    } catch (_err) {
      str = String(value);
    }
  }
  if (str.length > 200) {
    return str.slice(0, 200) + "...";
  }
  return str;
}

function truncateBytes(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) {
    return text;
  }
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const slice = text.slice(0, mid);
    if (encoder.encode(slice).length <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return text.slice(0, low);
}
