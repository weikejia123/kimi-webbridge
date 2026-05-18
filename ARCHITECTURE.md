# Kimi WebBridge v2.0 — System Architecture

> **Version:** v1.0  
> **Approach:** Chrome Extension + Local Daemon  
> **Constraint:** No CDP/WebDriver migration, no rewrite

---

## Design Philosophy

### The Shift

The current bridge (v1.x) is a **thin remote-control pipe**:

```
Agent sends raw command → Daemon forwards → Extension executes → Returns raw result
```

This is brittle because the agent must guess selectors, coordinates, and timing.

The new architecture (v2.x) is an **action runtime**:

```
Agent requests page state → Runtime observes → Agent chooses stable action → Runtime verifies → Returns structured delta
```

The content script becomes the intelligence layer. The daemon becomes a thin router.

### Core Principle

> **Do not make the daemon smarter by itself.**
> **Make the content script expose a stronger browser-control runtime.**

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI AGENT                                        │
│  (Kimi, ChatGPT, Claude, or any other AI agent)                             │
│                                                                              │
│  Uses tools: get_page_state(), click_ref(), submit_form(), etc.             │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ WebSocket JSON-RPC
                                │ (port 10086, 127.0.0.1 only)
┌───────────────────────────────▼─────────────────────────────────────────────┐
│                         LOCAL DAEMON                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  WebSocket Server                                                    │    │
│  │  - Binds to 127.0.0.1:10086                                          │    │
│  │  - Requires session token                                            │    │
│  │  - Heartbeat ping/pong                                               │    │
│  │  - Request ID tracking                                               │    │
│  │  - Max payload enforcement                                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Tool Registry v2                                                    │    │
│  │  - Schema validation                                                 │    │
│  │  - Route commands to extension                                       │    │
│  │  - Backward compat wrappers (snapshot→get_page_state, etc.)         │    │
│  │  - Timeout enforcement                                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Protocol Layer                                                      │    │
│  │  - v2 envelope (id, tool, args, timeout)                             │    │
│  │  - Standard response (ok, result, error, warnings, telemetry)       │    │
│  │  - Failure taxonomy (ELEMENT_NOT_FOUND, STALE_ELEMENT, etc.)        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  State Management                                                    │    │
│  │  - Tab element cache                                                 │    │
│  │  - Chunk session store                                               │    │
│  │  - Action history                                                    │    │
│  │  - Error history                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Security                                                            │    │
│  │  - Session auth                                                      │    │
│  │  - Origin policy                                                     │    │
│  │  - Sensitive value redaction                                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Tracing                                                             │    │
│  │  - Action timeline                                                   │    │
│  │  - Screenshot history                                                │    │
│  │  - Page state snapshots                                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ Extension Bridge Protocol
                                │ (Chrome extension native messaging)
┌───────────────────────────────▼─────────────────────────────────────────────┐
│                    CHROME EXTENSION SERVICE WORKER                           │
│                                                                              │
│  - Receives commands from daemon via native messaging / WebSocket          │
│  - Routes to correct tab via chrome.tabs.sendMessage()                     │
│  - Manages extension lifecycle (install, update, connect)                  │
│  - Handles status, policy, and trace aggregation                           │
│  - Maintains connection to daemon (reconnect on disconnect)                │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ tabs.sendMessage / runtime Port
                                │ (per-tab isolated communication)
