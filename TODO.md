# Kimi WebBridge v2.0 — Live TODO & Agent Handoff

> **⚠️ CRITICAL: This file is updated every 10 minutes during active implementation.**
>
> If you are a new AI agent taking over, read the **Agent Handoff Protocol** below first.

---

## 🔄 Agent Handoff Protocol

**Last Updated:** 2026-05-17 16:28 UTC
**Current Agent:** Kimi (initial planning phase)  
**Status:** Planning complete, ready to implement Phase 1  
**Next Checkpoint:** 2026-05-17 16:38 UTC

### If You Are Taking Over

1. **Read this file completely** — it contains the live state of the project
2. **Check the Current Status section** — know what's done, in-progress, and blocked
3. **Read the last 3 commits** — `git log --oneline -3`
4. **Check open issues/blockers** — see Blocked Items section
5. **Continue from the Current Task** — don't restart work already done
6. **Update this file** immediately with your agent name and timestamp

### Update Rules

- **During implementation:** Update this file every **10 minutes minimum**
- **During debugging:** Update every **5 minutes**
- **After every commit:** Update immediately
- **Before stopping:** Update and push to GitHub
- **Template for update:**
  ```
  Last Updated: [ISO timestamp]
  Current Agent: [Your name]
  Status: [what you are doing]
  Current Task: [specific task from checklist]
  Blocked Items: [any blockers]
  Next Checkpoint: [timestamp + 10 min]
  ```

---

## 📊 Current Status

### Overall Progress

| Phase | Status | Progress | Target Completion |
|-------|--------|----------|-------------------|
| Phase 0: Setup & Planning | ✅ DONE | 100% | 2026-05-17 |
| Phase 1: Missing Primitives | ⏳ READY | 0% | TBD |
| Phase 2: Safe Evaluation | ⏸️ PENDING | 0% | TBD |
| Phase 3: Unified Observation | ⏸️ PENDING | 0% | TBD |
| Phase 4: Element Registry | ⏸️ PENDING | 0% | TBD |
| Phase 5: Reliability Layer | ⏸️ PENDING | 0% | TBD |
| Phase 6: Hardening & UX | ⏸️ PENDING | 0% | TBD |

### Current Task

- [ ] **TASK-0.1:** Push initial planning documents to GitHub repository
- [ ] **TASK-0.2:** Set up auto-update mechanism for this TODO file
- [ ] **TASK-1.0:** Begin Phase 1 implementation — create extension and daemon directories

### Blocked Items

None currently.

### Recent Decisions

1. **Chrome extension approach ONLY** — no CDP/WebDriver migration
2. **Non-breaking migration** — old API wrappers remain for 2 minor versions
3. **Content-script action runtime** — daemon stays thin, content script gets smarter
4. **Phase 1 priority:** press_key, submit_form, focus, wait_for

---

## ✅ Phase 0: Setup & Planning

- [x] **0.1** Identify pain points from hands-on usage
- [x] **0.2** Draft initial improvement proposals
- [x] **0.3** Multi-round discussion with ChatGPT
- [x] **0.4** Agree on final locked implementation plan
- [x] **0.5** Create planning repository on GitHub
- [x] **0.6** Write README.md with overview
- [x] **0.7** Write PLAN.md with full 6-phase roadmap
- [x] **0.8** Write ARCHITECTURE.md with system design
- [x] **0.9** Write API-SPEC.md with TypeScript types
- [x] **0.10** Write MIGRATION.md with backward-compat strategy
- [ ] **0.11** Set up auto-update script for TODO.md
- [ ] **0.12** Push all documents to GitHub

---

## 🔧 Phase 1: Missing Browser Primitives

### 1.1 Protocol Foundation

