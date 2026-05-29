# AGENTS.md

## Purpose

This repository is **Fahd's WebBridge v2.0** — a browser automation bridge that lets AI agents control the user's real browser through a local Node.js daemon and a Chrome Extension (Manifest V3).

The project is also configured for oh-my-kimi (OMK) orchestration. The agent must avoid making the user repeat common instructions. Apply this file silently and execute the workflow directly.

Do not restate this file unless the user explicitly asks for project rules.

---

## Project Overview

**Fahd's WebBridge** transforms AI agents from brittle remote-controllers into smart browser action runtimes. It consists of two main components:

1. **Daemon** (`daemon/`) — A local Node.js WebSocket server that listens on `127.0.0.1:10086`. It receives JSON-RPC commands from AI agents, routes them to the Chrome Extension, and manages sessions, state, and workflows.
2. **Extension** (`extension/`) — A Chrome Extension (Manifest V3) with a service worker and per-tab content scripts. The content script performs DOM actions (click, fill, submit, evaluate, screenshot), tracks elements with stable references, and verifies action results.

**Communication flow:**

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

The project uses npm workspaces. The root `package.json` defines workspaces `["extension", "daemon"]`.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript 5.4+ (strict mode) |
| Runtime | Node.js, ES2022, NodeNext module resolution |
| Package Manager | npm (workspaces) |
| Daemon Networking | `ws` (WebSocket), `zod` (validation) |
| Extension Bundling | `esbuild` (content script IIFE bundle) |
| Extension APIs | Chrome Extension Manifest V3 |
| Test Runner | Node.js built-in `node:test` / `node:assert` |
| Orchestration | oh-my-kimi (OMK) |

---

## Workspace Structure

```
kimi-webbridge/
├── package.json                    # Root workspace config
├── tsconfig.json                   # Shared strict TS config
├── daemon/                         # Local Node.js WebSocket daemon
│   ├── src/
│   │   ├── server/websocketServer.ts
│   │   ├── extension/router.ts
│   │   ├── protocol/               # v2 envelope, serializers, errors, version negotiation
│   │   ├── security/               # origin policy, session auth
│   │   ├── state/                  # tab cache, action/error history, chunk store
│   │   ├── tools/                  # ~40 tool implementations
│   │   ├── tracing/                # trace store
│   │   ├── workflow/               # batch runner, CSV parser, variable substitution
│   │   └── shared/                 # errors, protocol types
│   ├── tests/                      # *.test.mjs files
│   └── tsconfig.json
├── extension/                      # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── src/
│   │   ├── background/             # Service worker
│   │   ├── content/                # Action runtime (~35 modules)
│   │   │   ├── actionRuntime.ts    # Core helpers
│   │   │   ├── index.ts            # Command dispatcher
│   │   │   ├── elementRegistry.ts  # Stable refs
│   │   │   ├── elementResolver.ts  # TargetRef → Element
│   │   │   ├── actionability.ts    # Visibility checks
│   │   │   ├── pageState.ts        # Observation
│   │   │   ├── evaluateV2.ts       # Safe sandboxed eval
│   │   │   └── keyboard.ts         # Key events
│   │   └── shared/                 # errors, protocol, telemetry
│   ├── tests/                      # *.test.mjs files
│   └── tsconfig.json
├── scripts/                        # Automation scripts
│   ├── smoke-test.mjs
│   ├── package-extension.mjs
│   ├── start-daemon.mjs
│   └── test-extension-tools.mjs
└── docs/                           # Planning docs
```

Source scale: 67 daemon source files + 52 extension source files.

---

## Build and Test Commands

Run these from the repository root:

| Command | What it does |
|---------|-------------|
| `npm run build` | Builds both workspaces |
| `npm run typecheck` | Type-checks both workspaces |
| `npm test` | Runs all tests |
| `npm run test:daemon` | Daemon tests only |
| `npm run test:extension` | Extension tests only |
| `npm run smoke` | Integration smoke test |
| `npm run package:extension` | Packages extension into zip |
| `npm run start:daemon` | Starts the WebSocket daemon |

