# Kimi WebBridge v2.0 — Worker Plan with Non-Overlapping File Ownership

> **Constraint:** Each worker owns a distinct set of files. No two workers write to the same file. Handoffs happen through well-defined interfaces (types, protocols, event contracts).

---

## Layer 0: Foundation (Blocking — Must Complete First)

**Owner:** Worker-0 (Bootstrap)
**Goal:** Create project skeleton and shared contracts that all other workers depend on.

### Files Owned by Worker-0

```
kimi-webbridge/
├── package.json                    # Root workspace config
├── tsconfig.json                   # Root TypeScript config
├── .gitignore
├── README.md                       # (already exists — update only)
├── extension/
│   ├── package.json
│   ├── tsconfig.json
│   ├── manifest.json
│   └── src/
│       └── shared/
│           ├── protocol.ts         # BridgeCommand, BridgeResponse, TargetRef, Rect
│           ├── errors.ts           # BridgeErrorCode enum, BridgeError, BridgeWarning
│           └── telemetry.ts        # BridgeTelemetry, ActionResult, WaitResult
├── daemon/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── shared/
│           └── protocol.ts         # Re-exports from extension/shared (or shared package)
```

### Handoff Contract

After Worker-0 completes, the following types are frozen and available:

| Type | File | Consumers |
|------|------|-----------|
| `BridgeCommand<TArgs>` | `shared/protocol.ts` | All workers |
| `BridgeResponse<TResult>` | `shared/protocol.ts` | All workers |
| `BridgeErrorCode` | `shared/errors.ts` | All workers |
| `BridgeError` | `shared/errors.ts` | All workers |
| `BridgeWarning` | `shared/errors.ts` | All workers |
| `BridgeTelemetry` | `shared/telemetry.ts` | All workers |
| `TargetRef` | `shared/protocol.ts` | All workers |
| `Rect` | `shared/protocol.ts` | All workers |
| `ActionResult` | `shared/telemetry.ts` | All workers |
| `WaitResult` | `shared/telemetry.ts` | All workers |
| `VerifyCondition` | `shared/protocol.ts` | All workers |

**Rule:** Workers 1–4 may READ these files but NEVER WRITE to them. If a type needs to change, Worker-0 must be re-engaged.

---

## Phase 1: Missing Browser Primitives (v0.6.0)

### Worker-1A: Extension Content Script — Action Runtime
**Owner of:** `extension/src/content/*` (all new content script modules)
**Depends on:** Worker-0 (shared types)
**Goal:** Build the DOM interaction runtime inside the content script.

```
extension/src/content/
├── index.ts                    # Worker-1A ONLY (entry point, wires modules together)
├── actionRuntime.ts            # Worker-1A ONLY (command dispatch, target resolution)
├── keyboard.ts                 # Worker-1A ONLY (dispatchKey, keyCombo, special key handling)
├── formSubmit.ts              # Worker-1A ONLY (submitForm, isContentEditableInput, nearby submit detection)
└── waitFor.ts                 # Worker-1A ONLY (wait_for conditions, DOM stability via MutationObserver)
```

**Interface Contract (what Worker-1A exposes to Worker-1B):**
```typescript
// actionRuntime.ts exports:
export function handleCommand(cmd: BridgeCommand): Promise<BridgeResponse>;
export function resolveTarget(target: TargetRef | "active"): Element | null;

// keyboard.ts exports:
export function dispatchKey(args: PressKeyArgs): ActionResult;
export function dispatchKeyCombo(args: KeyComboArgs): ActionResult;

// formSubmit.ts exports:
export function submitForm(args: SubmitFormArgs): ActionResultWithOptionalState;
export function isContentEditableInput(el: Element | null): boolean;

// waitFor.ts exports:
export function waitFor(args: WaitForArgs): WaitResult;
export function waitForDomStable(opts: { quietMs: number; timeoutMs: number }): Promise<boolean>;
```

---

