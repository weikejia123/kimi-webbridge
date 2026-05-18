/**
 * Kimi WebBridge v2.0 — Content Script Entry Point
 *
 * Dispatcher for all content-script commands. Phase 1 handlers are wired
 * to real DOM runtimes; Phase 3 observation handlers are now fully implemented.
 */

import type {
  BridgeCommand,
  BridgeResponse,
  BridgeStatus,
  FullTextResult,
  TargetRef,
  ElementDescription,
  ActionListResult,
  WaitAfterPolicy,
} from "../shared/protocol.js";
import type { ActionResult, ActionResultWithOptionalState } from "../shared/telemetry.js";
import { createBridgeError } from "../shared/errors.js";
import { buildTelemetry, resolveTarget, scrollIntoView, elementToLite, performAction } from "./actionRuntime.js";
import { captureMiniPageState, computePageDiff } from "./pageDiff.js";
import { fillElement } from "./fillNative.js";
import { recover } from "./recover.js";
import { waitForDomStable } from "./domStability.js";
import { dispatchKey, dispatchKeyCombo, type PressKeyArgs, type KeyComboArgs } from "./keyboard.js";
import { submitForm, type SubmitFormArgs } from "./formSubmit.js";
import { waitFor, type WaitForArgs } from "./waitFor.js";
import { evaluateV2, type EvaluateArgs } from "./evaluateV2.js";
import { getPageState } from "./pageState.js";
import { extractText } from "./textExtractor.js";
import { queryElements, buildElementInfo, scanElements } from "./elementScanner.js";
import { scanActions } from "./actionScanner.js";
import { startErrorBuffer } from "./browserErrorBuffer.js";
import { startNetworkFailureBuffer } from "./networkFailureBuffer.js";
import { resolveWithFallback } from "./elementResolver.js";
import { highlightElement, removeHighlights } from "./highlightOverlay.js";
import { redactSensitiveValues } from "./redaction.js";
import { showOverlay, updateOverlay } from "./automationOverlay.js";

// ---------------------------------------------------------------------------
// Initialise observation buffers at module load
// ---------------------------------------------------------------------------

startErrorBuffer();
startNetworkFailureBuffer();

// ---------------------------------------------------------------------------
// Background communication helper
// ---------------------------------------------------------------------------

function sendToBackground<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        reject(new Error(lastErr.message ?? "Unknown runtime error"));
      } else {
        resolve(response as T);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Handler type
// ---------------------------------------------------------------------------

type CommandHandler = (cmd: BridgeCommand) => Promise<BridgeResponse>;

// ---------------------------------------------------------------------------
// Response builder
// ---------------------------------------------------------------------------

function buildResponse<T>(
  id: string,
  tool: string,
  ok: boolean,
  result: T | null,
  error: BridgeResponse["error"],
  start: number,
  urlBefore?: string,
): BridgeResponse<T> {
  const telemetry = buildTelemetry(start);
  if (urlBefore !== undefined) {
    telemetry.urlBefore = urlBefore;
    telemetry.urlAfter = location.href;
  }
  return {
    v: "2.0",
    id,
    ok,
    tool,
    result,
    error,
    warnings: [],
    telemetry,
  };
}

function isTargetRefOrActive(value: unknown): value is TargetRef | "active" {
  return value === "active" || (typeof value === "object" && value !== null);
}

// ---------------------------------------------------------------------------
// Phase 1 — Real handlers
// ---------------------------------------------------------------------------

async function handlePressKey(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;

  if (typeof args.key !== "string") {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("UNKNOWN_ERROR", "Missing 'key' argument"),
      start,
    );
  }

  const pressArgs: PressKeyArgs = { key: args.key };
  if (typeof args.code === "string") pressArgs.code = args.code;
  if (typeof args.repeat === "number") pressArgs.repeat = args.repeat;
  if (typeof args.delayMs === "number") pressArgs.delayMs = args.delayMs;
  if (isTargetRefOrActive(args.target)) pressArgs.target = args.target;
  if (typeof args.modifiers === "object" && args.modifiers !== null) {
    pressArgs.modifiers = args.modifiers as NonNullable<PressKeyArgs["modifiers"]>;
  }

  const result = dispatchKey(pressArgs);
  return buildResponse(cmd.id, cmd.tool, result.success, result, null, start);
}