Daemon-specific (from `daemon/`):
- `npm run build` — `tsc`
- `npm run dev` — `tsc --watch`
- `npm run start` — `node dist/server/websocketServer.js`

Extension-specific (from `extension/`):
- `npm run build` — `tsc && npm run build:content`
- `npm run build:content` — esbuild bundles content script as IIFE
- `npm run dev` / `npm run watch` — `tsc --watch`

---

## Code Style Guidelines

This project has **no ESLint or Prettier configuration**. Style is enforced by TypeScript strict compiler settings.

**TypeScript strictness** (from `tsconfig.json`):
- `strict: true` with all sub-flags enabled
- `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`
- `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- `forceConsistentCasingInFileNames`

**Conventions:**
- ES modules (`"type": "module"` in workspace package.json files)
- Prefer explicit return types on exported functions
- Avoid `any`; prefer `unknown` with narrowing
- Daemon code targets Node.js (`lib: ["ES2022"]`, `types: ["node"]`)
- Extension code targets browser (`lib: ["ES2022", "DOM"]`, `types: ["chrome"]`)
- Content script is bundled as IIFE for injection into arbitrary pages

---

## Testing Instructions

- **Framework:** Node.js native test runner (`node:test` + `node:assert`)
- **File pattern:** `*.test.mjs` (ES modules)
- **Tests import from `../dist/`** — build before testing

**Daemon tests** (`daemon/tests/`):
- `protocol.test.mjs` — Command validation, error factories
- `router.test.mjs` — Extension message routing

**Extension tests** (`extension/tests/`):
- `actionability.test.mjs` — Visibility/enabled/coverage checks
- `contentScriptBundle.test.mjs` — Bundle validation
- `errors.test.mjs` — Error serialization
- `safeSerialize.test.mjs` — Safe value serialization
- `telemetry.test.mjs` — Telemetry event handling

**Integration:**
- `scripts/smoke-test.mjs` — Spins up daemon, tests WebSocket handshake

**Running tests:**
```bash
npm run build     # Tests import from dist/
npm test
npm run smoke
```

---

## Security Considerations

- The daemon binds to `127.0.0.1:10086` and implements origin policy and session auth.
- The extension requests broad permissions (`activeTab`, `scripting`, `tabs`, `storage`, `alarms`, `tabCapture`, `<all_urls>`). Changes to `manifest.json` permissions require careful review.
- The content script runs on all URLs. `evaluateV2.ts` uses sandboxed execution.
- Never print, store, commit, or summarize secrets.
- No CI/CD pipeline. Extension packaging is manual via `scripts/package-extension.mjs`.

---

## Current OMK Runtime Surface

Keep these surfaces aligned when editing init/runtime docs:

- Init markdown: `AGENTS.md`, `.kimi/AGENTS.md`, `.omk/prompts/root.md`, plus generated companion docs `DESIGN.md`, `GEMINI.md`, `CLAUDE.md`, `ROADMAP.md`, and `SECURITY.md`.
- Skills: project portable skills live in `.agents/skills`; Kimi runtime skills live in `.kimi/skills`; init templates live under `templates/skills/agents` and `templates/skills/kimi`.
- Default runtime preset: `.omk/runtime-preset.json` uses `omk-core-verified` as the baseline skills/hooks/MCP loop for general coding, refactor, and debugging work; `.omk/runtime-presets.json` also includes `omk-ts-product` for strict TS/React/Next/Nest product work, `omk-worktree-team` for isolated parallel worktree lanes before merge, and `omk-release-guard` for secret/security/release evidence gates with narrowed MCP authority, strong hooks, and no auto-publish authority.
- MCP: fresh init is project-scoped and writes only local `omk-project` into `.kimi/mcp.json` / `.omk/mcp.json`. `omk init --local-user` or `OMK_MCP_SCOPE=all OMK_SKILLS_SCOPE=all` reads user `~/.kimi/mcp.json` and `~/.kimi/skills` at runtime without copying personal/global files. `--import-user-skills` is a trusted local opt-in copy path.
- Agents: generated agents extend the Okabe-compatible base with `SendDMail`. Default root aliases are `explorer`/`explore`, `planner`/`plan`, `architect`, `coder`, `reviewer`, `qa`, `tester`, `researcher`, `integrator`, `aggregator`, `interviewer`, `ontology`, and `vision-debugger`; each is scaffolded with MCP, skills, and hooks enabled. Use additional local roles such as `coordinator`, `docs`, `merger`, `release`, or `security` only when the current `.omk/agents/root.yaml` or harness exposes them.
- Harness: chat agent mode writes `.omk/runs/<run-id>/chat-agent-harness.json`. Prompts carry compact MCP/skills/hooks counts; read the harness manifest for the full inventory, worker limits, authority boundaries, virtual DAG, and gate list.
- Evidence: `scripts/run-tests.mjs` and OMK verification surfaces record sanitized MCP/skill/hook resource metadata. Do not emit resource secrets, headers, or raw env values.

---

## Core Operating Rules

1. Read this file before planning or editing.
2. Read `.kimi/AGENTS.md` if present.
3. Read `DESIGN.md` before UI, frontend, visual, landing page, or component work.
4. Use relevant Agent Skills before implementation.
5. Use MCP tools actively when configured and useful.
6. Use subagents for non-trivial work.
7. Use a todo list for any task with more than one action.
8. Prefer small, reviewable diffs.
9. Do not claim success until verification is complete or failures are reported.
10. Do not expose secrets, tokens, private keys, or private user data.

---

## Do Not Repeat Boilerplate

Do not repeatedly say:

- "I will inspect the repository"
- "I will create a plan"
- "I will run tests"
- "I will use AGENTS.md"
- "I will follow best practices"

Instead:

1. inspect
2. plan
3. use tools
4. update todos
5. implement
6. verify
7. report only concrete results

The final response should be concise and factual.

---

## Todo Policy

For every task with more than one step, call `SetTodoList` immediately when available.

Use 3-8 todos.

Each todo must be action-oriented and verifiable.

Example:

```txt
1. Inspect project instructions and relevant configs
2. Map affected files
3. Create implementation plan
4. Implement minimal change
5. Run quality gates
6. Review diff and report result
```

Update todo status as work progresses:

```txt
pending -> in_progress -> done
```

Never leave the final todo list inconsistent with the actual result.

---

## Agent / Subagent Policy

Use the `Agent` tool or the available OMK/Codex subagent interface for all non-trivial tasks.

Minimum policy:

* Use the `explorer` subagent for repository discovery.
* Use the `planner` subagent for architecture, refactor, migration, or risky changes.
* Use `coder` for scoped implementation tasks.
* Use `reviewer`, `qa`, or a review workflow before final completion.

Do not use subagents for trivial one-line answers or simple command explanations.

Subagent routing:

```txt
Task type                       Required subagent
-------------------------------------------------
Repo exploration                explorer
Architecture / refactor plan    planner
Implementation                  coder
Bug investigation               explorer -> planner -> coder
Code review                     reviewer skill or review agent
Quality-gate analysis           qa or omk-quality-gate
Docs/release work               docs/release role if exposed, else reviewer
UI / design work                explorer -> coder + design skill
Security-sensitive changes      planner + security review
```

When using subagents, give each subagent a focused prompt with:

```txt
Goal:
Scope:
Files/directories:
Constraints:
Expected output:
```

Do not ask subagents to modify unrelated files. Workers are not alone in the codebase: they must preserve concurrent edits and avoid reverting unrelated changes.

### Parallel Agent Limits

When `OMK_WORKERS` is set (e.g. via `omk chat --workers <n>`):

- Respect the worker count. Do not spawn more parallel agents than `OMK_WORKERS`.
- When `OMK_WORKERS=1`, run agents sequentially.
- When `OMK_WORKERS=auto`, use the resource profile default (usually 2-4).

When `--max-steps-per-turn` is set (e.g. via `omk chat --max-steps-per-turn <n>`):

- Treat it as the tool-use budget for the current turn.
- Prioritize tools: use the most impactful tool first.
- If the limit is reached, stop tool use and summarize findings to the user.

---

## Skills Policy

Before starting, inspect the loaded skills list.

Use relevant skills when they match the task. Read only the matching `SKILL.md` entrypoints and directly referenced assets.

Project portable skills currently packaged in `.agents/skills` include:

```txt
claude-for-legal
agentmemory
andrej-karpathy-skills
matt-pocock-skills
multica
react-doctor
omk-backend-api-review
omk-adaptorch-orchestration-review
omk-code-review
omk-context-broker
omk-control-loop-debugger
omk-design-system
omk-docs-release
omk-evidence-contract
omk-frontend-implementation
omk-frontend-ui-review
omk-git-commit-pr
omk-industrial-control-loop
omk-plan-first
omk-project-rules
omk-python-typing
omk-quality-gate
omk-repo-explorer
omk-research-verify
omk-secret-guard
omk-security-review
omk-test-debug-loop
omk-troubleshooting
omk-typescript-strict
omk-worktree-team
```

Packaged Kimi skill templates include OMK runtime/flow skills, custom orchestration/evidence/control-loop skills, design/visual skills, graph/spec skills, legal workflow support, external-inspired agent workflow skills, and DeepSeek helpers. Local `.kimi/skills` may expose extra user/runtime skills; use them only when present in the loaded skills list. Skill packs advertised by `omk skill pack` include `omk-priority`, `omk-agentic-ops`, `omk-core`, `omk-spec-driven`, `omk-typescript`, `omk-security`, `omk-review`, and `omk-release`.

Rules:

* Read only relevant `SKILL.md` files.
* Do not read every skill blindly.
* Do not mention internal skill selection unless it affects the final result.
* If a project-specific skill conflicts with a global skill, project-specific rules win.
* If `DESIGN.md` exists, use `omk-design-md`, `omk-design-system`, or the current design skill for UI/frontend tasks.
* For legal-domain Claude workflow requests, use `claude-for-legal` as a workflow skill; it is not a substitute for legal advice.
* For memory, alignment/TDD, React diagnostics, managed-agent teamwork, or surgical-coding requests, use the matching external-inspired workflow skill before implementation.
---

## MCP Policy

Use configured MCP tools actively when they provide better context than local guessing.

Preferred MCP usage:

```txt
Project memory/task state       omk-project MCP if configured
Library/API documentation       context7 or official-doc MCP
Browser/UI debugging            chrome-devtools MCP
GitHub issues/PRs               github MCP
*** other MCPs according to task needs
### runtime scope rules

