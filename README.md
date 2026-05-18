# Kimi WebBridge v2.0 — Internal Planning & Implementation

> **Status:** Planning Complete | **Ready for Implementation**
>
> This repository contains the agreed-upon detailed implementation plan for improving the Kimi WebBridge browser automation system.

---

## Quick Links

| Document | Purpose |
|----------|---------|
| [PLAN.md](./PLAN.md) | Full 6-phase implementation roadmap |
| [TODO.md](./TODO.md) | Actionable todo list with checkboxes |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture and component design |
| [API-SPEC.md](./API-SPEC.md) | Complete API specification with TypeScript types |
| [MIGRATION.md](./MIGRATION.md) | Non-breaking migration strategy from v1 to v2 |

---

## The Problem

The current Kimi WebBridge (v1.x) is a thin remote-control pipe over a Chrome extension + local daemon. It works for basic navigation but suffers from critical reliability issues:

- **No key events:** Cannot press Enter, Tab, Escape, or keyboard shortcuts
- **Brittle form submission:** No native submit_form() — requires ad-hoc workarounds
- **Shared JS scope:** `evaluate()` throws `SyntaxError: already declared` on repeated calls
- **Truncated snapshots:** Large pages get cut off; extracting full text requires Python workarounds
- **Fragile targeting:** Icon-only buttons (like ChatGPT's send button) are nearly impossible to click reliably
- **No verification:** Actions return "clicked" without confirming the page actually changed
- **No security boundary:** Any localhost process can connect to port 10086

## The Solution

Transform the bridge from a **thin remote-control pipe** into a **smart browser action runtime**.

The content script does the heavy lifting (element tracking, verification, recovery), so the AI agent gets:
- Fewer brittle primitives
- Fewer round-trips
- Better recovery
- Much more reliable control of the user's real browser

## Core Principle

> **The bridge should constantly convert the live page into this loop:**
>
> `observe page → list possible actions → act on stable TargetRef → verify result → return structured delta`

## Architecture Overview

```
AI Agent
  ↓ WebSocket JSON-RPC
Local Daemon (127.0.0.1:10086)
  ↓ Extension Bridge Protocol
Chrome Extension Service Worker
  ↓ tabs.sendMessage / runtime Port
Per-Tab Content-Script Action Runtime
  ↓ DOM / Events / MutationObserver
User's Real Browser Page
```

## Version Roadmap

| Version | Deliverable |
|---------|-------------|
| 0.5.x | Current bridge (baseline) |
| 0.6.0 | Phase 1: Primitives + v2 envelope |
| 0.7.0 | Phase 2: Safe evaluation |
| 0.8.0 | Phase 3: Unified observation + text extraction |
| 0.9.0 | Phase 4: Element registry + targeting |
| 1.0.0 | Phase 5: Reliability layer + Phase 6: Hardening |
| 1.1.0 | Overlay, policy, trace polish |

## Final Tool Surface (v1.0)

### Observation
`get_page_state()` · `extract_text()` · `get_full_text()` · `query_elements()` · `find_element()` · `list_actions()` · `describe_element()`

### Action
`focus()` · `press_key()` · `key_combo()` · `click_ref()` · `fill()` · `submit_form()` · `select_option()` · `wait_for()`

### Evaluation / Debug
`evaluate_v2()` · `screenshot()` · `highlight()` · `recover()`

### System
`get_bridge_status()` · `set_policy()` · `start_trace()` · `stop_trace()` · `get_last_trace()` · `pause_automation()` · `resume_automation()` · `request_user_approval()`

---

## Contributors

- **Kimi (AI Agent)** — Hands-on testing, pain-point identification, refinement proposals
- **ChatGPT** — Architecture review, phased plan design, API specification
- **User (efrg123)** — Requirements, approval, and direction

---

*Last updated: 2026-05-17*