async function handleKeyCombo(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;

  if (typeof args.combo !== "string") {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("UNKNOWN_ERROR", "Missing 'combo' argument"),
      start,
    );
  }

  const comboArgs: KeyComboArgs = { combo: args.combo };
  if (isTargetRefOrActive(args.target)) comboArgs.target = args.target;

  const result = dispatchKeyCombo(comboArgs);
  return buildResponse(cmd.id, cmd.tool, result.success, result, null, start);
}

async function handleFocus(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;

  if (!isTargetRefOrActive(args.target) || args.target === "active") {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("ELEMENT_NOT_FOUND", "Focus requires a concrete TargetRef"),
      start,
    );
  }

  const el = resolveTarget(args.target);
  if (!el) {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("ELEMENT_NOT_FOUND", "Element not found for focus"),
      start,
    );
  }

  const shouldScroll = args.scrollIntoView !== false;

  if ("focus" in el && typeof (el as HTMLElement).focus === "function") {
    (el as HTMLElement).focus();
  }

  if (shouldScroll) {
    scrollIntoView(el);
  }

  const result: ActionResult = {
    action: "focus",
    success: true,
    target: elementToLite(el),
  };

  return buildResponse(cmd.id, cmd.tool, true, result, null, start);
}

async function handleSubmitForm(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;

  const submitArgs: SubmitFormArgs = {};
  if (isTargetRefOrActive(args.target)) submitArgs.target = args.target;
  if (typeof args.strategy === "string") {
    submitArgs.strategy = args.strategy as NonNullable<SubmitFormArgs["strategy"]>;
  }

  const urlBefore = location.href;
  const pre = captureMiniPageState();
  const result = submitForm(submitArgs);

  let timedOut = false;
  const waitAfter = (args.waitAfter as WaitAfterPolicy | undefined) ?? {
    domStable: true,
    quietMs: 300,
    timeoutMs: 3000,
  };
  if (result.success && waitAfter.domStable !== false) {
    const stableResult = await waitForDomStable({
      quietMs: waitAfter.quietMs ?? 300,
      timeoutMs: waitAfter.timeoutMs ?? 3000,
    });
    timedOut = stableResult.timedOut;
  }

  const post = captureMiniPageState();
  const diff = args.returnDiff === true ? computePageDiff(pre, post) : undefined;

  const finalResult: ActionResultWithOptionalState = {
    ...result,
    timedOut,
    pre,
    post,
  };
  if (diff !== undefined) {
    finalResult.diff = diff;
  }

  if (args.returnPageState === true) {
    finalResult.pageState = getPageState({});
  }

  return buildResponse(cmd.id, cmd.tool, finalResult.success, finalResult, null, start, urlBefore);
}

async function handleWaitFor(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;

  if (typeof args.condition !== "object" || args.condition === null) {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("UNKNOWN_ERROR", "Missing 'condition' argument"),
      start,
    );
  }

  const waitArgs: WaitForArgs = {
    condition: args.condition as WaitForArgs["condition"],
  };
  if (typeof args.timeoutMs === "number") waitArgs.timeoutMs = args.timeoutMs;

  const result = await waitFor(waitArgs);
  return buildResponse(cmd.id, cmd.tool, result.conditionMet, result, null, start);
}

// ---------------------------------------------------------------------------
// Phase 2 — Safe Evaluation
// ---------------------------------------------------------------------------

async function handleEvaluateV2(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;

  const evaluateArgs: EvaluateArgs = {
    code: typeof args.code === "string" ? args.code : "",
  };
  if (args.args !== undefined) evaluateArgs.args = args.args;
  if (typeof args.mode === "string") evaluateArgs.mode = args.mode as NonNullable<EvaluateArgs["mode"]>;
  if (typeof args.world === "string") evaluateArgs.world = args.world as NonNullable<EvaluateArgs["world"]>;
  if (typeof args.timeoutMs === "number") evaluateArgs.timeoutMs = args.timeoutMs;
  if (typeof args.returnMode === "string") evaluateArgs.returnMode = args.returnMode as NonNullable<EvaluateArgs["returnMode"]>;
  if (typeof args.maxResultBytes === "number") evaluateArgs.maxResultBytes = args.maxResultBytes;
  if (typeof args.allowDomMutation === "boolean") evaluateArgs.allowDomMutation = args.allowDomMutation;

  try {
    const result = await evaluateV2(evaluateArgs);
    return buildResponse(cmd.id, cmd.tool, true, result, null, start);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("EVALUATION_ERROR", message, { recoverable: true }),
      start,
    );
  }
}