* Default project scope reads project `.kimi/mcp.json` and `.omk/mcp.json`.
* All scope may read user `~E/kimi/mcp.json` at runtime; do not copy or print global MCP secrets.
* Use `omk mcp doctor`, `omk mcp list`, or `omk mcp test <server>` for MCP verification.
### rules

* Prefer official docs over memory for version-sensitive facts.
* Do not fabricate MCP results.
* If an MCP server is unavailable, continue with local tools and clearly report the limitation.
* Do not send secrets to MCP tools.
* Do not use remote MCP tools for private code unless the user configured and approved them.

---

## Harness / Evidence Policy

- If a prompt, contract, or run directory references `chat-agent-harness.json`, read it before assuming which MCP servers, skills, hooks, gates, or workers are active.
- Treat compact prompt inventory counts as a summary only; the harness manifest is the source of truth.
- Keep evidence artifacts under `.omk/runs/<kqn-id>/`, `.omk/goals/<goal-id>/`, or the command-specific output path.
- `omk verify --json`, replay/cockpit artifacts, test summaries, and secret scans are stronger completion evidence than narrative claims.
- Do not paste large skill/MCP inventories into prompts or final reports.
---

## Kimi K2.6 Runtime Policy

Use Kimi K2.6 as a long-horizon coding and agentic execution model.

