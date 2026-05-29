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
  BridgeErrorCode,
  FullTextResult,
  TargetRef,
  ElementDescription,
  ActionListResult,
  WaitAfterPolicy,
  ElementInfo,
} from "../shared/protocol.js";
import type { ActionResult, ActionResultWithOptionalState } from "../shared/telemetry.js";
import { createBridgeError } from "../shared/errors.js";
import { buildTelemetry, resolveTarget, scrollIntoView, elementToLite, performAction } from "./actionRuntime.js";
import {
  captureMiniPageState,
  computePageDiff,
  captureSemanticSnapshot,
  computeSemanticChanges,
  setLastSemanticSnapshot,
  getLastSemanticSnapshot,
  type SemanticChange,
} from "./pageDiff.js";
import { fillElement } from "./fillNative.js";
import { selectOption, type SelectOptionArgs } from "./selectOption.js";
import { scrollToElement, scrollByOffset, type ScrollToArgs } from "./scrollTo.js";
import { hoverElement } from "./hover.js";
import { clickAt } from "./clickAt.js";
import { recover } from "./recover.js";
import { waitForDomStable } from "./domStability.js";
import { dispatchKey, dispatchKeyCombo, type PressKeyArgs, type KeyComboArgs } from "./keyboard.js";
import { submitForm, type SubmitFormArgs } from "./formSubmit.js";
import { waitFor, type WaitForArgs } from "./waitFor.js";
import { evaluateV2, type EvaluateArgs } from "./evaluateV2.js";
import { getPageState } from "./pageState.js";
import { captureFingerprint } from "./domFingerprint.js";
import { classifyFormFields } from "./formClassifier.js";
import { extractText } from "./textExtractor.js";
import { queryElements, buildElementInfo, scanElements } from "./elementScanner.js";
import { scanActions } from "./actionScanner.js";
import { startErrorBuffer } from "./browserErrorBuffer.js";
import { startNetworkFailureBuffer } from "./networkFailureBuffer.js";
import { resolveWithFallback, resolveWithFallbackSelfHealing } from "./elementResolver.js";
import { withRetry, isRetryableError } from "./retryWrapper.js";
import { rollback, type RollbackAction } from "./rollback.js";
import { highlightElement, removeHighlights } from "./highlightOverlay.js";
import { redactSensitiveValues, redactPii } from "./redaction.js";
import { showOverlay, updateOverlay } from "./automationOverlay.js";
import { takeAnnotatedScreenshot } from "./annotatedScreenshot.js";

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

  // Phase 2 — semantic understanding augmentation
  const fingerprint = captureFingerprint();
  const semanticSnapshot = captureSemanticSnapshot();
  const semanticSummary = {
    modals: semanticSnapshot.modals.length,
    dropdowns: semanticSnapshot.dropdowns.length,
    forms: semanticSnapshot.forms.length,
    toasts: semanticSnapshot.toasts.length,
  };

  // Update the stored snapshot so subsequent diffs have a baseline
  setLastSemanticSnapshot(semanticSnapshot);

  const augmentedResult = {
    ...result,
    fingerprint,
    semanticSummary,
  };

  return buildResponse(cmd.id, cmd.tool, true, augmentedResult, null, start);
}

async function handleGetSemanticDiff(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();

  const previous = getLastSemanticSnapshot();
  const current = captureSemanticSnapshot();

  let changes: SemanticChange[] = [];
  if (previous) {
    changes = computeSemanticChanges(previous, current);
  }

  // Always update the stored snapshot to the current state
  setLastSemanticSnapshot(current);

  return buildResponse(
    cmd.id,
    cmd.tool,
    true,
    { changes, hasBaseline: previous !== null },
    null,
    start,
  );
}