// ---------------------------------------------------------------------------
// Phase 3 — Unified Observation + Chunked Extraction
// ---------------------------------------------------------------------------

async function handleGetPageState(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;

  const stateArgs: Parameters<typeof getPageState>[0] = {};
  if (typeof args.mode === "string") stateArgs.mode = args.mode as "summary" | "interactive" | "full";
  if (typeof args.maxElements === "number") stateArgs.maxElements = args.maxElements;
  if (typeof args.maxTextPerElement === "number") stateArgs.maxTextPerElement = args.maxTextPerElement;
  if (typeof args.includePossibleActions === "boolean") stateArgs.includePossibleActions = args.includePossibleActions;
  if (typeof args.includeRecentErrors === "boolean") stateArgs.includeRecentErrors = args.includeRecentErrors;
  if (typeof args.includeRecentNetworkFailures === "boolean") stateArgs.includeRecentNetworkFailures = args.includeRecentNetworkFailures;
  if (typeof args.includeFrames === "boolean") stateArgs.includeFrames = args.includeFrames;
  if (typeof args.includeBoundingBoxes === "boolean") stateArgs.includeBoundingBoxes = args.includeBoundingBoxes;
  if (typeof args.cursor === "string") stateArgs.cursor = args.cursor;

  const result = getPageState(stateArgs);
  return buildResponse(cmd.id, cmd.tool, true, result, null, start);
}

async function handleExtractText(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;

  const extractArgs: Parameters<typeof extractText>[0] = {};
  if (typeof args.scope === "string" || typeof args.scope === "object") {
    extractArgs.scope = args.scope as "document" | "viewport" | TargetRef;
  }
  if (typeof args.visibleOnly === "boolean") extractArgs.visibleOnly = args.visibleOnly;
  if (typeof args.includeInputs === "boolean") extractArgs.includeInputs = args.includeInputs;
  if (typeof args.includeButtons === "boolean") extractArgs.includeButtons = args.includeButtons;
  if (typeof args.includeLinks === "boolean") extractArgs.includeLinks = args.includeLinks;
  if (typeof args.format === "string") extractArgs.format = args.format as "plain" | "markdown" | "blocks";
  if (typeof args.chunkSize === "number") extractArgs.chunkSize = args.chunkSize;
  if (typeof args.cursor === "string") extractArgs.cursor = args.cursor;

  const result = extractText(extractArgs);
  return buildResponse(cmd.id, cmd.tool, true, result, null, start);
}

async function handleGetFullText(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;

  const scope = typeof args.scope === "string" ? (args.scope as "document" | "viewport") : "document";
  const visibleOnly = typeof args.visibleOnly === "boolean" ? args.visibleOnly : true;
  const format = typeof args.format === "string" ? (args.format as "plain" | "markdown") : "markdown";
  const maxChars = typeof args.maxChars === "number" ? args.maxChars : 500_000;

  let fullText = "";
  let truncated = false;
  let cursor: string | undefined;
  let iterations = 0;
  const maxIterations = 1000;

  do {
    iterations++;
    if (iterations > maxIterations) {
      console.warn("[Kimi WebBridge] get_full_text exceeded max iterations");
      truncated = true;
      break;
    }
    const extractArgs: Parameters<typeof extractText>[0] = {
      scope,
      visibleOnly,
      format,
      chunkSize: 16000,
    };
    if (cursor !== undefined) extractArgs.cursor = cursor;
    const result = extractText(extractArgs);
    if (result.text) {
      fullText += result.text;
    }
    cursor = result.nextCursor;
    if (fullText.length >= maxChars) {
      fullText = fullText.slice(0, maxChars);
      truncated = true;
      break;
    }
  } while (cursor);

  const result: FullTextResult = {
    text: fullText,
    chars: fullText.length,
    truncated,
  };

  return buildResponse(cmd.id, cmd.tool, true, result, null, start);
}

async function handleQueryElements(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;

  const queryArgs: Parameters<typeof queryElements>[0] = {};
  if (typeof args.role === "string") queryArgs.role = args.role;
  if (typeof args.text === "string") queryArgs.text = args.text;
  if (typeof args.selector === "string") queryArgs.selector = args.selector;
  if (typeof args.visibleOnly === "boolean") queryArgs.visibleOnly = args.visibleOnly;
  if (typeof args.actionableOnly === "boolean") queryArgs.actionableOnly = args.actionableOnly;
  if (typeof args.limit === "number") queryArgs.limit = args.limit;
  const result = queryElements(queryArgs);

  return buildResponse(cmd.id, cmd.tool, true, result, null, start);
}