- [ ] **1.1.1** Create v2 command envelope types (`protocol/v2.ts`)
- [ ] **1.1.2** Create v2 response envelope types with error taxonomy
- [ ] **1.1.3** Create `BridgeErrorCode` enum
- [ ] **1.1.4** Create telemetry types (`durationMs`, `urlBefore`, `urlAfter`, etc.)
- [ ] **1.1.5** Create `TargetRef` simplified type for Phase 1-2
- [ ] **1.1.6** Create `VerifyCondition` union type
- [ ] **1.1.7** Create `ActionResult` and `ActionResultWithOptionalState` types
- [ ] **1.1.8** Create `WaitResult` type

### 1.2 Extension: Content Script Action Runtime

- [ ] **1.2.1** Create `extension/src/content/actionRuntime.ts` module
- [ ] **1.2.2** Implement target resolution (ref → selector → active element)
- [ ] **1.2.3** Implement focus with scrollIntoView
- [ ] **1.2.4** Create `extension/src/content/keyboard.ts`
- [ ] **1.2.5** Implement `dispatchKey()` with keydown/keypress/keyup sequence
- [ ] **1.2.6** Implement special key handling (Tab focus cycling, Escape, Ctrl+A fallback)
- [ ] **1.2.7** Create `extension/src/content/formSubmit.ts`
- [ ] **1.2.8** Implement `submitForm()` with requestSubmit → click submit → Enter → Ctrl+Enter fallback
- [ ] **1.2.9** Implement contenteditable detection (`isContentEditableInput`)
- [ ] **1.2.10** Implement nearby submit button detection for contenteditable composers
- [ ] **1.2.11** Create `extension/src/content/waitFor.ts`
- [ ] **1.2.12** Implement `wait_for()` conditions: url_changed, url_contains, text_visible, selector_visible, element_gone, dom_stable, navigation_idle
- [ ] **1.2.13** Implement DOM stability detection with MutationObserver
- [ ] **1.2.14** Wire all content script modules into `extension/src/content/index.ts`

### 1.3 Extension: Service Worker Updates

- [ ] **1.3.1** Update `extension/src/background/serviceWorker.ts` to route v2 commands
- [ ] **1.3.2** Add command dispatch table for new tools
- [ ] **1.3.3** Ensure backward compatibility with v1 commands

### 1.4 Daemon: Tool Registry & Server

- [ ] **1.4.1** Create `daemon/src/protocol/v2.ts` with envelope validation
- [ ] **1.4.2** Create `daemon/src/protocol/errors.ts` with error codes
- [ ] **1.4.3** Create `daemon/src/tools/pressKey.ts`
- [ ] **1.4.4** Create `daemon/src/tools/keyCombo.ts`
- [ ] **1.4.5** Create `daemon/src/tools/focus.ts`
- [ ] **1.4.6** Create `daemon/src/tools/submitForm.ts`
- [ ] **1.4.7** Create `daemon/src/tools/waitFor.ts`
- [ ] **1.4.8** Update `daemon/src/tools/registry.ts` to register all new tools
- [ ] **1.4.9** Update `daemon/src/server/websocketServer.ts` to accept v2 envelopes
- [ ] **1.4.10** Update `daemon/src/extension/router.ts` to route commands to extension
- [ ] **1.4.11** Add request ID tracking and timeout enforcement
- [ ] **1.4.12** Update `daemon/src/logging.ts` with structured v2 command logging

### 1.5 Integration & Testing

- [ ] **1.5.1** Test `press_key("Enter")` on focused input field
- [ ] **1.5.2** Test `press_key("Enter")` on contenteditable (ProseMirror)
- [ ] **1.5.3** Test `key_combo("Ctrl+Enter")` on ChatGPT composer
- [ ] **1.5.4** Test `submit_form()` on standard HTML form
- [ ] **1.5.5** Test `submit_form()` on ChatGPT contenteditable composer
- [ ] **1.5.6** Test `focus()` with scrollIntoView on off-screen element
- [ ] **1.5.7** Test `wait_for({ type: "dom_stable" })` after dynamic content load
- [ ] **1.5.8** Test `wait_for({ type: "text_visible", text: "Success" })`
- [ ] **1.5.9** Verify all new tools return standard v2 response envelopes
- [ ] **1.5.10** Verify old tools (navigate, click, fill, snapshot) still work
- [ ] **1.5.11** Verify deprecation warnings on old tools (if enabled)