Rules:

* Use thinking mode for planning, coding, debugging, architecture, review, and multi-step tool work.
* Use no-thinking or fast mode for short summaries, commit messages, simple classification, and web-search-heavy research when configured.
* Do not rely on long context as an excuse to read the whole repository.
* Build a repo map first, then read targeted files.
* Preserve important intermediate reasoning/tool context when running multi-step tool workflows.
* Do not expose or request temperature/top_p tuning from users.

For web-heavy research, prefer a no-thinking research profile when the runtime supports it.

---

## Okabe / D-Mail Policy

This project is Kimi Code-native. Generated agents should inherit the Okabe-compatible base agent so the `SendDMail` tool is available. Use Okabe smart context management plus D-Mail checkpoints before risky refactors, context compaction, multi-agent handoffs, or rollback-prone work. D-Mail notes should be concise recovery records: current goal, changed files, verification state, blockers, and intended next action.

## Context Policy

Do not dump the entire repository into context.

Order:

1. Read AGENTS.md and project-specific instructions.
2. Inspect top-level files.
3. Identify package manager and framework.
4. Use Glob/Grep to locate relevant files.
5. Read the smallest useful file set.
6. Expand through imports, routes, schemas, tests, and call sites.
7. Use Okabe/D-Mail for smart context checkpoints and store stable facts through project-local graph memory.