// ---------------------------------------------------------------------------
// Phase 4 — Element Registry + Reliable Targeting
// ---------------------------------------------------------------------------

async function handleClickRef(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;
  const target = args.target as TargetRef | undefined;

  if (!target || typeof target !== "object") {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("ELEMENT_NOT_FOUND", "Missing target"),
      start,
    );
  }

  const el = resolveWithFallback(target);
  if (!el) {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("STALE_ELEMENT", "Element not found", {
        recoverable: true,
        suggestedNextTools: ["find_element", "get_page_state"],
      }),
      start,
    );
  }

  const result = await performAction(
    "click_ref",
    el,
    () => {
      const htmlEl = el instanceof HTMLElement ? el : null;
      if (htmlEl) {
        htmlEl.click();
      } else {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }
    },
    {
      waitAfter:
        (args.waitAfter as WaitAfterPolicy | undefined) ?? {
          domStable: true,
          quietMs: 300,
          timeoutMs: 3000,
        },
      returnDiff: args.returnDiff === true,
    },
  );

  const finalResult: ActionResultWithOptionalState = result;
  if (args.returnPageState === true) {
    finalResult.pageState = getPageState({});
  }

  return buildResponse(cmd.id, cmd.tool, result.success, finalResult, null, start);
}

async function handleHighlight(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;
  const targets = Array.isArray(args.targets) ? (args.targets as TargetRef[]) : [];
  const labels = args.labels === true;
  const durationMs = typeof args.durationMs === "number" ? args.durationMs : 3000;

  removeHighlights();

  for (const target of targets) {
    const el = resolveWithFallback(target);
    if (!el) continue;
    const opts: { color?: string; label?: string; durationMs?: number } = { durationMs };
    if (labels) {
      opts.label = el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 30);
    }
    highlightElement(el, opts);
  }

  const result: ActionResult = {
    action: "highlight",
    success: true,
  };
  return buildResponse(cmd.id, cmd.tool, true, result, null, start);
}

async function handleFindElement(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;

  const queryArgs: Parameters<typeof queryElements>[0] = {};
  if (typeof args.text === "string") queryArgs.text = args.text;
  if (typeof args.role === "string") queryArgs.role = args.role;
  if (typeof args.selector === "string") queryArgs.selector = args.selector;
  if (typeof args.placeholder === "string") queryArgs.placeholder = args.placeholder;
  if (typeof args.label === "string") queryArgs.label = args.label;
  if (typeof args.testId === "string") queryArgs.testId = args.testId;
  if (typeof args.nearText === "string") queryArgs.nearText = args.nearText;
  if (typeof args.nth === "number") queryArgs.nth = args.nth;
  if (typeof args.visibleOnly === "boolean") queryArgs.visibleOnly = args.visibleOnly;
  if (typeof args.actionableOnly === "boolean") queryArgs.actionableOnly = args.actionableOnly;
  if (typeof args.limit === "number") queryArgs.limit = args.limit;

  let result: ReturnType<typeof queryElements>;
  try {
    result = queryElements(queryArgs);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return buildResponse(
        cmd.id,
        cmd.tool,
        false,
        null,
        createBridgeError("ELEMENT_NOT_FOUND", "Invalid selector syntax"),
        start,
      );
    }
    throw err;
  }
  return buildResponse(cmd.id, cmd.tool, true, result, null, start);
}