### Worker-1B: Extension Service Worker
**Owner of:** `extension/src/background/serviceWorker.ts`
**Depends on:** Worker-0 (shared types), Worker-1A (content script interface)
**Goal:** Route v2 commands from daemon to content scripts; maintain backward compat.

```
extension/src/background/
└── serviceWorker.ts            # Worker-1B ONLY
```

**Interface Contract (what Worker-1B exposes to daemon):**
```typescript
// Receives messages from daemon via native messaging / WebSocket
// Routes to content script via chrome.tabs.sendMessage()
// Returns BridgeResponse
```

**Rule:** Worker-1B does NOT touch `extension/src/content/*`. It calls into content scripts via `chrome.tabs.sendMessage()`.

---

### Worker-1C: Daemon Protocol & Tools
**Owner of:** `daemon/src/protocol/*`, `daemon/src/tools/*.ts` (individual tool files)
**Depends on:** Worker-0 (shared types)
**Goal:** Implement daemon-side tool handlers and protocol validation.

```
daemon/src/
├── protocol/
│   ├── v2.ts                  # Worker-1C ONLY (envelope validation, request parsing)
│   └── errors.ts              # Worker-1C ONLY (error factory, error code mapping)
└── tools/
    ├── pressKey.ts            # Worker-1C ONLY
    ├── keyCombo.ts            # Worker-1C ONLY
    ├── focus.ts               # Worker-1C ONLY
    ├── submitForm.ts          # Worker-1C ONLY
    ├── waitFor.ts             # Worker-1C ONLY
    └── registry.ts            # Worker-1C ONLY (tool registration table)
```

**Interface Contract (what Worker-1C exposes to Worker-1D):**
```typescript
// registry.ts exports:
export const toolRegistry: Map<string, ToolHandler>;
export type ToolHandler = (args: unknown, context: ToolContext) => Promise<BridgeResponse>;
export interface ToolContext { tabId: number; frameId?: number; timeoutMs?: number; }

// Each tool file exports a single handler:
export function handlePressKey(args: unknown, ctx: ToolContext): Promise<BridgeResponse>;
export function handleKeyCombo(args: unknown, ctx: ToolContext): Promise<BridgeResponse>;
// etc.
```

---

### Worker-1D: Daemon Server & Integration
**Owner of:** `daemon/src/server/*`, `daemon/src/extension/*`, `daemon/src/logging.ts`
**Depends on:** Worker-0 (shared types), Worker-1C (tool registry)
**Goal:** WebSocket server, request routing, logging, extension communication.

```
daemon/src/
├── server/
│   └── websocketServer.ts     # Worker-1D ONLY (WebSocket server, v2 envelope acceptance)
├── extension/
│   └── router.ts              # Worker-1D ONLY (routes commands to extension, reads responses)
└── logging.ts                 # Worker-1D ONLY (structured v2 command logging)
```

**Interface Contract (what Worker-1D consumes from Worker-1C):**
```typescript
import { toolRegistry } from "../tools/registry";
// Looks up tool by name, validates args, executes, returns BridgeResponse
```

**Rule:** Worker-1D does NOT touch `daemon/src/tools/*.ts` or `daemon/src/protocol/*.ts`. It imports and uses them.

---

## Phase 2: Safe Evaluation API (v0.7.0)

### Worker-2A: Extension Safe Evaluation
**Owner of:** `extension/src/content/evaluateV2.ts`, `safeSerialize.ts`, `sideEffectTracker.ts`
**Depends on:** Worker-0 (shared types)
**Goal:** Safe JS evaluation with fresh scope, serialization, and side-effect tracking.

```
extension/src/content/
├── evaluateV2.ts              # Worker-2A ONLY
├── safeSerialize.ts           # Worker-2A ONLY
└── sideEffectTracker.ts       # Worker-2A ONLY
```

**Interface Contract:**
```typescript
// evaluateV2.ts exports:
export function evaluateV2(args: EvaluateArgs): Promise<EvaluateResult>;

// safeSerialize.ts exports:
export function safeSerialize(value: unknown, opts?: SerializeOpts): unknown;

// sideEffectTracker.ts exports:
export function trackSideEffects<T>(fn: () => T): { result: T; effects: SideEffects };
```