### 1.6 Documentation & Handoff

- [ ] **1.6.1** Update API-SPEC.md with Phase 1 APIs
- [ ] **1.6.2** Add Phase 1 examples to README.md
- [ ] **1.6.3** Commit Phase 1 code with message: `feat(phase1): browser primitives (press_key, submit_form, focus, wait_for)`
- [ ] **1.6.4** Tag release: `v0.6.0`
- [ ] **1.6.5** Update this TODO.md with Phase 1 completion status

---

## 🔧 Phase 2: Safe Evaluation API

### 2.1 Extension: Safe Evaluation

- [ ] **2.1.1** Create `extension/src/content/evaluateV2.ts`
- [ ] **2.1.2** Implement `evaluateV2()` with fresh `new Function()` + async IIFE wrapper
- [ ] **2.1.3** Implement mode support: expression, function-body, async-function-body
- [ ] **2.1.4** Implement timeout enforcement with `runWithTimeout()`
- [ ] **2.1.5** Create `extension/src/content/safeSerialize.ts`
- [ ] **2.1.6** Implement safe serializer (max depth 6, max array 500, max keys 500)
- [ ] **2.1.7** Handle circular references → `"[Circular]"`
- [ ] **2.1.8** Handle DOM nodes → preview objects
- [ ] **2.1.9** Handle functions → `"[Function name]"`
- [ ] **2.1.10** Implement result size capping
- [ ] **2.1.11** Create `extension/src/content/sideEffectTracker.ts`
- [ ] **2.1.12** Track DOM mutations during evaluation
- [ ] **2.1.13** Track navigation starts during evaluation
- [ ] **2.1.14** Implement `world: "main"` support (inject script tag, postMessage back, cleanup)
- [ ] **2.1.15** Keep `world: "main"` disabled by default

### 2.2 Daemon: Evaluation Tool

- [ ] **2.2.1** Create `daemon/src/tools/evaluateV2.ts`
- [ ] **2.2.2** Create `daemon/src/protocol/serializers.ts`
- [ ] **2.2.3** Implement v2 evaluation route with schema validation
- [ ] **2.2.4** Implement result-size enforcement
- [ ] **2.2.5** Implement structured error handling (SyntaxError, TypeError, TimeoutError)

### 2.3 Backward Compatibility

- [ ] **2.3.1** Update `daemon/src/tools/evaluate.ts` to wrap `evaluate_v2()`
- [ ] **2.3.2** Add deprecation warning to old `evaluate()`
- [ ] **2.3.3** Ensure old `evaluate()` maps to `evaluate_v2({ mode: "function-body", world: "isolated" })`

### 2.4 Testing

- [ ] **2.4.1** Test repeated `evaluate_v2("const x = 1; return x;")` — must never throw redeclaration
- [ ] **2.4.2** Test `evaluate_v2()` with circular object return
- [ ] **2.4.3** Test `evaluate_v2()` with DOM node return
- [ ] **2.4.4** Test `evaluate_v2()` timeout enforcement
- [ ] **2.4.5** Test `evaluate_v2()` max result size truncation
- [ ] **2.4.6** Test old `evaluate()` still works via wrapper
- [ ] **2.4.7** Test structured error responses for syntax errors

### 2.5 Documentation & Handoff

- [ ] **2.5.1** Update API-SPEC.md with `evaluate_v2` specification
- [ ] **2.5.2** Commit Phase 2 code: `feat(phase2): safe evaluation with isolated scope`
- [ ] **2.5.3** Tag release: `v0.7.0`
- [ ] **2.5.4** Update this TODO.md

---

## 🔧 Phase 3: Unified Observation + Chunked Extraction

### 3.1 Extension: Page State Observation