┌───────────────────────────────▼─────────────────────────────────────────────┐
│              PER-TAB CONTENT-SCRIPT ACTION RUNTIME                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Element Registry                                                    │    │
│  │  - WeakMap<Element, ref>                                             │    │
│  │  - Map<ref, WeakRef<Element>>                                        │    │
│  │  - MutationObserver for invalidation                                 │    │
│  │  - Generation counter                                                │    │
│  │  - Fallback resolution (selector, textHash, rect)                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Name Inference Engine                                               │    │
│  │  - aria-label, aria-labelledby                                       │    │
│  │  - visible text, title, placeholder                                  │    │
│  │  - img alt, svg <title>                                              │    │
│  │  - data-testid, data-action                                          │    │
│  │  - class token heuristic (close, search, send, etc.)                │    │
│  │  - nearby text, tooltip, modal context                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Actionability Checker                                               │    │
│  │  - Exists in DOM                                                     │    │
│  │  - Visible                                                           │    │
│  │  - Enabled / not aria-disabled                                       │    │
│  │  - Non-zero bounding box                                             │    │
│  │  - Not covered by overlay (elementFromPoint)                         │    │
│  │  - In or scrollable to viewport                                      │    │
│  │  - Position stable (2 animation frames)                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Keyboard & Form Handler                                             │    │
│  │  - press_key with synthetic events                                   │    │
│  │  - key_combo parsing                                                 │    │
│  │  - submit_form with multi-strategy fallback                         │    │
│  │  - Contenteditable detection                                         │    │
│  │  - Native value setter for React/Vue/Angular                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Page State Observer                                                 │    │
│  │  - get_page_state() single-call observation                         │    │
│  │  - extract_text() with chunking                                     │    │
│  │  - Element scanning with limits                                      │    │
│  │  - Action inference                                                  │    │
│  │  - Error buffer (console errors)                                     │    │
│  │  - Network failure buffer                                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  DOM Stability & Diff                                                │    │
│  │  - waitForDomStable() with MutationObserver                         │    │
│  │  - Pre/post action diff                                              │    │
│  │  - URL change tracking                                               │    │
│  │  - Dialog detection                                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Safe Evaluation                                                     │    │
│  │  - Fresh function scope per call                                     │    │
│  │  - Timeout enforcement                                               │    │
│  │  - Safe serializer (depth, array, string limits)                    │    │
│  │  - Circular reference handling                                       │    │
│  │  - DOM node preview                                                  │    │
│  │  - Side effect tracking                                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Recovery & Diagnostics                                              │    │
│  │  - recover() summarizes page state                                  │    │
│  │  - Suggests next actions                                             │    │
│  │  - Reports recent errors                                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Visual Feedback (Phase 6)                                           │    │
│  │  - highlight() overlay                                               │    │
│  │  - Automation status panel                                           │    │
│  │  - Approval prompts                                                  │    │
│  │  - Redaction layer                                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────────────┐
│                         USER'S REAL BROWSER PAGE                             │
│                                                                              │
│  - Actual DOM                                                              │
│  - User login sessions                                                     │
│  - Cookies, localStorage                                                   │
│  - JavaScript frameworks (React, Vue, Angular)                             │
│  - Contenteditable editors (ProseMirror, Lexical, Slate, Quill)           │
│  - Shadow DOM                                                              │
│  - Iframes                                                                 │
│  - Infinite scroll, sticky headers, modals, date pickers                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. AI Agent Layer

The agent is the consumer. It should NOT:
- Guess raw CSS selectors
- Track element coordinates
- Manage timing manually
- Parse raw accessibility trees

The agent SHOULD:
- Call `get_page_state()` to understand the page
- Choose actions from `possibleActions` list
- Use stable `TargetRef` IDs
- Handle structured errors and recovery suggestions

### 2. Local Daemon Layer

**Responsibilities:**
- WebSocket server on `127.0.0.1:10086`
- Schema validation for all commands
- Tool registry with route dispatch
- Backward compatibility wrappers
- Request ID tracking and timeout enforcement
- Chunk session storage for large responses
- Security: session auth, origin policy
- Tracing: action timeline recording

**Key Design Decision:** The daemon stays thin. It validates, routes, and aggregates. It does NOT understand DOM semantics.

### 3. Extension Service Worker

**Responsibilities:**
- Maintain persistent connection to daemon
- Route commands to correct tab/frame
- Aggregate responses from content scripts
- Handle extension lifecycle events
- Manage status, policy, and trace state
- Reconnect on disconnect

**Manifest V3 Consideration:** Service workers are event-driven and can be terminated. For persistent WebSocket connections, consider using an offscreen document for the connection bridge.

### 4. Content-Script Action Runtime

This is the heart of v2. It runs in every tab where automation is active.

**Key Modules:**