**Rule:** Worker-2A also updates `extension/src/content/index.ts` to wire evaluateV2 into the command dispatcher. This is the ONLY file Worker-2A modifies that was created by Worker-1A.

---

### Worker-2B: Daemon Evaluation Tool
**Owner of:** `daemon/src/tools/evaluateV2.ts`, `daemon/src/protocol/serializers.ts`
**Depends on:** Worker-0 (shared types)
**Goal:** Daemon-side evaluation tool + result validation.

```
daemon/src/
├── tools/
│   └── evaluateV2.ts          # Worker-2B ONLY
└── protocol/
    └── serializers.ts         # Worker-2B ONLY
```

**Rule:** Worker-2B also modifies `daemon/src/tools/registry.ts` (created by Worker-1C) to register the new tool. This is the ONLY file Worker-2B modifies that was created by Worker-1C.

---

## Phase 3: Unified Observation + Chunked Extraction (v0.8.0)

### Worker-3A: Extension Observation Engine
**Owner of:** `extension/src/content/pageState.ts`, `textExtractor.ts`, `elementScanner.ts`, `actionScanner.ts`, `browserErrorBuffer.ts`, `networkFailureBuffer.ts`, `chunkStore.ts`
**Depends on:** Worker-0 (shared types)
**Goal:** Single-call page observation and chunked text extraction.

```
extension/src/content/
├── pageState.ts               # Worker-3A ONLY
├── textExtractor.ts           # Worker-3A ONLY
├── elementScanner.ts          # Worker-3A ONLY
├── actionScanner.ts           # Worker-3A ONLY
├── browserErrorBuffer.ts      # Worker-3A ONLY
├── networkFailureBuffer.ts    # Worker-3A ONLY
└── chunkStore.ts              # Worker-3A ONLY
```

**Rule:** Worker-3A modifies `extension/src/content/index.ts` (created by Worker-1A) to wire new commands into the dispatcher. This is the ONLY pre-existing file Worker-3A touches.

---

### Worker-3B: Daemon Observation Tools
**Owner of:** `daemon/src/tools/getPageState.ts`, `extractText.ts`, `getFullText.ts`, `queryElements.ts`, `daemon/src/chunks/chunkSessionStore.ts`
**Depends on:** Worker-0 (shared types)
**Goal:** Daemon-side tools for observation APIs.

```
daemon/src/
├── tools/
│   ├── getPageState.ts        # Worker-3B ONLY
│   ├── extractText.ts         # Worker-3B ONLY
│   ├── getFullText.ts         # Worker-3B ONLY
│   └── queryElements.ts       # Worker-3B ONLY
└── chunks/
    └── chunkSessionStore.ts   # Worker-3B ONLY
```

**Rule:** Worker-3B modifies `daemon/src/tools/registry.ts` (created by Worker-1C) to register new tools. This is the ONLY pre-existing file Worker-3B touches.

---

## Phase 4: Element Registry + Reliable Targeting (v0.9.0)

### Worker-4A: Extension Targeting Engine
**Owner of:** `extension/src/content/elementRegistry.ts`, `nameInference.ts`, `selectorBuilder.ts`, `elementResolver.ts`, `highlightOverlay.ts`, `actionabilityLite.ts`
**Depends on:** Worker-0 (shared types)
**Goal:** Stable element references, name inference, and reliable targeting.

```
extension/src/content/
├── elementRegistry.ts         # Worker-4A ONLY
├── nameInference.ts           # Worker-4A ONLY
├── selectorBuilder.ts         # Worker-4A ONLY
├── elementResolver.ts         # Worker-4A ONLY
├── highlightOverlay.ts        # Worker-4A ONLY
└── actionabilityLite.ts       # Worker-4A ONLY
```

**Rule:** Worker-4A modifies `extension/src/content/index.ts` (created by Worker-1A) and `extension/src/content/pageState.ts` (created by Worker-3A) to integrate the registry. These are the ONLY pre-existing files Worker-4A touches.