- [ ] **3.1.1** Create `extension/src/content/pageState.ts`
- [ ] **3.1.2** Implement `get_page_state()` with mode: summary / interactive / full
- [ ] **3.1.3** Implement page metadata extraction (url, title, readyState, viewport, scroll)
- [ ] **3.1.4** Implement summary extraction (headings, forms, links, buttons, inputs, dialogs)
- [ ] **3.1.5** Implement element scanning with maxElements limit
- [ ] **3.1.6** Implement possible action inference
- [ ] **3.1.7** Implement cursor-based pagination for large pages
- [ ] **3.1.8** Create `extension/src/content/actionScanner.ts`
- [ ] **3.1.9** Create `extension/src/content/elementScanner.ts`

### 3.2 Extension: Text Extraction

- [ ] **3.2.1** Create `extension/src/content/textExtractor.ts`
- [ ] **3.2.2** Implement `extract_text()` with plain / markdown / blocks formats
- [ ] **3.2.3** Implement visible-only filtering
- [ ] **3.2.4** Implement input value inclusion
- [ ] **3.2.5** Implement chunking with cursor pagination
- [ ] **3.2.6** Implement shadow DOM traversal (open shadow roots)
- [ ] **3.2.7** Implement same-origin iframe traversal
- [ ] **3.2.8** Create `extension/src/content/chunkStore.ts`

### 3.3 Extension: Error & Network Observation

- [ ] **3.3.1** Create `extension/src/content/browserErrorBuffer.ts`
- [ ] **3.3.2** Capture recent JS console errors
- [ ] **3.3.3** Create `extension/src/content/networkFailureBuffer.ts`
- [ ] **3.3.4** Capture recent failed fetch/XHR where observable by extension

### 3.4 Daemon: Observation Tools

- [ ] **3.4.1** Create `daemon/src/tools/getPageState.ts`
- [ ] **3.4.2** Create `daemon/src/tools/extractText.ts`
- [ ] **3.4.3** Create `daemon/src/tools/getFullText.ts`
- [ ] **3.4.4** Create `daemon/src/tools/queryElements.ts`
- [ ] **3.4.5** Create `daemon/src/chunks/chunkSessionStore.ts`
- [ ] **3.4.6** Implement chunk draining for `get_full_text()`

### 3.5 Backward Compatibility

- [ ] **3.5.1** Update `daemon/src/tools/snapshot.ts` to wrap `get_page_state({ mode: "interactive" })`
- [ ] **3.5.2** Add deprecation warning to old `snapshot()`

### 3.6 Testing

- [ ] **3.6.1** Test `get_page_state()` returns all sections in one call
- [ ] **3.6.2** Test large page returns `truncated=true` + `nextCursor`
- [ ] **3.6.3** Test `extract_text()` returns chunked text
- [ ] **3.6.4** Test `get_full_text()` drains chunks and returns combined text
- [ ] **3.6.5** Test markdown format extraction
- [ ] **3.6.6** Test shadow DOM content extraction
- [ ] **3.6.7** Test error buffer captures console errors

### 3.7 Documentation & Handoff

- [ ] **3.7.1** Update API-SPEC.md with Phase 3 APIs
- [ ] **3.7.2** Commit Phase 3 code: `feat(phase3): unified observation and chunked text extraction`
- [ ] **3.7.3** Tag release: `v0.8.0`
- [ ] **3.7.4** Update this TODO.md

---

## 🔧 Phase 4: Element Registry + Reliable Targeting

### 4.1 Extension: Element Registry

- [ ] **4.1.1** Create `extension/src/content/elementRegistry.ts`
- [ ] **4.1.2** Implement `ElementRegistry` class
- [ ] **4.1.3** Use `WeakMap<Element, string>` for element → ref mapping
- [ ] **4.1.4** Use `Map<string, WeakRef<Element>>` for ref → element mapping
- [ ] **4.1.5** Implement `register(el)` → returns `TargetRef`
- [ ] **4.1.6** Implement `resolve(target)` → returns `Element | null`
- [ ] **4.1.7** Implement `markStale(ref)` for removed elements
- [ ] **4.1.8** Implement `incrementGeneration(reason)` for major DOM changes
- [ ] **4.1.9** Set up MutationObserver for DOM change detection
- [ ] **4.1.10** Small DOM changes: keep refs. Large changes: increment generation.

