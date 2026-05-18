# Kimi WebBridge v2.0 — Detailed Implementation Plan

> **Version:** v1.0-final-plan  
> **Architecture Constraint:** Chrome Extension approach ONLY (no CDP/WebDriver migration)  
> **Primary Goal:** Make browser control easier, more reliable, and more refined without a rewrite  
> **Status:** AGREED by Kimi and ChatGPT

---

## Table of Contents

1. [Agreed Architecture](#1-agreed-architecture)
2. [Shared Protocol Foundation](#2-shared-protocol-foundation)
3. [Phase 1 — Missing Browser Primitives](#3-phase-1--missing-browser-primitives)
4. [Phase 2 — Safe Evaluation API](#4-phase-2--safe-evaluation-api)
5. [Phase 3 — Unified Observation + Chunked Extraction](#5-phase-3--unified-observation--chunked-extraction)
6. [Phase 4 — Element Registry + Reliable Targeting](#6-phase-4--element-registry--reliable-targeting)
7. [Phase 5 — Observe-and-Act Reliability Layer](#7-phase-5--observe-and-act-reliability-layer)
8. [Phase 6 — Daemon Hardening, Status, UX Polish](#8-phase-6--daemon-hardening-status-ux-polish)
9. [Migration Strategy for Old API](#9-migration-strategy-for-old-api)
10. [Final New Tool Surface](#10-final-new-tool-surface)
11. [Final Acceptance Checklist](#11-final-acceptance-checklist)

---

## 1. Agreed Architecture

### Design Principle

Move from this:

```
agent guesses selectors / coordinates → clicks → hopes it worked
```

To this:

```
get_page_state → choose stable element ref/action → act → auto-wait → return post-state diff
```

### Architecture Diagram

```
AI Agent
  ↓ WebSocket JSON-RPC
Local Daemon on 127.0.0.1:10086
  ↓ Extension Bridge Protocol
Chrome Extension Service Worker / Bridge Layer
  ↓ tabs.sendMessage / runtime Port
Per-Tab Content-Script Action Runtime
  ↓ DOM / Events / MutationObserver / Screenshot / Extraction
User's Real Browser Page
```

### Layer Responsibilities

| Layer | Responsibility |
|-------|---------------|
| **AI Agent** | Sends high-level tool calls, receives structured page state and action results |
| **Local Daemon** | WebSocket server, schema validation, tool registry, backward compatibility, request routing |
| **Extension Service Worker** | Receives daemon commands, routes to correct tab/frame, returns structured responses |
| **Content-Script Action Runtime** | DOM interaction, element registry, text extraction, actionability checks, keyboard/form handling |
| **Page** | The actual user browser session |

### Main Implementation Idea

> **Do not make the daemon smarter by itself.**
> **Make the content script expose a stronger browser-control runtime.**

That runtime should own:
- Element references
- Key events
- Form submission
- Safe evaluation
- Chunked snapshots
- Full text extraction
- Targeting heuristics
- Action verification

---

## 2. Shared Protocol Foundation

### Standard Command Envelope

All new tools use this envelope:

```typescript
type BridgeCommand<TArgs = unknown> = {
  v: "2.0";
  id: string;
  tool: string;
  tabId?: number;
  frameId?: number;
  args: TArgs;
  timeoutMs?: number;
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

### Standard Response Envelope

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

type BridgeError = {
  code: BridgeErrorCode;
  message: string;
  recoverable: boolean;
  suggestedNextTools?: string[];
  details?: unknown;
};

type BridgeWarning = {
  code: string;
  message: string;
  details?: unknown;
};

type BridgeTelemetry = {
  durationMs: number;
  urlBefore?: string;
  urlAfter?: string;
  domChanged?: boolean;
  timedOut?: boolean;
};
```

### Standard Error Format

```json
{
  "v": "2.0",
  "id": "cmd_001",
  "ok": false,
  "tool": "submit_form",
  "result": null,
  "error": {
    "code": "NO_FORM_FOUND",
    "message": "No parent form or submit button found for active element.",
    "recoverable": true,
    "suggestedNextTools": ["press_key", "snapshot_v2", "list_actions"]
  }
}
```

### Phase 1 Simplified TargetRef

For Phase 1 and Phase 2:

```typescript
type TargetRef = {
  ref?: string;
  tabId?: number;
  selector?: string;
};
```

### Full TargetRef (from Phase 4 onward)

```typescript
type TargetRef = {
  ref: string;
  tabId?: number;
  frameId?: number;
  selector?: string;
  generation?: number;
  textHash?: string;
  rect?: Rect;
  xpath?: string;
};

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};
```

---

## 3. Phase 1 — Missing Browser Primitives

### Goal

Fix the most painful missing controls first:
- `press_key`
- `key_combo`
- `focus`
- `submit_form`
- `wait_for`

This phase should not require the full element registry yet.

### New APIs

#### `press_key`

```typescript
press_key(args: {
  key: string;
  code?: string;
  modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };
  target?: TargetRef | "active";
  repeat?: number;
  delayMs?: number;
}): ActionResult;
```

Example:
```json
{ "key": "Enter", "target": "active" }
```

Special handling:
- **Tab:** Move focus manually through tabbable elements
- **Enter in input:** Dispatch key events, then optionally submit nearest form
- **Escape:** Dispatch to active element and document
- **Ctrl+A in input/textarea:** Use selectionStart/selectionEnd fallback

#### `key_combo`

```typescript
key_combo(args: {
  combo: string;
  target?: TargetRef | "active";
}): ActionResult;
```

Example:
```json
{ "combo": "Ctrl+Enter", "target": "active" }
```

#### `focus`

```typescript
focus(args: {
  target: TargetRef;
  scrollIntoView?: boolean;
}): ActionResult;
```

#### `submit_form`

```typescript
submit_form(args: {
  target?: TargetRef | "active";
  strategy?: 
    | "auto"
    | "requestSubmit"
    | "click-submit-button"
    | "enter"
    | "ctrl-enter"
    | "nearby-submit";
  verify?: VerifyCondition;
  returnPageState?: boolean;
}): ActionResultWithOptionalState;
```

**Smart `submit_form(strategy: "auto")` behavior:**

1. If target or active element is inside a real `<form>`, call `form.requestSubmit()`
2. Else find visible nearby submit/send button
3. If active element is contenteditable, try nearby submit button
4. Else dispatch Enter
5. Else dispatch Ctrl+Enter
6. Return `timedOut` and `strategyUsed`

**Special handling for ChatGPT / ProseMirror-style inputs:**

```typescript
function isContentEditableInput(el: Element | null): boolean {
  return !!el && (
    el instanceof HTMLElement &&
    (
      el.isContentEditable ||
      el.getAttribute("contenteditable") === "true" ||
      el.closest("[contenteditable='true']")
    )
  );
}
```

Nearby submit detection should look for:
- `button[type=submit]`
- `button[aria-label*=send]`
- `button[aria-label*=submit]`
- `button[data-testid*=send]`
- `button[data-testid*=submit]`
- Button with SVG/icon and enabled state near active editor
- `role=button` near active editor

#### `wait_for`

```typescript
wait_for(args: {
  condition:
    | { type: "url_changed"; from?: string }
    | { type: "url_contains"; text: string }
    | { type: "text_visible"; text: string }
    | { type: "selector_visible"; selector: string }
    | { type: "element_gone"; target: TargetRef }
    | { type: "dom_stable"; quietMs?: number }
    | { type: "navigation_idle"; quietMs?: number };
  timeoutMs?: number;
}): WaitResult;
```

### Common Return Types

```typescript
type ActionResult = {
  action: string;
  success: boolean;
  strategyUsed?: string;
  target?: ElementInfoLite;
  timedOut?: boolean;
  pre?: MiniPageState;
  post?: MiniPageState;
  diff?: PageStateDiff;
};

type ActionResultWithOptionalState = ActionResult & {
  pageState?: PageState;
};

type WaitResult = {
  conditionMet: boolean;
  timedOut: boolean;
  waitedMs: number;
};

type VerifyCondition =
  | { type: "none" }
  | { type: "url_changed" }
  | { type: "url_contains"; text: string }
  | { type: "text_visible"; text: string }
  | { type: "selector_visible"; selector: string }
  | { type: "element_gone"; target: TargetRef };
```

### Extension Files to Create/Modify

**Create:**
- `extension/src/content/actionRuntime.ts`
- `extension/src/content/keyboard.ts`
- `extension/src/content/formSubmit.ts`
- `extension/src/content/waitFor.ts`
- `extension/src/shared/protocol.ts`
- `extension/src/shared/errors.ts`

**Modify:**
- `extension/src/background/serviceWorker.ts`
- `extension/src/content/index.ts`
- `extension/manifest.json`

### Daemon Files to Create/Modify

**Create:**
- `daemon/src/tools/pressKey.ts`
- `daemon/src/tools/keyCombo.ts`
- `daemon/src/tools/focus.ts`
- `daemon/src/tools/submitForm.ts`
- `daemon/src/tools/waitFor.ts`
- `daemon/src/protocol/v2.ts`
- `daemon/src/protocol/errors.ts`

**Modify:**
- `daemon/src/server/websocketServer.ts`
- `daemon/src/tools/registry.ts`
- `daemon/src/extension/router.ts`
- `daemon/src/logging.ts`

### Success Criteria

Phase 1 is done when:
- [ ] `press_key("Enter")` works on focused inputs and contenteditable areas
- [ ] `key_combo("Ctrl+Enter")` works on focused contenteditable areas
- [ ] `submit_form()` works on normal forms
- [ ] `submit_form()` works on ChatGPT-like contenteditable composer
- [ ] `focus()` scrolls and focuses target reliably
- [ ] `wait_for({ type: "dom_stable" })` works
- [ ] All new tools return standard v2 responses
- [ ] Old tools still work

---

## 4. Phase 2 — Safe Evaluation API

### Goal

Fix shared JS scope problems like:
```
SyntaxError: Identifier has already been declared
```

Every evaluation should run inside a fresh function scope.

### New API

#### `evaluate_v2`

```typescript
evaluate_v2(args: {
  code: string;
  args?: unknown;
  mode?: "expression" | "function-body" | "async-function-body";
  world?: "isolated" | "main";
  timeoutMs?: number;
  returnMode?: "json" | "text" | "preview";
  maxResultBytes?: number;
  allowDomMutation?: boolean;
}): EvaluateResult;
```

Defaults:
```typescript
{
  mode: "async-function-body",
  world: "isolated",
  timeoutMs: 5000,
  returnMode: "json",
  maxResultBytes: 262144,
  allowDomMutation: false
}
```

Return type:
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

Example call:
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

### Implementation Rule

**Never run user code directly at top-level.**

Use fresh wrapper:
```typescript
async function evaluateV2({ code, args, mode }: EvaluateArgs) {
  const body =
    mode === "expression"
      ? `return (${code});`
      : code;

  const fn = new Function(
    "__bridgeArgs",
    `
      "use strict";
      return (async () => {
        ${body}
      })();
    `
  );

  return await runWithTimeout(() => fn(args), timeoutMs);
}
```

Important rules:
- Never inject repeated raw code at top level
- Never persist user variables across calls unless explicitly requested
- Always wrap in fresh function scope
- Always serialize results with a safe serializer
- Always cap result size

### Safe Serializer

Create: `extension/src/content/safeSerialize.ts`

Rules:
- Max depth: 6
- Max array items: 500
- Max object keys: 500
- Max string length: configurable
- Circular references: replace with `"[Circular]"`
- DOM nodes: return preview object, not raw node
- Functions: return `"[Function name]"`
- Symbols: stringify safely

For `world: "main"`:
- Implement later in this phase, not first
- Use an injected script tag or `chrome.scripting` with MAIN world
- Communicate back via CustomEvent/window.postMessage
- Delete the script element immediately after execution
- Keep it disabled by default

### Extension Files to Create/Modify

**Create:**
- `extension/src/content/evaluateV2.ts`
- `extension/src/content/safeSerialize.ts`
- `extension/src/content/sideEffectTracker.ts`

**Modify:**
- `extension/src/content/actionRuntime.ts`
- `extension/src/background/serviceWorker.ts`
- `extension/src/shared/protocol.ts`

### Daemon Files to Create/Modify

**Create:**
- `daemon/src/tools/evaluateV2.ts`
- `daemon/src/protocol/serializers.ts`

**Modify:**
- `daemon/src/tools/evaluate.ts`
- `daemon/src/tools/registry.ts`
- `daemon/src/logging.ts`

### Success Criteria

Phase 2 is done when:
- [ ] Repeated `evaluate_v2("const x = 1; return x;")` never throws redeclaration errors
- [ ] Old `evaluate()` works as wrapper around `evaluate_v2()`
- [ ] Evaluation timeout works
- [ ] Large results are truncated safely
- [ ] Circular objects do not crash serialization
- [ ] DOM nodes return useful previews
- [ ] Structured syntax/runtime errors are returned

---

## 5. Phase 3 — Unified Observation + Chunked Extraction

### Goal

Reduce round-trips and fix large-page truncation.

The key new tool is **`get_page_state()`**. This replaces the usual sequence:
```
snapshot_v2() → list_actions() → get_errors() → get_network_failures()
```
with **one call**.

### New APIs

#### `get_page_state`

```typescript
get_page_state(args?: {
  mode?: "summary" | "interactive" | "full";
  maxElements?: number;
  maxTextPerElement?: number;
  includePossibleActions?: boolean;
  includeRecentErrors?: boolean;
  includeRecentNetworkFailures?: boolean;
  includeFrames?: boolean;
  includeBoundingBoxes?: boolean;
  cursor?: string;
}): PageState;
```

Defaults:
```typescript
{
  mode: "interactive",
  maxElements: 300,
  maxTextPerElement: 160,
  includePossibleActions: true,
  includeRecentErrors: true,
  includeRecentNetworkFailures: true,
  includeFrames: true,
  includeBoundingBoxes: true
}
```

**PageState return type:**
```typescript
type PageState = {
  page: {
    url: string;
    title: string;
    readyState: DocumentReadyState;
    viewport: { width: number; height: number };
    scroll: { x: number; y: number; maxX: number; maxY: number };
    activeElement?: ElementInfoLite;
  };

  summary: {
    headings: Array<{ level: number; text: string }>;
    forms: number;
    links: number;
    buttons: number;
    inputs: number;
    contentEditables: number;
    dialogs: ElementInfoLite[];
    alerts: ElementInfoLite[];
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

#### `extract_text`

```typescript
extract_text(args?: {
  scope?: "document" | "viewport" | TargetRef;
  visibleOnly?: boolean;
  includeInputs?: boolean;
  includeButtons?: boolean;
  includeLinks?: boolean;
  format?: "plain" | "markdown" | "blocks";
  chunkSize?: number;
  cursor?: string;
}): TextExtractionResult;
```

#### `get_full_text`

Convenience API. The daemon drains chunks internally.

```typescript
get_full_text(args?: {
  scope?: "document" | "viewport" | TargetRef;
  visibleOnly?: boolean;
  format?: "plain" | "markdown";
  maxChars?: number;
}): FullTextResult;
```

#### `query_elements`

```typescript
query_elements(args?: {
  role?: string;
  text?: string;
  selector?: string;
  visibleOnly?: boolean;
  actionableOnly?: boolean;
  limit?: number;
}): ElementListResult;
```

### Core Element Format

```typescript
type ElementInfo = {
  ref?: string;
  role?: string;
  name?: string;
  inferredName?: string;
  tag: string;
  text?: string;
  valuePreview?: string;
  visible: boolean;
  enabled: boolean;
  actionable: boolean;
  rect?: Rect;
  selector?: string;
  confidence?: number;
  warnings?: string[];
};
```

### Possible Action Format

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

### Text Extraction Format

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
```

### Extension Files to Create/Modify

**Create:**
- `extension/src/content/pageState.ts`
- `extension/src/content/textExtractor.ts`
- `extension/src/content/elementScanner.ts`
- `extension/src/content/actionScanner.ts`
- `extension/src/content/browserErrorBuffer.ts`
- `extension/src/content/networkFailureBuffer.ts`
- `extension/src/content/chunkStore.ts`

**Modify:**
- `extension/src/content/index.ts`
- `extension/src/content/actionRuntime.ts`
- `extension/src/shared/protocol.ts`
- `extension/src/background/serviceWorker.ts`

### Daemon Files to Create/Modify

**Create:**
- `daemon/src/tools/getPageState.ts`
- `daemon/src/tools/extractText.ts`
- `daemon/src/tools/getFullText.ts`
- `daemon/src/tools/queryElements.ts`
- `daemon/src/chunks/chunkSessionStore.ts`

**Modify:**
- `daemon/src/tools/snapshot.ts`
- `daemon/src/tools/registry.ts`
- `daemon/src/extension/router.ts`

### Success Criteria

Phase 3 is done when:
- [ ] `get_page_state()` returns page + summary + elements + possibleActions in one call
- [ ] Large pages return `truncated=true` and `nextCursor`
- [ ] `extract_text()` returns chunked text without Python workaround
- [ ] `get_full_text()` returns combined text up to maxChars
- [ ] Agent can understand a large page without accessibility tree truncation
- [ ] Recent JS errors are captured
- [ ] Recent failed fetch/XHR/network-like failures are captured where extension can observe them

---

## 6. Phase 4 — Element Registry + Reliable Targeting

### Goal

Make click/fill targeting more stable and solve icon-only button fragility.

### New APIs

#### `list_actions`

This can remain separate even though `get_page_state()` includes possibleActions.

```typescript
list_actions(args?: {
  scope?: "viewport" | "document" | TargetRef;
  includeLowConfidence?: boolean;
  limit?: number;
}): ActionListResult;
```

#### `find_element`

```typescript
find_element(args: {
  text?: string;
  role?: string;
  placeholder?: string;
  label?: string;
  testId?: string;
  selector?: string;
  nearText?: string;
  nth?: number;
  visibleOnly?: boolean;
  actionableOnly?: boolean;
}): ElementListResult;
```

#### `describe_element`

```typescript
describe_element(args: {
  target: TargetRef;
  includeHtml?: boolean;
  includeNeighbors?: boolean;
  includeComputedStyle?: boolean;
}): ElementDescription;
```

#### `highlight`

```typescript
highlight(args: {
  targets: TargetRef[];
  labels?: boolean;
  durationMs?: number;
}): ActionResult;
```

#### `click_ref`

```typescript
click_ref(args: {
  target: TargetRef;
  button?: "left" | "middle" | "right";
  clickCount?: number;
  verify?: VerifyCondition;
  returnPageState?: boolean;
}): ActionResultWithOptionalState;
```

### Element Registry Behavior

Create persistent in-page refs:

```typescript
class ElementRegistry {
  register(el: Element): TargetRef;
  resolve(target: TargetRef): Element | null;
  markStale(ref: string): void;
  incrementGeneration(reason: string): void;
}
```

Use:
- `WeakMap<Element, ref>`
- `Map<ref, WeakRef<Element>>`
- `MutationObserver`
- Generation counter
- Fallback selector resolution
- Fallback textHash/rect/xpath from Phase 4 onward

### Icon-Only Inference

For buttons with no accessible name, compute `inferredName`.

Sources in priority order:
1. `aria-label`
2. `aria-labelledby`
3. Visible text
4. `title`
5. Input value
6. `placeholder`
7. `img alt`
8. SVG `<title>`
9. `data-testid`
10. `data-action`
11. Class tokens (`close`, `search`, `send`, `menu`, `settings`, `delete`, `edit`, `plus`, `minus`)
12. Nearby text
13. Tooltip text
14. Parent menu item text
15. Modal context

Example result:
```json
{
  "ref": "el_42",
  "role": "button",
  "name": "",
  "inferredName": "Send message",
  "inferredNameSources": ["data-testid", "nearby-text"],
  "confidence": 0.78,
  "warnings": ["MISSING_ACCESSIBLE_NAME", "INFERRED_LABEL"]
}
```

### Extension Files to Create/Modify

**Create:**
- `extension/src/content/elementRegistry.ts`
- `extension/src/content/nameInference.ts`
- `extension/src/content/selectorBuilder.ts`
- `extension/src/content/elementResolver.ts`
- `extension/src/content/highlightOverlay.ts`
- `extension/src/content/actionabilityLite.ts`

**Modify:**
- `extension/src/content/pageState.ts`
- `extension/src/content/actionScanner.ts`
- `extension/src/content/actionRuntime.ts`
- `extension/src/shared/protocol.ts`

### Daemon Files to Create/Modify

**Create:**
- `daemon/src/tools/findElement.ts`
- `daemon/src/tools/listActions.ts`
- `daemon/src/tools/describeElement.ts`
- `daemon/src/tools/highlight.ts`
- `daemon/src/tools/clickRef.ts`
- `daemon/src/state/tabElementCache.ts`

**Modify:**
- `daemon/src/tools/click.ts`
- `daemon/src/tools/fill.ts`
- `daemon/src/tools/registry.ts`
- `daemon/src/extension/router.ts`

### Success Criteria

Phase 4 is done when:
- [ ] `get_page_state()` returns stable refs for visible actionable elements
- [ ] `click_ref({ ref })` works across normal DOM updates
- [ ] Stale refs return `STALE_ELEMENT` with recovery suggestions
- [ ] Icon-only buttons receive inferred names with confidence scores
- [ ] Missing aria-labels produce warnings instead of silent fragility
- [ ] `highlight()` visually marks target elements
- [ ] `find_element()` can find buttons by inferred label, nearby text, selector, or role

---

## 7. Phase 5 — Observe-and-Act Reliability Layer

### Goal

Actions should automatically:
- Capture pre-state
- Perform action
- Wait for DOM stable by default
- Return post-state diff
- Include `timedOut` flag instead of failing hard

This implements the user's requested `observe_and_act()` pattern without forcing a separate top-level tool for every case.

### Updated Action APIs

#### `click_ref`

```typescript
click_ref(args: {
  target: TargetRef;
  button?: "left" | "middle" | "right";
  clickCount?: number;
  verify?: VerifyCondition;
  waitAfter?: WaitAfterPolicy;
  returnDiff?: boolean;
  returnPageState?: boolean;
  retry?: RetryPolicy;
}): ActionResultWithOptionalState;
```

#### `fill`

```typescript
fill(args: {
  target: TargetRef;
  value: string;
  clear?: boolean;
  verify?: "value-matches" | VerifyCondition;
  waitAfter?: WaitAfterPolicy;
  returnDiff?: boolean;
  returnPageState?: boolean;
}): ActionResultWithOptionalState;
```

#### `submit_form`

```typescript
submit_form(args: {
  target?: TargetRef | "active";
  strategy?: 
    | "auto"
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

#### `recover`

```typescript
recover(args?: {
  includeScreenshot?: boolean;
  includeLastErrors?: boolean;
  includePageState?: boolean;
  includePossibleActions?: boolean;
}): RecoveryReport;
```

### Wait Policy

```typescript
type WaitAfterPolicy = {
  domStable?: boolean;
  quietMs?: number;
  timeoutMs?: number;
};
```

Default:
```typescript
{
  domStable: true,
  quietMs: 300,
  timeoutMs: 3000
}
```

**Important:** timeout should not hard-fail the action.

Return:
```json
{
  "success": true,
  "timedOut": true,
  "strategyUsed": "click",
  "diff": {
    "urlChanged": false,
    "newText": [],
    "removedText": [],
    "dialogsOpened": []
  }
}
```

### Retry Policy

```typescript
type RetryPolicy = {
  attempts?: number;
  onStale?: boolean;
  onCovered?: boolean;
};
```

Default:
```typescript
{
  attempts: 1,
  onStale: true,
  onCovered: false
}
```

### Failure Taxonomy

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

### Extension Files to Create/Modify

**Create:**
- `extension/src/content/actionability.ts`
- `extension/src/content/domStability.ts`
- `extension/src/content/pageDiff.ts`
- `extension/src/content/recover.ts`
- `extension/src/content/fillNative.ts`

**Modify:**
- `extension/src/content/actionRuntime.ts`
- `extension/src/content/formSubmit.ts`
- `extension/src/content/pageState.ts`
- `extension/src/content/elementResolver.ts`

### Daemon Files to Create/Modify

**Create:**
- `daemon/src/tools/recover.ts`
- `daemon/src/state/actionHistory.ts`
- `daemon/src/state/errorHistory.ts`
- `daemon/src/protocol/failureTaxonomy.ts`

**Modify:**
- `daemon/src/tools/clickRef.ts`
- `daemon/src/tools/fill.ts`
- `daemon/src/tools/submitForm.ts`
- `daemon/src/tools/registry.ts`
- `daemon/src/logging.ts`

### Success Criteria

Phase 5 is done when:
- [ ] `click_ref()` checks visibility, enabled state, coverage, and stability before clicking
- [ ] `fill()` uses native setter and works with React/Vue/Angular-style inputs
- [ ] `submit_form()` returns pre/post diff
- [ ] Actions auto-wait for DOM stable by default
- [ ] Action timeout returns `timedOut=true` instead of crashing
- [ ] `recover()` explains current page state and likely next actions
- [ ] Failures use standard error codes
- [ ] Agent can recover from stale/covered/missing targets

---

## 8. Phase 6 — Daemon Hardening, Status, UX Polish

### Goal

Make the bridge safe and shippable.

Start with:
- WebSocket hardening
- Status API
- Deprecation logging
- Trace logs
- Basic policy controls

Add visible overlay later.

### New APIs

#### `get_bridge_status`

```typescript
get_bridge_status(): BridgeStatus;
```

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

#### `set_policy`

```typescript
set_policy(args: {
  domain?: string;
  allowEvaluate?: boolean;
  allowFormSubmit?: boolean;
  requireConfirmBeforeSubmit?: boolean;
  requireConfirmBeforeDownload?: boolean;
  redactSensitiveFields?: boolean;
}): PolicyResult;
```

#### `start_trace`

```typescript
start_trace(args?: {
  screenshots?: boolean;
  pageStates?: boolean;
  actionLog?: boolean;
}): TraceResult;
```

#### `stop_trace`

```typescript
stop_trace(): TraceArtifact;
```

#### `get_last_trace`

```typescript
get_last_trace(): TraceArtifact;
```

### Later UX Overlay APIs

```typescript
pause_automation(): ActionResult;
resume_automation(): ActionResult;
stop_automation(): ActionResult;

request_user_approval(args: {
  message: string;
  actionPreview?: string;
  target?: TargetRef;
  timeoutMs?: number;
}): ApprovalResult;
```

### WebSocket Hardening

Daemon should:
- Bind to `127.0.0.1` only
- Reject non-local connections
- Require session token after handshake
- Use request IDs
- Use heartbeat ping/pong
- Enforce max payload size
- Enforce per-tool timeout
- Support cancellation
- Support protocol version negotiation
- Log structured command/response metadata
- Never log sensitive field values by default

### Extension Files to Create/Modify

**Create:**
- `extension/src/background/status.ts`
- `extension/src/background/policy.ts`
- `extension/src/background/trace.ts`
- `extension/src/content/redaction.ts`
- `extension/src/content/automationOverlay.ts` (later in Phase 6)

**Modify:**
- `extension/src/background/serviceWorker.ts`
- `extension/src/shared/protocol.ts`
- `extension/manifest.json`

### Daemon Files to Create/Modify

**Create:**
- `daemon/src/security/sessionAuth.ts`
- `daemon/src/security/originPolicy.ts`
- `daemon/src/tools/getBridgeStatus.ts`
- `daemon/src/tools/setPolicy.ts`
- `daemon/src/tools/startTrace.ts`
- `daemon/src/tools/stopTrace.ts`
- `daemon/src/tools/getLastTrace.ts`
- `daemon/src/tracing/traceStore.ts`
- `daemon/src/protocol/versionNegotiation.ts`

**Modify:**
- `daemon/src/server/websocketServer.ts`
- `daemon/src/tools/registry.ts`
- `daemon/src/logging.ts`
- `daemon/src/config.ts`

### Success Criteria

Phase 6 is done when:
- [ ] `get_bridge_status()` reports daemon, extension, browser, and capabilities
- [ ] Daemon binds only to `127.0.0.1`
- [ ] Session token is required
- [ ] Heartbeat detects broken extension/daemon connections
- [ ] Trace logs show action timeline
- [ ] Sensitive values are redacted from logs by default
- [ ] Old tools emit deprecation warnings
- [ ] Overlay can be enabled experimentally without affecting automation

---

## 9. Migration Strategy for Old API

### Principle

**Do not break existing agents.**

Keep the old API surface for at least two minor versions after v2 is introduced.

### Existing Tools

- `navigate`
- `click`
- `fill`
- `snapshot`
- `evaluate`
- `screenshot`

### Wrapper Behavior

| Old Tool | New Implementation |
|----------|-------------------|
| `snapshot()` | Calls `get_page_state({ mode: "interactive" })` |
| `evaluate()` | Calls `evaluate_v2({ mode: "async-function-body", world: "isolated" })` |
| `click(selector/x/y)` | Resolves via `find_element()` or selector, then calls `click_ref()` |
| `fill(selector, value)` | Resolves via `find_element()` or selector, then calls new `fill()` |
| `screenshot()` | Keeps existing implementation |
| `navigate()` | Keeps existing implementation but returns v2 envelope |

### Deprecation Response Pattern

Old tools should return:
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

### Versioning

| Version | Deliverable |
|---------|-------------|
| 0.5.x | Current bridge |
| 0.6.0 | Phase 1 tools + v2 envelope |
| 0.7.0 | evaluate_v2 |
| 0.8.0 | get_page_state + extract_text |
| 0.9.0 | Element registry + click_ref |
| 1.0.0 | Reliability layer + status hardening |
| 1.1.0 | Overlay/policy/trace polish |

### Compatibility Policy

- Old tools supported through 1.1.x
- Warnings begin immediately
- Breaking removal no earlier than 1.2.0
- Agents can query `get_bridge_status().capabilities` before choosing tools

---

## 10. Final New Tool Surface

By the end of the plan, the bridge should expose:

### Observation
```
get_page_state(options)
extract_text(options)
get_full_text(options)
query_elements(query)
find_element(query)
list_actions(options)
describe_element(target)
```

### Action
```
focus(target)
press_key(key, options)
key_combo(combo, options)
click_ref(target, options)
fill(target, value, options)
submit_form(options)
select_option(target, option)
wait_for(condition)
```

### Evaluation / Debug
```
evaluate_v2(code, options)
screenshot(options)
highlight(targets)
recover(options)
```

### System
```
get_bridge_status()
set_policy(policy)
start_trace(options)
stop_trace()
get_last_trace()
pause_automation()
resume_automation()
stop_automation()
request_user_approval(request)
```

---

## 11. Final Acceptance Checklist

The full implementation is successful when an agent can reliably do this:

1. [ ] Call `get_page_state()`
2. [ ] See page summary, interactive elements, possible actions, recent errors
3. [ ] Fill a contenteditable or input field
4. [ ] Submit via `submit_form()`
5. [ ] Get pre/post state diff
6. [ ] Recover if the target became stale
7. [ ] Extract full page text without external Python scripts
8. [ ] Avoid `evaluate()` redeclaration errors
9. [ ] Click icon-only buttons using inferred names
10. [ ] Continue using old tools during migration

---

## The Most Important Locked Decision

> **The bridge should become an action runtime, not just a thin remote-control pipe.**

That gives the agent fewer brittle primitives, fewer round-trips, better recovery, and much more reliable control of the user's real browser.

---

*Plan agreed upon by Kimi (AI Agent) and ChatGPT via collaborative multi-round discussion.*  
*Date: 2026-05-17*