---

### Worker-4B: Daemon Targeting Tools
**Owner of:** `daemon/src/tools/findElement.ts`, `listActions.ts`, `describeElement.ts`, `highlight.ts`, `clickRef.ts`, `daemon/src/state/tabElementCache.ts`
**Depends on:** Worker-0 (shared types)
**Goal:** Daemon-side targeting and caching tools.

```
daemon/src/
├── tools/
│   ├── findElement.ts         # Worker-4B ONLY
│   ├── listActions.ts         # Worker-4B ONLY
│   ├── describeElement.ts     # Worker-4B ONLY
│   ├── highlight.ts           # Worker-4B ONLY
│   └── clickRef.ts            # Worker-4B ONLY
└── state/
    └── tabElementCache.ts     # Worker-4B ONLY
```

**Rule:** Worker-4B modifies `daemon/src/tools/registry.ts` (created by Worker-1C) to register new tools. This is the ONLY pre-existing file Worker-4B touches.

---

## Phase 5: Observe-and-Act Reliability Layer

### Worker-5A: Extension Reliability Layer
**Owner of:** `extension/src/content/actionability.ts`, `domStability.ts`, `pageDiff.ts`, `fillNative.ts`, `recover.ts`
**Depends on:** Worker-0 (shared types), Worker-4A (elementRegistry)
**Goal:** Full actionability checks, DOM stability, diffs, and recovery.

```
extension/src/content/
├── actionability.ts           # Worker-5A ONLY
├── domStability.ts            # Worker-5A ONLY
├── pageDiff.ts                # Worker-5A ONLY
├── fillNative.ts              # Worker-5A ONLY
└── recover.ts                 # Worker-5A ONLY
```

**Rule:** Worker-5A modifies `extension/src/content/index.ts` and `extension/src/content/actionRuntime.ts` (created by Worker-1A) to integrate reliability checks. These are the ONLY pre-existing files Worker-5A touches.

---

### Worker-5B: Daemon Reliability Tools
**Owner of:** `daemon/src/tools/recover.ts`, `daemon/src/state/actionHistory.ts`, `daemon/src/state/errorHistory.ts`, `daemon/src/protocol/failureTaxonomy.ts`
**Depends on:** Worker-0 (shared types)
**Goal:** Daemon-side reliability tracking and failure taxonomy.

```
daemon/src/
├── tools/
│   └── recover.ts             # Worker-5B ONLY
├── state/
│   ├── actionHistory.ts       # Worker-5B ONLY
│   └── errorHistory.ts        # Worker-5B ONLY
└── protocol/
    └── failureTaxonomy.ts     # Worker-5B ONLY
```

**Rule:** Worker-5B modifies `daemon/src/tools/registry.ts` (created by Worker-1C) to register new tools. This is the ONLY pre-existing file Worker-5B touches.

---

## Phase 6: Daemon Hardening, Status, UX Polish (v1.0.0)

### Worker-6A: Extension Security & UX
**Owner of:** `extension/src/background/status.ts`, `policy.ts`, `trace.ts`, `extension/src/content/redaction.ts`, `automationOverlay.ts`
**Depends on:** Worker-0 (shared types)
**Goal:** Per-domain policy, trace recording, sensitive value redaction, automation overlay.

```
extension/src/background/
├── status.ts                  # Worker-6A ONLY
├── policy.ts                  # Worker-6A ONLY
└── trace.ts                   # Worker-6A ONLY
	extension/src/content/
├── redaction.ts               # Worker-6A ONLY
└── automationOverlay.ts       # Worker-6A ONLY
```

**Rule:** Worker-6A modifies `extension/src/background/serviceWorker.ts` (created by Worker-1B) to wire in status, policy, and trace handlers. This is the ONLY pre-existing file Worker-6A touches.

---