### 4.2 Extension: Name Inference

- [ ] **4.2.1** Create `extension/src/content/nameInference.ts`
- [ ] **4.2.2** Implement `computeBridgeName(el)` with priority order
- [ ] **4.2.3** Implement aria-label extraction
- [ ] **4.2.4** Implement aria-labelledby extraction
- [ ] **4.2.5** Implement visible text extraction
- [ ] **4.2.6** Implement title attribute extraction
- [ ] **4.2.7** Implement input value/placeholder extraction
- [ ] **4.2.8** Implement img alt extraction
- [ ] **4.2.9** Implement SVG `<title>` extraction
- [ ] **4.2.10** Implement data-testid extraction
- [ ] **4.2.11** Implement class token heuristic (close, search, send, menu, settings, delete, edit)
- [ ] **4.2.12** Implement nearby text heuristic
- [ ] **4.2.13** Implement tooltip text heuristic
- [ ] **4.2.14** Implement parent menu item text heuristic
- [ ] **4.2.15** Implement modal context heuristic

### 4.3 Extension: Selector & Resolver

- [ ] **4.3.1** Create `extension/src/content/selectorBuilder.ts`
- [ ] **4.3.2** Build stable CSS selectors for elements
- [ ] **4.3.3** Create `extension/src/content/elementResolver.ts`
- [ ] **4.3.4** Implement fallback resolution: ref → selector → textHash → rect proximity

### 4.4 Extension: Highlight Overlay

- [ ] **4.4.1** Create `extension/src/content/highlightOverlay.ts`
- [ ] **4.4.2** Implement element highlighting with colored border
- [ ] **4.4.3** Optional label display on highlight
- [ ] **4.4.4** Auto-remove highlight after duration

### 4.5 Extension: Actionability Checks

- [ ] **4.5.1** Create `extension/src/content/actionabilityLite.ts`
- [ ] **4.5.2** Implement visibility check
- [ ] **4.5.3** Implement enabled check
- [ ] **4.5.4** Implement bounding box check
- [ ] **4.5.5** Generate warnings: MISSING_ACCESSIBLE_NAME, LOW_CONFIDENCE_LABEL, etc.

### 4.6 Daemon: Targeting Tools

- [ ] **4.6.1** Create `daemon/src/tools/findElement.ts`
- [ ] **4.6.2** Create `daemon/src/tools/listActions.ts`
- [ ] **4.6.3** Create `daemon/src/tools/describeElement.ts`
- [ ] **4.6.4** Create `daemon/src/tools/highlight.ts`
- [ ] **4.6.5** Create `daemon/src/tools/clickRef.ts`
- [ ] **4.6.6** Create `daemon/src/state/tabElementCache.ts`
- [ ] **4.6.7** Cache latest snapshot_v2 element refs per tab

### 4.7 Backward Compatibility

- [ ] **4.7.1** Update `daemon/src/tools/click.ts` to resolve via `find_element()` then `click_ref()`
- [ ] **4.7.2** Update `daemon/src/tools/fill.ts` to resolve via `find_element()` then new `fill()`
- [ ] **4.7.3** Add deprecation warnings

### 4.8 Testing

- [ ] **4.8.1** Test `click_ref({ ref })` works after normal DOM updates
- [ ] **4.8.2** Test stale ref returns `STALE_ELEMENT` with recovery suggestion
- [ ] **4.8.3** Test icon-only button gets inferred name
- [ ] **4.8.4** Test `find_element({ text: "Send" })` finds ChatGPT send button
- [ ] **4.8.5** Test `highlight()` marks element visually
- [ ] **4.8.6** Test old `click()` still works via wrapper

### 4.9 Documentation & Handoff