async function handleClassifyForm(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;

  let elements: Array<ElementInfo> = [];

  if (Array.isArray(args.elements)) {
    elements = args.elements as ElementInfo[];
  } else {
    // If no elements provided, scan the page for inputs
    const scanResult = scanElements({
      maxElements: 300,
      includeBoundingBoxes: false,
      maxTextPerElement: 160,
    });
    elements = scanResult.elements;
  }

  const fields = classifyFormFields(elements);

  return buildResponse(cmd.id, cmd.tool, true, { fields }, null, start);
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
      console.warn("[Fahd's WebBridge] get_full_text exceeded max iterations");
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

  try {
    const result = await withRetry(
      async () => {
        const resolved = resolveWithFallbackSelfHealing(target);
        if (!resolved.element) {
          const err = new Error("STALE_ELEMENT");
          Object.assign(err, { code: "STALE_ELEMENT" });
          throw err;
        }
        const res = await performAction(
          "click_ref",
          resolved.element,
          () => {
            const htmlEl = resolved.element instanceof HTMLElement ? resolved.element : null;
            if (htmlEl) {
              htmlEl.click();
            } else {
              resolved.element!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
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
        if (!res.success) {
          const code = res.timedOut ? "DOM_STABLE_TIMEOUT" : (res.error ?? "UNKNOWN_ERROR");
          const err = new Error(code);
          Object.assign(err, { code, result: res });
          throw err;
        }
        return res;
      },
      {},
      isRetryableError,
    );

    const finalResult: ActionResultWithOptionalState = result;
    if (args.returnPageState === true) {
      finalResult.pageState = getPageState({});
    }

    return buildResponse(cmd.id, cmd.tool, result.success, finalResult, null, start);
  } catch (err) {
    await rollback([{ type: "close_modal" }]);

    const result = (err as Record<string, unknown>)?.result as ActionResult | undefined;
    const finalResult: ActionResultWithOptionalState = result ?? { action: "click_ref", success: false };
    if (args.returnPageState === true) {
      finalResult.pageState = getPageState({});
    }

    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      finalResult,
      createBridgeError(
        ((err as Record<string, unknown>)?.code as BridgeErrorCode) ?? "UNKNOWN_ERROR",
        err instanceof Error ? err.message : "Action failed after retries",
        {
          recoverable: true,
          suggestedNextTools: ["recover", "get_page_state"],
          details: { preScreenshot: finalResult.preScreenshot },
        },
      ),
      start,
    );
  }
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

async function handleRollback(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;
  const actions = Array.isArray(args.actions) ? (args.actions as RollbackAction[]) : [];

  const success = await rollback(actions);

  const result: ActionResult = {
    action: "rollback",
    success,
  };

  return buildResponse(cmd.id, cmd.tool, success, result, null, start);
}

async function handleScrollTo(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;
  const target = args.target as { ref?: string; selector?: string } | "active" | undefined;

  const scrollArgs: ScrollToArgs = {};
  if (args.behavior === "smooth" || args.behavior === "auto") scrollArgs.behavior = args.behavior;
  if (args.block === "start" || args.block === "center" || args.block === "end" || args.block === "nearest") scrollArgs.block = args.block;
  if (args.inline === "start" || args.inline === "center" || args.inline === "end" || args.inline === "nearest") scrollArgs.inline = args.inline;
  if (typeof args.x === "number") scrollArgs.x = args.x;
  if (typeof args.y === "number") scrollArgs.y = args.y;

  if (target === undefined && scrollArgs.x === undefined && scrollArgs.y === undefined) {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("INVALID_ARGUMENT", "Missing target or x/y offset"),
      start,
    );
  }

  if (target === undefined || target === "active") {
    if (scrollArgs.x !== undefined || scrollArgs.y !== undefined) {
      const result = scrollByOffset(scrollArgs);
      return buildResponse(cmd.id, cmd.tool, result.success, result, null, start);
    }
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("INVALID_ARGUMENT", "Missing target or x/y offset"),
      start,
    );
  }

  const el = resolveWithFallback(target as TargetRef);
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

  const result = scrollToElement(el, scrollArgs);
  return buildResponse(cmd.id, cmd.tool, result.success, result, null, start);
}

async function handleClickAt(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;

  const x = typeof args.x === "number" ? args.x : 0;
  const y = typeof args.y === "number" ? args.y : 0;
  const button =
    args.button === "right" || args.button === "middle"
      ? args.button
      : "left";
  const clickCount = typeof args.clickCount === "number" ? args.clickCount : 1;

  const result = clickAt({ x, y, button, clickCount });
  return buildResponse(cmd.id, cmd.tool, result.success, result, null, start);
}

async function handleHover(cmd: BridgeCommand): Promise<BridgeResponse> {
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

  const result = hoverElement(el);
  return buildResponse(cmd.id, cmd.tool, result.success, result, null, start);
}

async function handleSelectOption(cmd: BridgeCommand): Promise<BridgeResponse> {
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

  const selectArgs: SelectOptionArgs = { target };
  if (Array.isArray(args.values)) selectArgs.values = args.values as string[];
  if (Array.isArray(args.labels)) selectArgs.labels = args.labels as string[];
  if (Array.isArray(args.indices)) selectArgs.indices = args.indices as number[];
  if (typeof args.clear === "boolean") selectArgs.clear = args.clear;

  try {
    const result = await withRetry(
      async () => {
        const resolved = resolveWithFallbackSelfHealing(target);
        if (!resolved.element) {
          const err = new Error("STALE_ELEMENT");
          Object.assign(err, { code: "STALE_ELEMENT" });
          throw err;
        }
        const res = await performAction(
          "select_option",
          resolved.element,
          () => {
            const r = selectOption(resolved.element!, selectArgs);
            if (!r.success) {
              throw new Error(r.matched === 0 ? "NO_OPTIONS_MATCHED" : "SELECT_FAILED");
            }
            return { matched: r.matched };
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
        if (!res.success) {
          const code = res.timedOut ? "DOM_STABLE_TIMEOUT" : (res.error ?? "UNKNOWN_ERROR");
          const err = new Error(code);
          Object.assign(err, { code, result: res });
          throw err;
        }
        return res;
      },
      {},
      isRetryableError,
    );

    const finalResult: ActionResultWithOptionalState = result;
    if (args.returnPageState === true) {
      finalResult.pageState = getPageState({});
    }

    return buildResponse(cmd.id, cmd.tool, result.success, finalResult, null, start);
  } catch (err) {
    await rollback([{ type: "undo_fill", target }]);

    const result = (err as Record<string, unknown>)?.result as ActionResult | undefined;
    const finalResult: ActionResultWithOptionalState = result ?? { action: "select_option", success: false };
    if (args.returnPageState === true) {
      finalResult.pageState = getPageState({});
    }

    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      finalResult,
      createBridgeError(
        ((err as Record<string, unknown>)?.code as BridgeErrorCode) ?? "UNKNOWN_ERROR",
        err instanceof Error ? err.message : "Action failed after retries",
        {
          recoverable: true,
          suggestedNextTools: ["recover", "get_page_state"],
          details: { preScreenshot: finalResult.preScreenshot },
        },
      ),
      start,
    );
  }
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

  try {
    const result = await withRetry(
      async () => {
        const resolved = resolveWithFallbackSelfHealing(target);
        if (!resolved.element) {
          const err = new Error("STALE_ELEMENT");
          Object.assign(err, { code: "STALE_ELEMENT" });
          throw err;
        }
        const res = await performAction(
          "fill",
          resolved.element,
          () => {
            fillElement(resolved.element!, value, clear);
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
        if (!res.success) {
          const code = res.timedOut ? "DOM_STABLE_TIMEOUT" : (res.error ?? "UNKNOWN_ERROR");
          const err = new Error(code);
          Object.assign(err, { code, result: res });
          throw err;
        }
        return res;
      },
      {},
      isRetryableError,
    );

    const finalResult: ActionResultWithOptionalState = result;
    if (args.returnPageState === true) {
      finalResult.pageState = getPageState({});
    }

    return buildResponse(cmd.id, cmd.tool, result.success, finalResult, null, start);
  } catch (err) {
    await rollback([{ type: "undo_fill", target }]);

    const result = (err as Record<string, unknown>)?.result as ActionResult | undefined;
    const finalResult: ActionResultWithOptionalState = result ?? { action: "fill", success: false };
    if (args.returnPageState === true) {
      finalResult.pageState = getPageState({});
    }

    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      finalResult,
      createBridgeError(
        ((err as Record<string, unknown>)?.code as BridgeErrorCode) ?? "UNKNOWN_ERROR",
        err instanceof Error ? err.message : "Action failed after retries",
        {
          recoverable: true,
          suggestedNextTools: ["recover", "get_page_state"],
          details: { preScreenshot: finalResult.preScreenshot },
        },
      ),
      start,
    );
  }
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

async function handleAnnotatedScreenshot(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const args = cmd.args as Record<string, unknown>;

  try {
    const opts: { maxElements?: number; drawLabels?: boolean; tabId?: number } = {};
    if (typeof args.maxElements === "number") opts.maxElements = args.maxElements;
    if (typeof args.drawLabels === "boolean") opts.drawLabels = args.drawLabels;
    if (typeof cmd.tabId === "number") opts.tabId = cmd.tabId;
    const result = await takeAnnotatedScreenshot(opts);
    return buildResponse(cmd.id, cmd.tool, true, result, null, start);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      createBridgeError("SCREENSHOT_ERROR", message, { recoverable: true }),
      start,
    );
  }
}

async function handleStartRecording(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const tabId = typeof cmd.tabId === "number" ? cmd.tabId : undefined;
  const result = await sendToBackground<{ success: boolean; startTime?: number; error?: string }>({
    type: "start_recording",
    tabId,
  });
  if (!result.success) {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      { code: "RECORDING_ERROR", message: result.error ?? "Failed to start recording", recoverable: true },
      start,
    );
  }
  return buildResponse(cmd.id, cmd.tool, true, { recording: true, startTime: result.startTime }, null, start);
}

async function handleStopRecording(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const result = await sendToBackground<{
    success: boolean;
    base64?: string;
    durationMs?: number;
    tabId?: number;
    sizeBytes?: number;
    error?: string;
  }>({
    type: "stop_recording",
  });
  if (!result.success || !result.base64) {
    return buildResponse(
      cmd.id,
      cmd.tool,
      false,
      null,
      { code: "RECORDING_ERROR", message: result.error ?? "Failed to stop recording", recoverable: true },
      start,
    );
  }
  return buildResponse(cmd.id, cmd.tool, true, { base64: result.base64, durationMs: result.durationMs, sizeBytes: result.sizeBytes, tabId: result.tabId, format: "webm" }, null, start);
}

async function handleGetAuditLog(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const result = await sendToBackground<{ success: boolean; entries?: unknown[]; error?: string }>({
    type: "get_audit_log",
  });
  return buildResponse(cmd.id, cmd.tool, result.success, { entries: result.entries }, null, start);
}

async function handleClearAuditLog(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = performance.now();
  const result = await sendToBackground<{ success: boolean; error?: string }>({
    type: "clear_audit_log",
  });
  return buildResponse(cmd.id, cmd.tool, result.success, { cleared: result.success }, null, start);
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
  ["get_semantic_diff", handleGetSemanticDiff],
  ["classify_form", handleClassifyForm],
  ["extract_text", handleExtractText],
  ["get_full_text", handleGetFullText],
  ["query_elements", handleQueryElements],
  ["click_ref", handleClickRef],
  ["highlight", handleHighlight],
  ["find_element", handleFindElement],
  ["describe_element", handleDescribeElement],
  ["list_actions", handleListActions],
  ["scroll_to", handleScrollTo],
  ["click_at", handleClickAt],
  ["hover", handleHover],
  ["select_option", handleSelectOption],
  ["fill", handleFill],
  ["recover", handleRecover],
  ["rollback", handleRollback],
  ["get_bridge_status", handleGetBridgeStatus],
  ["set_policy", handleSetPolicy],
  ["start_trace", handleStartTrace],
  ["stop_trace", handleStopTrace],
  ["get_last_trace", handleGetLastTrace],
  ["capture_screenshot", handleCaptureScreenshot],
  ["annotated_screenshot", handleAnnotatedScreenshot],
  ["start_recording", handleStartRecording],
  ["stop_recording", handleStopRecording],
  ["get_audit_log", handleGetAuditLog],
  ["clear_audit_log", handleClearAuditLog],
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
      error: createBridgeError("UNKNOWN_ERROR", redactPii("Malformed command envelope"), {
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
      if (redacted.error && redacted.error.message) {
        redacted.error = { ...redacted.error, message: redactPii(redacted.error.message) };
      }
      sendResponse(redacted);
    })
    .catch((err: unknown) => {
      const msg = redactPii(err instanceof Error ? err.message : String(err));
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

console.info("[Fahd's WebBridge] Content script loaded.");