### Worker-6B: Daemon Security & System Tools
**Owner of:** `daemon/src/security/sessionAuth.ts`, `originPolicy.ts`, `daemon/src/tools/getBridgeStatus.ts`, `setPolicy.ts`, `startTrace.ts`, `stopTrace.ts`, `getLastTrace.ts`, `daemon/src/tracing/traceStore.ts`, `daemon/src/protocol/versionNegotiation.ts`
**Depends on:** Worker-0 (shared types)
**Goal:** Session auth, origin policy, system tools, tracing, protocol negotiation.

```
daemon/src/
├── security/
│   ├── sessionAuth.ts         # Worker-6B ONLY
│   └── originPolicy.ts        # Worker-6B ONLY
├── tools/
│   ├── getBridgeStatus.ts     # Worker-6B ONLY
│   ├── setPolicy.ts           # Worker-6B ONLY
│   ├── startTrace.ts          # Worker-6B ONLY
│   ├── stopTrace.ts           # Worker-6B ONLY
│   └── getLastTrace.ts        # Worker-6B ONLY
├── tracing/
│   └── traceStore.ts          # Worker-6B ONLY
└── protocol/
    └── versionNegotiation.ts  # Worker-6B ONLY
```

**Rule:** Worker-6B modifies:
- `daemon/src/tools/registry.ts` (created by Worker-1C) to register system tools
- `daemon/src/server/websocketServer.ts` (created by Worker-1D) to add auth, heartbeat, payload limits
- `daemon/src/logging.ts` (created by Worker-1D) to add redaction

These are the ONLY pre-existing files Worker-6B touches.

---

## File Ownership Summary Matrix

| File | Created By | Modified By | Read By |
|------|-----------|-------------|---------|
| `extension/src/shared/*` | Worker-0 | — (frozen) | All |
| `extension/src/content/index.ts` | Worker-1A | 2A, 3A, 4A, 5A | All extension workers |
| `extension/src/content/actionRuntime.ts` | Worker-1A | 5A | 2A, 3A, 4A |
| `extension/src/content/keyboard.ts` | Worker-1A | — | 1A, index |
| `extension/src/content/formSubmit.ts` | Worker-1A | — | 1A, index |
| `extension/src/content/waitFor.ts` | Worker-1A | — | 1A, 5A, index |
| `extension/src/content/evaluateV2.ts` | Worker-2A | — | index |
| `extension/src/content/safeSerialize.ts` | Worker-2A | — | evaluateV2 |
| `extension/src/content/sideEffectTracker.ts` | Worker-2A | — | evaluateV2 |
| `extension/src/content/pageState.ts` | Worker-3A | 4A | index |
| `extension/src/content/textExtractor.ts` | Worker-3A | — | index |
| `extension/src/content/elementScanner.ts` | Worker-3A | — | pageState |
| `extension/src/content/actionScanner.ts` | Worker-3A | — | pageState |
| `extension/src/content/chunkStore.ts` | Worker-3A | — | textExtractor |
| `extension/src/content/elementRegistry.ts` | Worker-4A | — | pageState, actionRuntime |
| `extension/src/content/nameInference.ts` | Worker-4A | — | elementRegistry |
| `extension/src/content/selectorBuilder.ts` | Worker-4A | — | elementRegistry |
| `extension/src/content/elementResolver.ts` | Worker-4A | — | actionRuntime |
| `extension/src/content/highlightOverlay.ts` | Worker-4A | — | index |
| `extension/src/content/actionabilityLite.ts` | Worker-4A | — | actionScanner |
| `extension/src/content/actionability.ts` | Worker-5A | — | actionRuntime |
| `extension/src/content/domStability.ts` | Worker-5A | — | waitFor, actionRuntime |
| `extension/src/content/pageDiff.ts` | Worker-5A | — | actionRuntime |
| `extension/src/content/fillNative.ts` | Worker-5A | — | actionRuntime |
| `extension/src/content/recover.ts` | Worker-5A | — | index |
| `extension/src/content/redaction.ts` | Worker-6A | — | pageState |
| `extension/src/content/automationOverlay.ts` | Worker-6A | — | index |
| `extension/src/background/serviceWorker.ts` | Worker-1B | 6A | — |
| `extension/src/background/status.ts` | Worker-6A | — | serviceWorker |
| `extension/src/background/policy.ts` | Worker-6A | — | serviceWorker |
| `extension/src/background/trace.ts` | Worker-6A | — | serviceWorker |
| `daemon/src/shared/*` | Worker-0 | — (frozen) | All daemon workers |
| `daemon/src/protocol/v2.ts` | Worker-1C | — | 1D, 6B |
| `daemon/src/protocol/errors.ts` | Worker-1C | — | All daemon tools |
| `daemon/src/protocol/serializers.ts` | Worker-2B | — | evaluateV2 tool |
| `daemon/src/protocol/failureTaxonomy.ts` | Worker-5B | — | All daemon tools |
| `daemon/src/protocol/versionNegotiation.ts` | Worker-6B | — | websocketServer |
| `daemon/src/tools/*.ts` (individual) | 1C, 2B, 3B, 4B, 5B, 6B | — | registry |
| `daemon/src/tools/registry.ts` | Worker-1C | 2B, 3B, 4B, 5B, 6B | 1D |
| `daemon/src/server/websocketServer.ts` | Worker-1D | 6B | — |
| `daemon/src/extension/router.ts` | Worker-1D | — | websocketServer |
| `daemon/src/logging.ts` | Worker-1D | 6B | — |
| `daemon/src/chunks/chunkSessionStore.ts` | Worker-3B | — | getFullText |
| `daemon/src/state/tabElementCache.ts` | Worker-4B | — | findElement, clickRef |
| `daemon/src/state/actionHistory.ts` | Worker-5B | — | recover |
| `daemon/src/state/errorHistory.ts` | Worker-5B | — | recover |
| `daemon/src/security/sessionAuth.ts` | Worker-6B | — | websocketServer |
| `daemon/src/security/originPolicy.ts` | Worker-6B | — | setPolicy |
| `daemon/src/tracing/traceStore.ts` | Worker-6B | — | start/stop/get trace |