- [ ] **4.9.1** Update API-SPEC.md with Phase 4 APIs
- [ ] **4.9.2** Commit Phase 4 code: `feat(phase4): element registry and reliable targeting`
- [ ] **4.9.3** Tag release: `v0.9.0`
- [ ] **4.9.4** Update this TODO.md

---

## 🔧 Phase 5: Observe-and-Act Reliability Layer

### 5.1 Extension: Actionability & Stability

- [ ] **5.1.1** Create `extension/src/content/actionability.ts`
- [ ] **5.1.2** Implement full actionability checks:
  - [ ] Element exists
  - [ ] Element is connected to DOM
  - [ ] Element is visible
  - [ ] Element has non-zero bounding box
  - [ ] Element is enabled
  - [ ] Element is not aria-disabled
  - [ ] Element is not covered by another element (`elementFromPoint` check)
  - [ ] Element is in viewport or scrollable into viewport
  - [ ] Element position is stable for 2 animation frames
- [ ] **5.1.3** Create `extension/src/content/domStability.ts`
- [ ] **5.1.4** Implement `waitForDomStable({ quietMs, timeoutMs })` with MutationObserver
- [ ] **5.1.5** Create `extension/src/content/pageDiff.ts`
- [ ] **5.1.6** Implement pre/post state diff computation
- [ ] **5.1.7** Track URL changes, new text, removed text, dialogs opened

### 5.2 Extension: Enhanced Actions

- [ ] **5.2.1** Update `click_ref()` with auto-wait and verify
- [ ] **5.2.2** Update `fill()` with native setter pattern for React/Vue/Angular
- [ ] **5.2.3** Create `extension/src/content/fillNative.ts`
- [ ] **5.2.4** Implement `setNativeValue()` using prototype descriptor
- [ ] **5.2.5** Update `submit_form()` with auto-wait and return diff
- [ ] **5.2.6** Create `extension/src/content/recover.ts`
- [ ] **5.2.7** Implement `recover()` that explains page state + next actions

### 5.3 Daemon: Reliability Tools

- [ ] **5.3.1** Create `daemon/src/tools/recover.ts`
- [ ] **5.3.2** Create `daemon/src/state/actionHistory.ts`
- [ ] **5.3.3** Create `daemon/src/state/errorHistory.ts`
- [ ] **5.3.4** Create `daemon/src/protocol/failureTaxonomy.ts`
- [ ] **5.3.5** Update `click_ref`, `fill`, `submit_form` daemon tools with wait policies

### 5.4 Testing

- [ ] **5.4.1** Test `click_ref()` on covered element returns `ELEMENT_COVERED`
- [ ] **5.4.2** Test `click_ref()` on disabled element returns `ELEMENT_DISABLED`
- [ ] **5.4.3** Test `fill()` on React controlled input works
- [ ] **5.4.4** Test action timeout returns `timedOut=true`, not crash
- [ ] **5.4.5** Test `recover()` after failed action provides useful context
- [ ] **5.4.6** Test retry on stale element works

### 5.5 Documentation & Handoff

- [ ] **5.5.1** Update API-SPEC.md with Phase 5 updates
- [ ] **5.5.2** Commit Phase 5 code: `feat(phase5): observe-and-act reliability layer`
- [ ] **5.5.3** Update this TODO.md

---

## 🔧 Phase 6: Daemon Hardening, Status, UX Polish

### 6.1 WebSocket Hardening

- [ ] **6.1.1** Bind daemon to `127.0.0.1` only
- [ ] **6.1.2** Reject non-local connections
- [ ] **6.1.3** Implement session token requirement after handshake
- [ ] **6.1.4** Implement request ID tracking
- [ ] **6.1.5** Implement heartbeat ping/pong
- [ ] **6.1.6** Enforce max payload size
- [ ] **6.1.7** Enforce per-tool timeout
- [ ] **6.1.8** Support command cancellation
- [ ] **6.1.9** Support protocol version negotiation
- [ ] **6.1.10** Structured logs with sensitive value redaction