async function handleDescribeElement(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;
  const target = args.target as TargetRef | undefined;

  if (!target || typeof target !== "object") {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("ELEMENT_NOT_FOUND", "Missing target"),
      start,
    );
  }

  const el = resolveWithFallback(target);
  if (!el) {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("ELEMENT_NOT_FOUND", "Element not found"),
      start,
    );
  }

  const includeHtml = args.includeHtml === true;
  const includeNeighbors = args.includeNeighbors === true;
  const includeComputedStyle = args.includeComputedStyle === true;

  const info = buildElementInfo(el, { includeBoundingBoxes: true, maxTextPerElement: 160 });
  if (!info) {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("UNKNOWN_ERROR", "Failed to build element info"),
      start,
    );
  }

  const description: ElementDescription = { info };

  if (includeHtml) {
    description.html = el.outerHTML.slice(0, 2000);
  }

  if (includeNeighbors) {
    const neighbors: typeof info[] = [];
    const prev = el.previousElementSibling;
    const next = el.nextElementSibling;
    if (prev) {
      const n = buildElementInfo(prev, { includeBoundingBoxes: false, maxTextPerElement: 80 });
      if (n) neighbors.push(n);
    }
    if (next) {
      const n = buildElementInfo(next, { includeBoundingBoxes: false, maxTextPerElement: 80 });
      if (n) neighbors.push(n);
    }
    description.neighbors = neighbors;
  }

  if (includeComputedStyle) {
    const style = window.getComputedStyle(el);
    const computedStyle: Record<string, string> = {};
    const keys = [
      "display",
      "visibility",
      "opacity",
      "position",
      "width",
      "height",
      "color",
      "background-color",
      "font-size",
      "font-weight",
      "cursor",
      "pointer-events",
    ];
    for (const key of keys) {
      computedStyle[key] = style.getPropertyValue(key);
    }
    description.computedStyle = computedStyle;
  }

  const ancestors: Array<{ tag: string; class?: string; id?: string }> = [];
  let ancestor: Element | null = el.parentElement;
  while (ancestor) {
    const entry: { tag: string; class?: string; id?: string } = {
      tag: ancestor.tagName.toLowerCase(),
    };
    const ancestorClass =
      typeof ancestor.className === "string" ? ancestor.className : undefined;
    if (ancestorClass) entry.class = ancestorClass;
    if (ancestor.id) entry.id = ancestor.id;
    ancestors.push(entry);
    ancestor = ancestor.parentElement;
  }
  description.ancestors = ancestors;

  const children: typeof info[] = [];
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i];
    if (!child) continue;
    const n = buildElementInfo(child, { includeBoundingBoxes: false, maxTextPerElement: 80 });
    if (n) children.push(n);
  }
  description.children = children;

  return buildResponse(cmd.id, cmd.tool, true, description, null, start);
}

async function handleListActions(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;
  const scope = typeof args.scope === "string" ? args.scope : "viewport";
  const includeLowConfidence = args.includeLowConfidence === true;
  const limit = typeof args.limit === "number" ? args.limit : 50;

  const scanResult = scanElements({
    maxElements: 300,
    includeBoundingBoxes: false,
    maxTextPerElement: 160,
  });
  let elements = scanResult.elements;

  if (scope === "viewport") {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    elements = elements.filter((e) => {
      if (!e.rect) return false;
      return e.rect.y < vh && e.rect.y + e.rect.h > 0 && e.rect.x < vw && e.rect.x + e.rect.w > 0;
    });
  }

  const actions = scanActions(elements);
  const filtered = includeLowConfidence ? actions : actions.filter((a) => a.confidence >= 0.7);
  const sliced = filtered.slice(0, limit);

  const result: ActionListResult = {
    actions: sliced,
    total: sliced.length,
  };

  return buildResponse(cmd.id, cmd.tool, true, result, null, start);
}

async function handleRecover(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;
  const afterError = typeof args.afterError === "string" ? args.afterError : undefined;
  const result = afterError !== undefined ? recover({ afterError }) : recover();
  return buildResponse(cmd.id, cmd.tool, true, result, null, start);
}

async function handleFill(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;
  const target = args.target as TargetRef | undefined;

  if (!target || typeof target !== "object") {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("ELEMENT_NOT_FOUND", "Missing target"),
      start,
    );
  }

  const el = resolveWithFallback(target);
  if (!el) {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("STALE_ELEMENT", "Element not found", {
        recoverable: true,
        suggestedNextTools: ["find_element", "get_page_state"],
      }),
      start,
    );
  }

  if (typeof args.value !== "string") {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("INVALID_ARGUMENT", "value must be a string"),
      start,
    );
  }
  const value = args.value;
  const clear = args.clear !== false;

  const result = await performAction(
    "fill",
    el,
    () => {
      fillElement(el, value, clear);
    },
    {
      waitAfter:
        (args.waitAfter as WaitAfterPolicy | undefined) ?? {
          domStable: true,
          quietMs: 300,
          timeoutMs: 3000,
        },
      returnDiff: args.returnDiff === true,
    },
  );

  const finalResult: ActionResultWithOptionalState = result;
  if (args.returnPageState === true) {
    finalResult.pageState = getPageState({});
  }

  return buildResponse(cmd.id, cmd.tool, result.success, finalResult, null, start);
}

// ---------------------------------------------------------------------------
// Phase 6 — System handlers
// ---------------------------------------------------------------------------