| Module | Responsibility |
|--------|---------------|
| `elementRegistry.ts` | Persistent element refs, WeakMap/WeakRef, MutationObserver |
| `nameInference.ts` | Compute names for icon-only buttons |
| `selectorBuilder.ts` | Build stable CSS selectors |
| `elementResolver.ts` | Resolve TargetRef → Element with fallback |
| `actionability.ts` | Visibility, enabled, coverage, stability checks |
| `domStability.ts` | waitForDomStable with MutationObserver |
| `pageDiff.ts` | Pre/post action state comparison |
| `keyboard.ts` | press_key, key_combo with synthetic events |
| `formSubmit.ts` | Multi-strategy form submission |
| `fillNative.ts` | Native value setter for frameworks |
| `pageState.ts` | get_page_state single-call observation |
| `textExtractor.ts` | extract_text with chunking |
| `actionScanner.ts` | Infer possible actions from page |
| `browserErrorBuffer.ts` | Capture console errors |
| `networkFailureBuffer.ts` | Capture failed requests |
| `evaluateV2.ts` | Safe evaluation with fresh scope |
| `safeSerialize.ts` | Serializer with limits |
| `recover.ts` | Recovery report generation |
| `highlightOverlay.ts` | Visual element highlighting |
| `automationOverlay.ts` | Status panel (Phase 6) |
| `redaction.ts` | Sensitive field redaction |

### 5. User's Page Layer

The bridge operates on the user's real browser. This means:
- Real login sessions are available
- Real cookies and localStorage
- Real JavaScript frameworks running
- Real dynamic content (SPAs, infinite scroll)
- Real security boundaries (CORS, CSP, iframe restrictions)

The bridge must respect these boundaries and not break them.

---

## Data Flow Examples

### Example 1: Simple Form Submission (Current vs New)

**Current (v1.x):**
```
Agent: fill("#email", "user@example.com")
Agent: fill("#password", "secret")
Agent: click("#submit")  ← may fail if button is covered
Agent: ???               ← no verification if submission worked
```

**New (v2.x):**
```
Agent: get_page_state()
  → Returns: { elements: [...], possibleActions: [ { id: "A1", label: "Sign in", type: "submit", risk: "medium" } ] }

Agent: fill({ ref: "el_5" }, "user@example.com")
  → Returns: { success: true, diff: { valueChanged: true } }

Agent: fill({ ref: "el_6" }, "secret")
  → Returns: { success: true, diff: { valueChanged: true } }

Agent: submit_form({ target: "el_5", verify: { type: "url_changed" } })
  → Returns: { success: true, strategyUsed: "requestSubmit", diff: { urlChanged: true } }
```

### Example 2: ChatGPT Message (Current vs New)

**Current (v1.x):**
```
Agent: fill("#prompt-textarea", "Hello")
Agent: evaluate("document.querySelector('button').click()")  ← brittle
Agent: ???  ← did it send?
```

**New (v2.x):**
```
Agent: get_page_state()
  → Returns: { elements: [ { ref: "el_3", role: "combobox", name: "Message" }, { ref: "el_7", role: "button", inferredName: "Send", confidence: 0.82 } ] }

Agent: fill({ ref: "el_3" }, "Hello")
Agent: submit_form({ target: "el_3", verify: { type: "text_visible", text: "Hello" } })
  → Returns: { success: true, strategyUsed: "nearby-submit", diff: { newText: ["Hello"] } }
```

### Example 3: Recovery from Stale Element

**New (v2.x):**
```
Agent: click_ref({ ref: "el_12" })
  → Returns: { success: false, error: { code: "STALE_ELEMENT", recoverable: true, suggestedNextTools: ["find_element", "get_page_state"] } }

Agent: find_element({ text: "Add to cart" })
  → Returns: { ref: "el_45", confidence: 0.95 }

Agent: click_ref({ ref: "el_45" })
  → Returns: { success: true }
```

---

## Communication Protocols

### Daemon ↔ Extension

- **Transport:** Native messaging or WebSocket (depending on extension architecture)
- **Format:** JSON-RPC 2.0 or custom v2 envelope
- **Authentication:** Session token after initial handshake
- **Heartbeat:** Ping/pong every 30 seconds
- **Max payload:** 10MB default

### Extension Service Worker ↔ Content Script

- **Transport:** `chrome.tabs.sendMessage()` or `runtime.Port`
- **Format:** Same v2 envelope
- **Scope:** Per-tab, per-frame
- **Error handling:** Tab not found, frame not found, content script not injected

### Content Script ↔ Page

- **Transport:** Direct DOM manipulation
- **Isolation:** Content scripts run in an isolated world by default (does not conflict with page JS)
- **MAIN world injection:** Only for `evaluate_v2(world: "main")`, disabled by default

---

## Security Model

### Threats