### 6.2 Extension: Status & Policy

- [ ] **6.2.1** Create `extension/src/background/status.ts`
- [ ] **6.2.2** Create `extension/src/background/policy.ts`
- [ ] **6.2.3** Implement per-domain policy enforcement
- [ ] **6.2.4** Create `extension/src/background/trace.ts`
- [ ] **6.2.5** Implement action trace recording
- [ ] **6.2.6** Create `extension/src/content/redaction.ts`
- [ ] **6.2.7** Redact password fields, OTP, credit cards, SSNs from snapshots

### 6.3 Extension: UX Overlay (Later)

- [ ] **6.3.1** Create `extension/src/content/automationOverlay.ts`
- [ ] **6.3.2** Floating panel: "AI Bridge: Active | Current tool: fill | Pause | Stop"
- [ ] **6.3.3** Visual highlight before click with approve/deny
- [ ] **6.3.4** Sensitive action confirmation UI

### 6.4 Daemon: System Tools

- [ ] **6.4.1** Create `daemon/src/security/sessionAuth.ts`
- [ ] **6.4.2** Create `daemon/src/security/originPolicy.ts`
- [ ] **6.4.3** Create `daemon/src/tools/getBridgeStatus.ts`
- [ ] **6.4.4** Create `daemon/src/tools/setPolicy.ts`
- [ ] **6.4.5** Create `daemon/src/tools/startTrace.ts`
- [ ] **6.4.6** Create `daemon/src/tools/stopTrace.ts`
- [ ] **6.4.7** Create `daemon/src/tools/getLastTrace.ts`
- [ ] **6.4.8** Create `daemon/src/tracing/traceStore.ts`
- [ ] **6.4.9** Create `daemon/src/protocol/versionNegotiation.ts`

### 6.5 Testing

- [ ] **6.5.1** Test `get_bridge_status()` reports all sections
- [ ] **6.5.2** Test daemon rejects non-local connections
- [ ] **6.5.3** Test session token enforcement
- [ ] **6.5.4** Test heartbeat detects disconnect
- [ ] **6.5.5** Test trace recording captures action timeline
- [ ] **6.5.6** Test sensitive values redacted from logs

### 6.6 Documentation & Handoff

- [ ] **6.6.1** Update API-SPEC.md with Phase 6 APIs
- [ ] **6.6.2** Update README.md with security features
- [ ] **6.6.3** Commit Phase 6 code: `feat(phase6): daemon hardening, status, and UX polish`
- [ ] **6.6.4** Tag release: `v1.0.0`
- [ ] **6.6.5** Final acceptance checklist verification
- [ ] **6.6.6** Update this TODO.md with project completion

---

## 📝 Update Log

| Timestamp | Agent | Action |
|-----------|-------|--------|
| 2026-05-17 20:29 UTC | Kimi | Initial TODO.md created with full task breakdown |
| | | |

---

## 🆘 Emergency Contacts / Context

- **Repository:** https://github.com/efrg123/kimi-webbridge-internal
- **Main Plan:** See [PLAN.md](./PLAN.md)
- **Architecture:** See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **API Spec:** See [API-SPEC.md](./API-SPEC.md)
- **Migration:** See [MIGRATION.md](./MIGRATION.md)
- **Current bridge daemon port:** 127.0.0.1:10086
- **Extension version baseline:** v1.9.7

### Key Files in Source Repo (when implementation starts)

```
kimi-webbridge/
├── daemon/
│   ├── src/
│   │   ├── server/websocketServer.ts
│   │   ├── tools/
│   │   ├── protocol/
│   │   ├── security/
│   │   ├── state/
│   │   ├── tracing/
│   │   └── logging.ts
│   └── package.json
├── extension/
│   ├── src/
│   │   ├── background/
│   │   ├── content/
│   │   └── shared/
│   ├── manifest.json
│   └── package.json
└── README.md
```

---

*This is a living document. Update it every 10 minutes during implementation.*