async function handleGetBridgeStatus(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const status = await sendToBackground<BridgeStatus>({ type: "get_bridge_status" });
  return buildResponse(cmd.id, cmd.tool, true, status, null, start);
}

async function handleSetPolicy(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;
  await sendToBackground({ type: "set_policy", args });
  return buildResponse(cmd.id, cmd.tool, true, { success: true }, null, start);
}

async function handleStartTrace(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  await sendToBackground({ type: "start_trace" });
  return buildResponse(cmd.id, cmd.tool, true, { success: true }, null, start);
}

async function handleStopTrace(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const result = await sendToBackground<{ traces: unknown }>({ type: "stop_trace" });
  return buildResponse(cmd.id, cmd.tool, true, result, null, start);
}

async function handleGetLastTrace(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;
  const count = typeof args.count === "number" ? args.count : undefined;
  const traces = await sendToBackground<unknown>({ type: "get_last_trace", count });
  return buildResponse(cmd.id, cmd.tool, true, traces, null, start);
}

async function handleCaptureScreenshot(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const tabId = typeof cmd.tabId === "number" ? cmd.tabId : undefined;
  const result = await sendToBackground<{ success: boolean; screenshot?: string; error?: string }>({
    type: "capture_screenshot",
    tabId,
  });
  if (!result.success || !result.screenshot) {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      { code: "SCREENSHOT_ERROR", message: result.error ?? "Screenshot capture failed", recoverable: true },
      start,
    );
  }
  return buildResponse(cmd.id, cmd.tool, true, { screenshot: result.screenshot, format: "jpeg" }, null, start);
}

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------

const handlers = new Map<string, CommandHandler>([
  ["press_key", handlePressKey],
  ["key_combo", handleKeyCombo],
  ["focus", handleFocus],
  ["submit_form", handleSubmitForm],
  ["wait_for", handleWaitFor],
  ["evaluate_v2", handleEvaluateV2],
  ["get_page_state", handleGetPageState],
  ["extract_text", handleExtractText],
  ["get_full_text", handleGetFullText],
  ["query_elements", handleQueryElements],
  ["click_ref", handleClickRef],
  ["highlight", handleHighlight],
  ["find_element", handleFindElement],
  ["describe_element", handleDescribeElement],
  ["list_actions", handleListActions],
  ["fill", handleFill],
  ["recover", handleRecover],
  ["get_bridge_status", handleGetBridgeStatus],
  ["set_policy", handleSetPolicy],
  ["start_trace", handleStartTrace],
  ["stop_trace", handleStopTrace],
  ["get_last_trace", handleGetLastTrace],
  ["capture_screenshot", handleCaptureScreenshot],
]);

// ---------------------------------------------------------------------------
// Command dispatcher
// ---------------------------------------------------------------------------

async function dispatchCommand(cmd: BridgeCommand): Promise<BridgeResponse> {
  showOverlay({ status: "active", currentTool: cmd.tool });
  try {
    const handler = handlers.get(cmd.tool);
    if (!handler) {
      const start = performance.now();
      return buildResponse(
        cmd.id,
        cmd.tool,
        false,
        null,
        createBridgeError("UNKNOWN_ERROR", `Unknown tool: ${cmd.tool}`, {
          recoverable: true,
        }),
        start,
      );
    }
    return await handler(cmd);
  } finally {
    updateOverlay({ status: "idle" });
  }
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const cmd = message as BridgeCommand;
  if (cmd.v !== "2.0" || typeof cmd.tool !== "string") {
    sendResponse({
      v: "2.0",
      id: typeof cmd.id === "string" ? cmd.id : "unknown",
      ok: false,
      tool: typeof cmd.tool === "string" ? cmd.tool : "unknown",
      result: null,
      error: createBridgeError("UNKNOWN_ERROR", "Malformed command envelope", {
        recoverable: true,
      }),
      warnings: [],
      telemetry: { durationMs: 0 },
    } as BridgeResponse);
    return false;
  }

  dispatchCommand(cmd)
    .then((response) => {
      const redacted = redactSensitiveValues(response) as BridgeResponse;
      sendResponse(redacted);
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      sendResponse({
        v: "2.0",
        id: cmd.id,
        ok: false,
        tool: cmd.tool,
        result: null,
        error: createBridgeError("UNKNOWN_ERROR", msg, { recoverable: true }),
        warnings: [],
        telemetry: { durationMs: 0 },
      } as BridgeResponse);
    });

  return true; // async response
});

console.info("[Kimi WebBridge] Content script loaded.");