1. **Unauthorized localhost access:** Any process on the machine can connect to port 10086
2. **Sensitive data exposure:** Screenshots and page content may contain passwords, personal data
3. **Malicious action execution:** Agent could submit forms, make purchases, delete data
4. **Credential theft:** Agent could read session cookies or tokens via evaluate

### Mitigations

| Threat | Mitigation |
|--------|-----------|
| Unauthorized access | Session token, origin checks, bind to 127.0.0.1 |
| Data exposure | Redaction layer, domain-level policies, local-only mode |
| Malicious actions | Approval prompts for sensitive actions, risk scoring |
| Credential theft | Evaluate disabled by default, restricted to approved domains |
| Session hijacking | No direct cookie access, operates via visible DOM only |

### Permission Model

Capabilities are split, not monolithic:
- `read_page` — observe page state
- `take_screenshot` — capture visible area
- `click` — click elements
- `type` — fill inputs
- `submit_forms` — submit forms
- `evaluate_js` — run JavaScript (disabled by default)
- `access_sensitive_domains` — banking, health, etc. (denied by default)

---

## Performance Considerations

### Snapshot Size

- Accessibility trees on large pages can exceed 1MB
- `get_page_state()` limits: max 300 elements, 160 chars per element by default
- Chunked responses with cursor pagination for large content

### DOM Observation

- MutationObserver on `document` with `subtree: true` can be expensive
- Use targeted observation when possible
- Batch mutations and debounce processing

### Evaluation Safety

- Wrap in fresh scope to avoid memory leaks
- Cap result size before serialization
- Timeout enforcement to prevent infinite loops

### Network

- Chunk large responses over WebSocket
- Binary screenshot streaming instead of base64 inline
- Request cancellation support

---

## Error Handling Strategy

### Failure Taxonomy

All errors use structured codes:

| Code | Meaning | Recoverable? |
|------|---------|--------------|
| `ELEMENT_NOT_FOUND` | Target element does not exist | Yes (find_element) |
| `STALE_ELEMENT` | Element was removed or changed | Yes (find_element) |
| `ELEMENT_NOT_VISIBLE` | Element exists but is not visible | Yes (scroll, wait) |
| `ELEMENT_COVERED` | Another element is on top | Yes (click overlay, scroll) |
| `ELEMENT_DISABLED` | Element is disabled | Yes (wait, alternative) |
| `NO_FORM_FOUND` | No form or submit button found | Yes (press_key) |
| `NAVIGATION_TIMEOUT` | Page did not load in time | Yes (retry) |
| `DOM_STABLE_TIMEOUT` | Page kept changing | Yes (proceed with caution) |
| `EVALUATION_ERROR` | JS syntax or runtime error | Yes (fix code) |
| `SNAPSHOT_TOO_LARGE` | Page state exceeds max size | Yes (use chunks) |
| `PERMISSION_DENIED` | Action blocked by policy | No (user must approve) |
| `USER_INTERVENTION_REQUIRED` | CAPTCHA, OTP, etc. | No (handoff to user) |

### Recovery Flow

```
Action fails with recoverable error
    ↓
Agent calls recover()
    ↓
Returns: current page state + recent errors + possible next actions
    ↓
Agent chooses recovery strategy (find_element, wait_for, press_key, etc.)
    ↓
Retry or escalate
```

---

## Extension Lifecycle

### Installation

1. User installs extension from Chrome Web Store or unpacked
2. Extension connects to daemon via WebSocket
3. Daemon validates extension version
4. Pairing code displayed for first-time agent connection

### Tab Activation

1. Agent sends command with tabId
2. Daemon routes to extension service worker
3. Service worker checks if content script is injected
4. If not injected, injects content script into tab
5. Content script initializes ElementRegistry and observers
6. Command executes and returns

### Disconnect/Reconnect

1. Extension detects daemon disconnect
2. Shows "Connection lost" in overlay
3. Attempts reconnect with exponential backoff
4. On reconnect, re-registers capabilities
5. Agent can continue from last known state

---

## Future Considerations (Post-v1.0)

- CDP adapter for advanced debugging scenarios
- WebDriver BiDi adapter for cross-browser support
- Playwright-style tracing with video recording
- Multi-tab coordination
- Offline mode (queue commands, execute when connected)
- Team/enterprise admin dashboard

---

*Architecture designed by Kimi and ChatGPT via collaborative discussion.*  
*Date: 2026-05-17*
