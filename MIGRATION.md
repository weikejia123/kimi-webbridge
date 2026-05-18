# Kimi WebBridge v2.0 — Migration Strategy

> **Principle:** Do not break existing agents.  
> **Compatibility Window:** Old API supported through v1.1.x  
> **Breaking Removal:** No earlier than v1.2.0

---

## Migration Philosophy

The v2.0 upgrade is designed as an **evolution, not a revolution**. Existing agents should continue working without modification while gaining access to new capabilities.

Key principles:
1. **Backward compatibility by default** — All v1 tools continue to work
2. **Graceful deprecation** — Warnings inform agents about better alternatives
3. **Capability discovery** — Agents can query what's available before using it
4. **Thin wrappers** — Old tools delegate to new implementations

---

## Version Timeline

| Version | Phase | What's New | Old API Status |
|---------|-------|-----------|----------------|
| 0.5.x | Baseline | Current bridge | Active |
| 0.6.0 | Phase 1 | press_key, submit_form, focus, wait_for, v2 envelope | Active + warnings |
| 0.7.0 | Phase 2 | evaluate_v2 with safe scope | Active + warnings |
| 0.8.0 | Phase 3 | get_page_state, extract_text, get_full_text | Active + warnings |
| 0.9.0 | Phase 4 | Element registry, click_ref, find_element | Active + warnings |
| 1.0.0 | Phase 5+6 | Reliability layer, hardening, status | Active + warnings |
| 1.1.0 | Polish | Overlay, policy, trace polish | Active + warnings |
| 1.2.0 | Cleanup | — | **Wrappers removed** |

---

## Tool-by-Tool Migration

### `snapshot()` → `get_page_state()`

**Current behavior:** Returns accessibility tree, often truncated on large pages.

**New behavior:** `snapshot()` becomes a thin wrapper:
```typescript
function snapshot(args?: SnapshotArgs): SnapshotResult {
  const state = get_page_state({
    mode: "interactive",
    maxElements: args?.maxNodes ?? 300,
    ...args
  });
  
  return {
    ...legacyFormat(state),
    warnings: [{
      code: "DEPRECATED_TOOL",
      message: "snapshot() is deprecated. Use get_page_state() instead."
    }]
  };
}
```

**Migration path for agents:**
1. Today: Keep using `snapshot()` — it works
2. v0.8.0+: Try `get_page_state()` for richer data
3. v1.2.0: Must use `get_page_state()`

---

### `evaluate()` → `evaluate_v2()`

**Current behavior:** Runs code at top level. Repeated `const`/`let` declarations throw `SyntaxError`.

**New behavior:** `evaluate()` wraps `evaluate_v2()`:
```typescript
function evaluate(args: EvaluateArgs): EvaluateResult {
  return evaluate_v2({
    code: args.code,
    mode: "function-body",
    world: "isolated",
    timeoutMs: args.timeoutMs,
    returnMode: "json",
    warnings: [{
      code: "DEPRECATED_TOOL",
      message: "evaluate() is deprecated. Use evaluate_v2() for safe scope isolation."
    }]
  });
}
```

**Migration path for agents:**
1. Today: Keep using `evaluate()` — no more redeclaration errors
2. v0.7.0+: Use `evaluate_v2()` for explicit control over mode/world/timeouts
3. v1.2.0: Must use `evaluate_v2()`

---

### `click(x, y, selector)` → `click_ref()`

**Current behavior:** Accepts raw coordinates or CSS selectors. Fragile when page changes.

**New behavior:** `click()` resolves to `click_ref()`:
```typescript
function click(args: ClickArgs): ClickResult {
  let target: TargetRef;
  
  if (args.selector) {
    const found = find_element({ selector: args.selector, limit: 1 });
    target = found.elements[0]?.ref ?? { selector: args.selector };
  } else if (args.x !== undefined && args.y !== undefined) {
    target = { ref: resolveElementAtPoint(args.x, args.y) };
  }
  
  return click_ref({
    target,
    verify: args.verify,
    warnings: [{
      code: "DEPRECATED_TOOL",
      message: "click() with coordinates/selectors is deprecated. Use click_ref() with stable refs."
    }]
  });
}
```

**Migration path for agents:**
1. Today: Keep using `click()` — it now verifies actionability
2. v0.9.0+: Use `get_page_state()` → get `ref` → `click_ref({ ref })`
3. v1.2.0: Must use `click_ref()`