---

## Dependency DAG

```
Worker-0 (Foundation)
  ├── Worker-1A (Ext Content) ──┬── Worker-2A (Ext Eval) ──┬── Worker-3A (Ext Observation)
  │                             │                          │
  ├── Worker-1B (Ext SW) ───────┼──────────────────────────┼── Worker-6A (Ext Security/UX)
  │                             │                          │
  ├── Worker-1C (Daemon Proto) ─┼── Worker-2B (Daemon Eval) ┼── Worker-3B (Daemon Observation)
  │                             │                          │
  └── Worker-1D (Daemon Server) ┴──────────────────────────┴── Worker-4B (Daemon Targeting)
                                                                │
                                                                ├── Worker-5B (Daemon Reliability)
                                                                │
                                                                └── Worker-6B (Daemon Security)

Worker-4A (Ext Targeting) depends on Worker-3A (pageState integration)
Worker-5A (Ext Reliability) depends on Worker-4A (elementRegistry)
```

**Parallel execution rules:**
- Within a phase, workers on different sides (Extension vs Daemon) can run in parallel.
- Extension content workers (1A, 2A, 3A, 4A, 5A) form a chain — each depends on the previous.
- Extension service worker (1B) and security (6A) form a separate chain.
- Daemon workers (1C, 1D, 2B, 3B, 4B, 5B, 6B) can run more aggressively in parallel since they mostly create new files and only modify `registry.ts`.

---

## Merge Safety Rules

1. **Only Worker-0 edits shared types.** If another worker needs a new type, they define it locally and request Worker-0 to promote it.
2. **Registry modifications are append-only.** New tools register themselves; no worker removes another's registration.
3. **Content script index.ts is the integration point.** Each phase worker adds their command handler to the dispatcher table. Handlers are keyed by command name — no collisions.
4. **Service worker changes are additive.** Worker-6A adds handlers but does not refactor Worker-1B's routing logic.
5. **Server changes are additive.** Worker-6B adds middleware but does not refactor Worker-1D's core server loop.
