# Kimi WebBridge v2.0 — API Specification

> **Version:** v1.0  
> **Protocol Version:** 2.0  
> **Format:** TypeScript type definitions with JSON examples

---

## Table of Contents

1. [Shared Types](#1-shared-types)
2. [Protocol Envelopes](#2-protocol-envelopes)
3. [Observation APIs](#3-observation-apis)
4. [Action APIs](#4-action-apis)
5. [Evaluation & Debug APIs](#5-evaluation--debug-apis)
6. [System APIs](#6-system-apis)
7. [Error Codes](#7-error-codes)
8. [Migration Wrappers](#8-migration-wrappers)

---

## 1. Shared Types

### TargetRef

```typescript
type TargetRef = {
  ref?: string;           // Stable element reference from registry
  tabId?: number;         // Target tab
  frameId?: number;       // Target frame within tab
  selector?: string;      // CSS selector fallback
  generation?: number;    // Element registry generation (Phase 4+)
  textHash?: string;      // Content hash fallback (Phase 4+)
  rect?: Rect;            // Bounding rect fallback (Phase 4+)
  xpath?: string;         // XPath fallback (Phase 4+)
};

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};
```

### VerifyCondition

```typescript
type VerifyCondition =
  | { type: "none" }
  | { type: "url_changed" }
  | { type: "url_contains"; text: string }
  | { type: "text_visible"; text: string }
  | { type: "selector_visible"; selector: string }
  | { type: "element_gone"; target: TargetRef };
```

### WaitAfterPolicy

```typescript
type WaitAfterPolicy = {
  domStable?: boolean;    // Wait for DOM to stop changing
  quietMs?: number;       // Milliseconds of no mutations (default: 300)
  timeoutMs?: number;     // Max wait time (default: 3000)
};
```

### RetryPolicy

```typescript
type RetryPolicy = {
  attempts?: number;      // Max retry attempts (default: 1)
  onStale?: boolean;      // Retry if element became stale (default: true)
  onCovered?: boolean;    // Retry if element was covered (default: false)
};
```

### ElementInfo

```typescript
type ElementInfo = {
  ref?: string;
  role?: string;
  name?: string;           // Accessible name from page
  inferredName?: string;   // Computed name for icon-only buttons (Phase 4+)
  tag: string;
  text?: string;
  valuePreview?: string;   // Input value preview
  visible: boolean;
  enabled: boolean;
  actionable: boolean;
  rect?: Rect;
  selector?: string;       // Stable CSS selector
  confidence?: number;     // Name inference confidence (Phase 4+)
  warnings?: string[];     // e.g., ["MISSING_ACCESSIBLE_NAME"]
};
```

### PossibleAction

```typescript
type PossibleAction = {
  id: string;
  type: "click" | "fill" | "submit" | "select" | "focus" | "press_key";
  label: string;
  target?: TargetRef;
  risk: "low" | "medium" | "high";
  confidence: number;
  reason?: string;
};
```

### PageStateDiff

```typescript
type PageStateDiff = {
  urlChanged: boolean;
  urlBefore?: string;
  urlAfter?: string;
  newText: string[];
  removedText: string[];
  dialogsOpened: ElementInfo[];
  dialogsClosed: string[];  // dialog IDs
  newElements?: ElementInfo[];
  removedElements?: string[];  // refs
};
```

---

## 2. Protocol Envelopes

### Command Envelope

```typescript
type BridgeCommand<TArgs = unknown> = {
  v: "2.0";
  id: string;            // Unique command ID (e.g., "cmd_001")
  tool: string;          // Tool name
  tabId?: number;
  frameId?: number;
  args: TArgs;
  timeoutMs?: number;    // Per-command timeout override
};
```

Example:
```json
{
  "v": "2.0",
  "id": "cmd_001",
  "tool": "press_key",
  "tabId": 123,
  "frameId": 0,
  "args": {
    "key": "Enter",
    "target": "active"
  },
  "timeoutMs": 10000
}
```

### Response Envelope

```typescript
type BridgeResponse<TResult = unknown> = {
  v: "2.0";
  id: string;
  ok: boolean;
  tool: string;
  result: TResult | null;
  error: BridgeError | null;
  warnings: BridgeWarning[];
  telemetry: BridgeTelemetry;
};
```

### Error Type

```typescript
type BridgeError = {
  code: BridgeErrorCode;
  message: string;
  recoverable: boolean;
  suggestedNextTools?: string[];
  details?: unknown;
};
```

### Warning Type

```typescript
type BridgeWarning = {
  code: string;
  message: string;
  details?: unknown;
};
```

### Telemetry Type

```typescript
type BridgeTelemetry = {
  durationMs: number;
  urlBefore?: string;
  urlAfter?: string;
  domChanged?: boolean;
  timedOut?: boolean;
};
```

### Standard ActionResult

```typescript
type ActionResult = {
  action: string;
  success: boolean;
  strategyUsed?: string;     // e.g., "requestSubmit", "click-submit-button"
  target?: ElementInfo;
  timedOut?: boolean;
  pre?: MiniPageState;
  post?: MiniPageState;
  diff?: PageStateDiff;
};

type ActionResultWithOptionalState = ActionResult & {
  pageState?: PageState;
};
```

---

## 3. Observation APIs

### `get_page_state`

Returns unified page observation in a single call.

```typescript
get_page_state(args?: {
  mode?: "summary" | "interactive" | "full";
  maxElements?: number;              // default: 300
  maxTextPerElement?: number;        // default: 160
  includePossibleActions?: boolean;  // default: true
  includeRecentErrors?: boolean;     // default: true
  includeRecentNetworkFailures?: boolean; // default: true
  includeFrames?: boolean;           // default: true
  includeBoundingBoxes?: boolean;    // default: true
  cursor?: string;                   // For pagination
}): PageState;
```

**PageState Return Type:**

```typescript
type PageState = {
  page: {
    url: string;
    title: string;
    readyState: DocumentReadyState;
    viewport: { width: number; height: number };
    scroll: { x: number; y: number; maxX: number; maxY: number };
    activeElement?: ElementInfo;
  };

  summary: {
    headings: Array<{ level: number; text: string }>;
    forms: number;
    links: number;
    buttons: number;
    inputs: number;
    contentEditables: number;
    dialogs: ElementInfo[];
    alerts: ElementInfo[];
  };

  elements: ElementInfo[];
  possibleActions: PossibleAction[];
  recentErrors: BrowserError[];
  recentNetworkFailures: NetworkFailure[];

  truncated: boolean;
  nextCursor?: string;
  snapshotId: string;
};
```

Example Response:
```json
{
  "ok": true,
  "result": {
    "page": {
      "url": "https://chatgpt.com",
      "title": "ChatGPT",
      "readyState": "complete",
      "viewport": { "width": 1365, "height": 768 },
      "scroll": { "x": 0, "y": 0, "maxX": 0, "maxY": 0 },
      "activeElement": { "ref": "el_3", "role": "combobox", "tag": "DIV", "visible": true, "enabled": true, "actionable": true }
    },
    "summary": {
      "headings": [{ "level": 2, "text": "Chat history" }],
      "forms": 0,
      "links": 12,
      "buttons": 5,
      "inputs": 1,
      "contentEditables": 1,
      "dialogs": [],
      "alerts": []
    },
    "elements": [
      { "ref": "el_3", "role": "combobox", "name": "Message", "tag": "DIV", "visible": true, "enabled": true, "actionable": true, "rect": { "x": 100, "y": 600, "w": 800, "h": 56 } },
      { "ref": "el_7", "role": "button", "name": "", "inferredName": "Send message", "tag": "BUTTON", "visible": true, "enabled": true, "actionable": true, "confidence": 0.82, "warnings": ["MISSING_ACCESSIBLE_NAME"] }
    ],
    "possibleActions": [
      { "id": "A1", "type": "fill", "label": "Message", "target": { "ref": "el_3" }, "risk": "low", "confidence": 0.99 },
      { "id": "A2", "type": "submit", "label": "Send message", "target": { "ref": "el_7" }, "risk": "low", "confidence": 0.82 }
    ],
    "recentErrors": [],
    "recentNetworkFailures": [],
    "truncated": false,
    "snapshotId": "snap_abc123"
  }
}
```

---

### `extract_text`

Extracts page text with chunking support.

```typescript
extract_text(args?: {
  scope?: "document" | "viewport" | TargetRef;
  visibleOnly?: boolean;     // default: true
  includeInputs?: boolean;   // default: true
  includeButtons?: boolean;  // default: true
  includeLinks?: boolean;    // default: true
  format?: "plain" | "markdown" | "blocks";  // default: "markdown"
  chunkSize?: number;        // default: 16000 chars
  cursor?: string;           // For pagination
}): TextExtractionResult;
```

**Return Type:**

```typescript
type TextExtractionResult = {
  format: "plain" | "markdown" | "blocks";
  text?: string;
  blocks?: TextBlock[];
  chars: number;
  truncated: boolean;
  nextCursor?: string;
  stats: {
    totalTextEstimate?: number;
    blocksReturned?: number;
  };
};

type TextBlock = {
  type: "heading" | "paragraph" | "list" | "link" | "button" | "input";
  text: string;
  level?: number;    // For headings
  href?: string;     // For links
  elementRef?: string;
};
```

Example Response:
```json
{
  "ok": true,
  "result": {
    "format": "markdown",
    "text": "# Search results\n\nResult 1...",
    "chars": 16000,
    "truncated": true,
    "nextCursor": "text_abc:chunk_2",
    "stats": {
      "totalTextEstimate": 84200,
      "blocksReturned": 91
    }
  }
}
```

---

### `get_full_text`

Convenience API that drains all chunks internally.

```typescript
get_full_text(args?: {
  scope?: "document" | "viewport" | TargetRef;
  visibleOnly?: boolean;
  format?: "plain" | "markdown";
  maxChars?: number;
}): FullTextResult;
```

**Return Type:**

```typescript
type FullTextResult = {
  text: string;
  truncated: boolean;
  chars: number;
};
```

---

### `query_elements`

Query elements by various criteria.

```typescript
query_elements(args?: {
  role?: string;
  text?: string;
  selector?: string;
  visibleOnly?: boolean;     // default: true
  actionableOnly?: boolean;  // default: false
  limit?: number;            // default: 50
}): ElementListResult;
```

**Return Type:**

```typescript
type ElementListResult = {
  elements: ElementInfo[];
  total: number;
  truncated: boolean;
};
```

---

### `list_actions`

List possible actions on the page.

```typescript
list_actions(args?: {
  scope?: "viewport" | "document" | TargetRef;
  includeLowConfidence?: boolean;  // default: false
  limit?: number;                  // default: 50
}): ActionListResult;
```

**Return Type:**

```typescript
type ActionListResult = {
  actions: PossibleAction[];
  total: number;
};
```

---

### `find_element`

Find elements using multiple strategies.

```typescript
find_element(args: {
  text?: string;
  role?: string;
  placeholder?: string;
  label?: string;
  testId?: string;
  selector?: string;
  nearText?: string;
  nth?: number;              // 0-indexed, default: 0
  visibleOnly?: boolean;     // default: true
  actionableOnly?: boolean;  // default: false
}): ElementListResult;
```

---

### `describe_element`

Get detailed information about a specific element.

```typescript
describe_element(args: {
  target: TargetRef;
  includeHtml?: boolean;        // default: false
  includeNeighbors?: boolean;   // default: false
  includeComputedStyle?: boolean; // default: false
}): ElementDescription;
```

**Return Type:**

```typescript
type ElementDescription = {
  info: ElementInfo;
  html?: string;
  neighbors?: ElementInfo[];
  computedStyle?: Record<string, string>;
  ancestors?: Array<{ tag: string; class?: string; id?: string }>;
  children?: ElementInfo[];
};
```

---

## 4. Action APIs

### `focus`

Focus an element and optionally scroll it into view.

```typescript
focus(args: {
  target: TargetRef;
  scrollIntoView?: boolean;  // default: true
}): ActionResult;
```

---

### `press_key`

Dispatch keyboard events to a target.

```typescript
press_key(args: {
  key: string;                 // "Enter", "Tab", "Escape", "ArrowDown", "a"
  code?: string;               // "Enter", "KeyA", "Tab"
  modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };
  target?: TargetRef | "active";  // default: "active"
  repeat?: number;             // default: 1
  delayMs?: number;            // default: 30
}): ActionResult;
```

Example:
```json
{
  "key": "Enter",
  "target": "active"
}
```

Special handling:
- **Tab:** Manually cycles focus through tabbable elements
- **Enter in input:** Dispatches events, then optionally submits nearest form
- **Escape:** Dispatches to active element and document
- **Ctrl+A in input/textarea:** Uses selectionStart/selectionEnd fallback

---

### `key_combo`

Parse and dispatch a keyboard shortcut.

```typescript
key_combo(args: {
  combo: string;               // "Ctrl+Enter", "Ctrl+A", "Meta+K"
  target?: TargetRef | "active";
}): ActionResult;
```

Example:
```json
{
  "combo": "Ctrl+Enter",
  "target": "active"
}
```

---

### `click_ref`

Click an element by stable reference.

```typescript
click_ref(args: {
  target: TargetRef;
  button?: "left" | "middle" | "right";  // default: "left"
  clickCount?: number;                   // default: 1
  verify?: VerifyCondition;
  waitAfter?: WaitAfterPolicy;
  returnDiff?: boolean;       // default: false
  returnPageState?: boolean;  // default: false
  retry?: RetryPolicy;
}): ActionResultWithOptionalState;
```

Actionability checks (before click):
- Element exists
- Element is connected to DOM
- Element is visible
- Element has non-zero bounding box
- Element is enabled
- Element is not aria-disabled
- Element is not covered by another element
- Element is in viewport or scrollable into viewport
- Element position is stable for 2 animation frames

---

### `fill`

Fill an input or contenteditable field.

```typescript
fill(args: {
  target: TargetRef;
  value: string;
  clear?: boolean;             // default: true
  verify?: "value-matches" | VerifyCondition;
  waitAfter?: WaitAfterPolicy;
  returnDiff?: boolean;        // default: false
  returnPageState?: boolean;   // default: false
}): ActionResultWithOptionalState;
```

Implementation:
- Focus element
- Clear existing content (select all + delete)
- Set value via native setter (works with React/Vue/Angular)
- Dispatch `input` and `change` events
- Verify value matches if requested

Native setter pattern:
```typescript
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
```

---

### `submit_form`

Submit a form or contenteditable composer with multi-strategy fallback.

```typescript
submit_form(args: {
  target?: TargetRef | "active";
  strategy?: 
    | "auto"                    // Try all strategies in order
    | "requestSubmit"
    | "click-submit-button"
    | "enter"
    | "ctrl-enter"
    | "nearby-submit";
  verify?: VerifyCondition;
  waitAfter?: WaitAfterPolicy;
  returnDiff?: boolean;
  returnPageState?: boolean;
}): ActionResultWithOptionalState;
```

Auto strategy order:
1. If target is inside `<form>`, call `form.requestSubmit()`
2. Find visible nearby submit/send button
3. If contenteditable, try nearby submit button
4. Dispatch Enter key
5. Dispatch Ctrl+Enter key
6. Return result with `strategyUsed` and `timedOut`

---

### `select_option`

Select an option from a `<select>` element.

```typescript
select_option(args: {
  target: TargetRef;
  value?: string;
  label?: string;
  index?: number;
  verify?: boolean;
}): ActionResult;
```

---

### `wait_for`

Wait for a condition to be met.

```typescript
wait_for(args: {
  condition:
    | { type: "url_changed"; from?: string }
    | { type: "url_contains"; text: string }
    | { type: "text_visible"; text: string }
    | { type: "selector_visible"; selector: string }
    | { type: "element_gone"; target: TargetRef }
    | { type: "dom_stable"; quietMs?: number }      // default: 300
    | { type: "navigation_idle"; quietMs?: number };
  timeoutMs?: number;  // default: 10000
}): WaitResult;
```

**Return Type:**

```typescript
type WaitResult = {
  conditionMet: boolean;
  timedOut: boolean;
  waitedMs: number;
};
```

---

### `highlight`

Visually highlight elements on the page.

```typescript
highlight(args: {
  targets: TargetRef[];
  labels?: boolean;        // Show labels on highlight
  durationMs?: number;     // default: 3000
}): ActionResult;
```

---

## 5. Evaluation & Debug APIs

### `evaluate_v2`

Safe JavaScript evaluation with fresh scope per call.

```typescript
evaluate_v2(args: {
  code: string;
  args?: unknown;           // Passed as __bridgeArgs
  mode?: "expression" | "function-body" | "async-function-body";
  world?: "isolated" | "main";       // default: "isolated"
  timeoutMs?: number;                // default: 5000
  returnMode?: "json" | "text" | "preview";
  maxResultBytes?: number;           // default: 262144 (256KB)
  allowDomMutation?: boolean;        // default: false
}): EvaluateResult;
```

**Return Type:**

```typescript
type EvaluateResult = {
  type: "json" | "text" | "preview";
  value?: unknown;
  text?: string;
  preview: string;
  bytes: number;
  truncated: boolean;
  sideEffects?: {
    domMutated?: boolean;
    navigationStarted?: boolean;
  };
};
```

Example:
```json
{
  "tool": "evaluate_v2",
  "args": {
    "mode": "async-function-body",
    "code": "const title = document.title; return { title, url: location.href };",
    "returnMode": "json"
  }
}
```

Example Response:
```json
{
  "ok": true,
  "result": {
    "type": "json",
    "value": {
      "title": "Example",
      "url": "https://example.com"
    },
    "preview": "{\"title\":\"Example\",\"url\":\"https://example.com\"}",
    "bytes": 55,
    "truncated": false,
    "sideEffects": {
      "domMutated": false,
      "navigationStarted": false
    }
  }
}
```

---

### `screenshot`

Capture a screenshot of the page or element.

```typescript
screenshot(args?: {
  format?: "png" | "jpeg";   // default: "png"
  quality?: number;          // 0-100, for jpeg
  fullPage?: boolean;        // default: false
  target?: TargetRef;        // Specific element
  clip?: { x: number; y: number; width: number; height: number };
}): ScreenshotResult;
```

**Return Type:**

```typescript
type ScreenshotResult = {
  format: "png" | "jpeg";
  data: string;              // base64 encoded image
  sizeBytes: number;
};
```

---

### `recover`

Get a recovery report after a failed action.

```typescript
recover(args?: {
  includeScreenshot?: boolean;      // default: false
  includeLastErrors?: boolean;      // default: true
  includePageState?: boolean;       // default: true
  includePossibleActions?: boolean; // default: true
}): RecoveryReport;
```

**Return Type:**

```typescript
type RecoveryReport = {
  pageState?: PageState;
  lastErrors: BridgeError[];
  possibleActions: PossibleAction[];
  suggestion: string;
  screenshot?: ScreenshotResult;
};
```

---

## 6. System APIs

### `get_bridge_status`

Get system status and capabilities.

```typescript
get_bridge_status(): BridgeStatus;
```

**Return Type:**

```typescript
type BridgeStatus = {
  daemon: {
    version: string;
    port: number;
    protocol: string;
  };
  extension: {
    connected: boolean;
    version?: string;
    manifestVersion?: number;
  };
  browser: {
    activeTabId?: number;
    url?: string;
    title?: string;
  };
  capabilities: Record<string, boolean>;
};
```

Example Response:
```json
{
  "ok": true,
  "result": {
    "daemon": {
      "version": "1.0.0",
      "port": 10086,
      "protocol": "2.0"
    },
    "extension": {
      "connected": true,
      "version": "1.0.0",
      "manifestVersion": 3
    },
    "browser": {
      "activeTabId": 123,
      "url": "https://example.com",
      "title": "Example"
    },
    "capabilities": {
      "press_key": true,
      "submit_form": true,
      "snapshot_v2": true,
      "evaluate_v2": true,
      "highlight": true,
      "approval": true
    }
  }
}
```

---

### `set_policy`

Set per-domain automation policies.

```typescript
set_policy(args: {
  domain?: string;                      // e.g., "example.com"
  allowEvaluate?: boolean;
  allowFormSubmit?: boolean;
  requireConfirmBeforeSubmit?: boolean;
  requireConfirmBeforeDownload?: boolean;
  redactSensitiveFields?: boolean;
}): PolicyResult;
```

---

### `start_trace`

Start recording an action trace.

```typescript
start_trace(args?: {
  screenshots?: boolean;    // default: false
  pageStates?: boolean;     // default: true
  actionLog?: boolean;      // default: true
}): TraceResult;
```

---

### `stop_trace`

Stop recording and return the trace artifact.

```typescript
stop_trace(): TraceArtifact;
```

**Return Type:**

```typescript
type TraceArtifact = {
  id: string;
  startedAt: string;
  endedAt: string;
  actions: TraceAction[];
  screenshots?: TraceScreenshot[];
};

type TraceAction = {
  timestamp: string;
  tool: string;
  args: unknown;
  result: unknown;
  error?: BridgeError;
  durationMs: number;
};
```

---

### `get_last_trace`

Retrieve the most recent trace.

```typescript
get_last_trace(): TraceArtifact;
```

---

### `pause_automation`

Pause all automation on the current tab.

```typescript
pause_automation(): ActionResult;
```

---

### `resume_automation`

Resume automation on the current tab.

```typescript
resume_automation(): ActionResult;
```

---

### `stop_automation`

Stop all automation and disconnect.

```typescript
stop_automation(): ActionResult;
```

---

### `request_user_approval`

Request user approval for a sensitive action.

```typescript
request_user_approval(args: {
  message: string;
  actionPreview?: string;
  target?: TargetRef;
  timeoutMs?: number;  // default: 30000
}): ApprovalResult;
```

**Return Type:**

```typescript
type ApprovalResult = {
  approved: boolean;
  timedOut: boolean;
};
```

---

## 7. Error Codes

```typescript
type BridgeErrorCode =
  | "ELEMENT_NOT_FOUND"
  | "STALE_ELEMENT"
  | "ELEMENT_NOT_VISIBLE"
  | "ELEMENT_COVERED"
  | "ELEMENT_DISABLED"
  | "NO_FORM_FOUND"
  | "NAVIGATION_TIMEOUT"
  | "DOM_STABLE_TIMEOUT"
  | "EVALUATION_ERROR"
  | "SNAPSHOT_TOO_LARGE"
  | "PERMISSION_DENIED"
  | "USER_INTERVENTION_REQUIRED"
  | "UNKNOWN_ERROR";
```

### Error Details

| Code | Description | Typical Recovery |
|------|-------------|------------------|
| `ELEMENT_NOT_FOUND` | Target element does not exist | Use `find_element()` or `get_page_state()` |
| `STALE_ELEMENT` | Element was removed or changed | Use `find_element()` to re-locate |
| `ELEMENT_NOT_VISIBLE` | Element exists but is hidden | Scroll into view or wait |
| `ELEMENT_COVERED` | Another element blocks interaction | Click the covering element or dismiss it |
| `ELEMENT_DISABLED` | Element is disabled | Wait or find alternative |
| `NO_FORM_FOUND` | No form or submit button detected | Use `press_key("Enter")` |
| `NAVIGATION_TIMEOUT` | Page load exceeded timeout | Retry or check URL |
| `DOM_STABLE_TIMEOUT` | DOM kept mutating | Proceed with caution |
| `EVALUATION_ERROR` | JS syntax or runtime error | Fix code and retry |
| `SNAPSHOT_TOO_LARGE` | Page state exceeds max size | Use chunked APIs |
| `PERMISSION_DENIED` | Action blocked by policy | User must approve |
| `USER_INTERVENTION_REQUIRED` | CAPTCHA, OTP, etc. | Handoff to user |
| `UNKNOWN_ERROR` | Unexpected error | Check logs, retry |

---

## 8. Migration Wrappers

Old tools are preserved as wrappers around new implementations.

### Old → New Mapping

| Old Tool | New Implementation | Status |
|----------|-------------------|--------|
| `snapshot()` | `get_page_state({ mode: "interactive" })` | Deprecated |
| `evaluate()` | `evaluate_v2({ mode: "async-function-body", world: "isolated" })` | Deprecated |
| `click(x, y, selector)` | `find_element()` then `click_ref()` | Deprecated |
| `fill(selector, value)` | `find_element()` then new `fill()` | Deprecated |
| `screenshot()` | Existing implementation, v2 envelope | Maintained |
| `navigate()` | Existing implementation, v2 envelope | Maintained |

### Deprecation Warning Format

```json
{
  "ok": true,
  "result": {},
  "warnings": [
    {
      "code": "DEPRECATED_TOOL",
      "message": "snapshot() is deprecated. Use get_page_state() instead. This wrapper will remain for at least two minor versions."
    }
  ]
}
```

---

*API specification agreed upon by Kimi and ChatGPT.*  
*Date: 2026-05-17*