---

### `fill(selector, value)` → `fill(target, value)`

**Current behavior:** Takes raw selector. May fail on dynamic content.

**New behavior:** `fill()` resolves to new `fill()`:
```typescript
function fill(args: FillArgs): FillResult {
  const found = find_element({ selector: args.selector, limit: 1 });
  const target = found.elements[0]?.ref ?? { selector: args.selector };
  
  return fill_v2({
    target,
    value: args.value,
    clear: true,
    warnings: [{
      code: "DEPRECATED_TOOL",
      message: "fill() with selectors is deprecated. Use fill() with TargetRef."
    }]
  });
}
```

**Migration path for agents:**
1. Today: Keep using `fill()` — it now uses native setters for framework compatibility
2. v0.9.0+: Use `get_page_state()` → get `ref` → `fill({ ref }, value)`
3. v1.2.0: Must use `fill()` with TargetRef

---

### `navigate()` — Maintained

`navigate()` keeps its existing implementation but returns the v2 response envelope.

No migration needed.

---

### `screenshot()` — Maintained

`screenshot()` keeps its existing implementation but returns the v2 response envelope.

No migration needed.

---

## Response Format Changes

### v1 Response (Old)

```json
{
  "ok": true,
  "data": {
    "url": "https://example.com",
    "title": "Example"
  }
}
```

### v2 Response (New)

```json
{
  "v": "2.0",
  "id": "cmd_001",
  "ok": true,
  "tool": "get_page_state",
  "result": {
    "page": { "url": "https://example.com", "title": "Example" }
  },
  "error": null,
  "warnings": [],
  "telemetry": {
    "durationMs": 42,
    "urlBefore": "https://example.com",
    "urlAfter": "https://example.com"
  }
}
```

### Backward Compatibility

Old tools return v2 envelopes with additional `data` field for v1 compatibility:

```json
{
  "v": "2.0",
  "id": "cmd_001",
  "ok": true,
  "tool": "navigate",
  "result": { "url": "https://example.com" },
  "data": { "url": "https://example.com" },
  "error": null,
  "warnings": [{
    "code": "DEPRECATED_ENVELOPE",
    "message": "v1 envelope format is deprecated. Expect v2 format in future versions."
  }],
  "telemetry": { "durationMs": 120 }
}
```

---

## Capability Discovery

Agents should check capabilities before using new tools:

```typescript
const status = await get_bridge_status();

if (status.capabilities.get_page_state) {
  // Use new API
  const state = await get_page_state();
} else {
  // Fall back to old API
  const snapshot = await snapshot();
}
```

This pattern allows agents to work across multiple bridge versions gracefully.

---

## Breaking Changes (v1.2.0)

The following will be removed in v1.2.0:

| Removed | Replacement |
|---------|-------------|
| `snapshot()` | `get_page_state()` |
| `evaluate()` | `evaluate_v2()` |
| `click(x, y)` | `click_ref()` |
| `fill(selector, value)` | `fill({ ref }, value)` |
| v1 response envelope | v2 response envelope |

---

## Testing Migration

### Test Matrix

| Test | v1 API | v2 API | Expected Result |
|------|--------|--------|-----------------|
| Basic navigation | `navigate(url)` | `navigate(url)` | Both work |
| Form fill | `fill("#email", val)` | `fill({ ref }, val)` | Both work |
| Form submit | `click("#submit")` | `submit_form()` | Both work, v2 more reliable |
| Page observation | `snapshot()` | `get_page_state()` | v2 richer data |
| Text extraction | `evaluate("document.body.innerText")` | `get_full_text()` | v2 safer, no truncation |
| Key press | `evaluate("dispatchEvent(...)")` | `press_key("Enter")` | v2 native support |

### Compatibility Tests

Before each release:
1. Run full v1 test suite against new version
2. Verify all v1 tests pass
3. Verify deprecation warnings are present
4. Verify v2 tests pass
5. Verify capability discovery works

---

## Rollback Strategy

If a critical issue is found after release:

1. **Extension rollback:** Chrome Web Store supports percentage rollouts. Roll back to previous version.
2. **Daemon rollback:** Keep previous daemon binary. Swap symlink or restart service.
3. **Agent fallback:** Agents that use capability discovery automatically fall back to v1 APIs.

---

*Migration strategy designed for zero-downtime, non-breaking evolution.*  
*Date: 2026-05-17*