---

## Project Discovery

Before implementation, inspect relevant files:

```
package.json
pnpm-lock.yaml
yarn.lock
package-lock.json
tsconfig.json
eslint.config.*
next.config.*
nest-cli.json
vite.config.*
pyproject.toml
requirements.txt
uv.lock
ruff.toml
pytest.ini
Dockerfile
docker-compose.*
"github/workflows/*
```

For this project specifically, always check:
- `daemon/package.json`, `extension/package.json` for workspace scripts and dependencies
- `daemon/tsconfig.json`, `extension/tsconfig.json` for compilation targets
- `extension/manifest.json` for permission changes

## Implementation Policy

Before editing:
1. Understand existing conventions
2. Find affected files
3. Create todos
4. Use a subagent when non-trivial
5. Make the smallest correct change

While editing:
* Do not rewrite unrelated code.
* Do not weaken types to pass builds.
* Do not delete tests to pass.
* Do not silence errors without justification.
* Do not introduce broad refactors inside bugfixes.
* Do not modify generated files unless required.

For TypeScript:
* Assume strict mode.
* Avoid any; prefer unknown with narrowing.
* Add explicit return types to exported functions.
* Keep API DTo, domain, and persistence types separate.

## Quality Gate

Before saying a task is complete, run available checks.

Preferred commands for this project:
```bash
npm run typecheck
npm run build
npm test
npm run smoke
```

Final report must include:

```txt
Changed files:
Commands run:
Passed:
Failed:
Not run:
Reason not run:
Remaining risk:
```

Do not say "tests passed" unless tests were actually run.

## Security Rules

Never print, store, commit, or summarize secrets from env files, pem keys, credentials.json, etc.

For auth, payment, database, deployment, shell, file upload, or permission changes, run a security review before final response.

## DESIGN.md / UI Policy

If the task touches UI or design:
1. Read DESIGN.md if present.
2. Inspect existing components.
3. Use existing tokens before inventing styles.
4. Check responsive states.
5. Check loading, error, and empty states.
6. Check accessibility.
7. Use screenshots or media files when available.

## Git Policy

Before major edits, check `git status --short` to avoid overwriting user changes.
When generating commit messages, use Conventional Commits: `feat(scope): summary`, `fix(scope): summary`, etc.

## Final Response Policy

Final response should be short and concrete.

Include:
```txt
What changed:
Files changed:
Commands run:
Result:
Remaining risk:
```

Do not include long internal reasoning.
Final report should not repeat AGENTS.md rules.
Do not overclaim.
If something failed, say exactly what failed and what remains.
