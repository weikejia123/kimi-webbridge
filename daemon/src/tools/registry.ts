/**
 * Kimi WebBridge v2.0 — Tool Registry
 *
 * Worker-1C owns this file. Phase 1 handlers registered.
 * Worker-2B added Phase 2 evaluate handlers.
 * Worker-3B added Phase 3 observation handlers.
 */

import type { BridgeCommand, BridgeResponse } from "../shared/protocol.js";

export interface ToolContext {
  tabId: number;
  frameId?: number;
  timeoutMs?: number;
  command: BridgeCommand;
  authenticated?: boolean;
  abortSignal?: AbortSignal;
}

export type ToolHandler = (
  args: unknown,
  context: ToolContext,
) => Promise<BridgeResponse>;

/** Global tool registry mapping tool names to their handlers. */
export const registry = new Map<string, ToolHandler>();

/** Resolve a handler for the given command. */
export function resolveTool(cmd: BridgeCommand): ToolHandler | undefined {
  return registry.get(cmd.tool);
}

// ---------------------------------------------------------------------------
// Phase 1 tool handlers
// ---------------------------------------------------------------------------

import { handlePressKey } from "./pressKey.js";
import { handleKeyCombo } from "./keyCombo.js";
import { handleFocus } from "./focus.js";
import { handleSubmitForm } from "./submitForm.js";
import { handleWaitFor } from "./waitFor.js";

async function handlePing(_args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  return {
    v: "2.0",
    id: ctx.command.id,
    ok: true,
    tool: ctx.command.tool,
    result: { pong: true },
    error: null,
    warnings: [],
    telemetry: { durationMs: 0 },
  };
}

registry.set("press_key", handlePressKey);
registry.set("key_combo", handleKeyCombo);
registry.set("focus", handleFocus);
registry.set("submit_form", handleSubmitForm);
registry.set("wait_for", handleWaitFor);
registry.set("ping", handlePing);

// ---------------------------------------------------------------------------
// Phase 2 tool handlers
// ---------------------------------------------------------------------------

import { handleEvaluateV2 } from "./evaluateV2.js";
import { handleEvaluate } from "./evaluate.js";

registry.set("evaluate_v2", handleEvaluateV2);
registry.set("evaluate", handleEvaluate);

// ---------------------------------------------------------------------------
// Phase 3 tool handlers — Unified Observation + Chunked Extraction
// ---------------------------------------------------------------------------

import { handleGetPageState } from "./getPageState.js";
import { handleExtractText } from "./extractText.js";
import { handleGetFullText } from "./getFullText.js";
import { handleQueryElements } from "./queryElements.js";

registry.set("get_page_state", handleGetPageState);
registry.set("extract_text", handleExtractText);
registry.set("get_full_text", handleGetFullText);
registry.set("query_elements", handleQueryElements);
// snapshot 由 CDP 层实现（见 CDP 工具注册段）
//registry.set("snapshot", handleSnapshot);

// ---------------------------------------------------------------------------
// Phase 4 tool handlers — Element Registry + Reliable Targeting
// ---------------------------------------------------------------------------

import { handleFindElement } from "./findElement.js";
import { handleListActions } from "./listActions.js";
import { handleDescribeElement } from "./describeElement.js";
import { handleHighlight } from "./highlight.js";
import { handleClickRef } from "./clickRef.js";
import { handleClick } from "./click.js";
import { handleSelectOption } from "./selectOption.js";
import { handleScrollTo } from "./scrollTo.js";
import { handleHover } from "./hover.js";
import { handleFill } from "./fill.js";

registry.set("find_element", handleFindElement);
registry.set("list_actions", handleListActions);
registry.set("describe_element", handleDescribeElement);
registry.set("highlight", handleHighlight);
registry.set("click_ref", handleClickRef);
registry.set("click", handleClick);
registry.set("select_option", handleSelectOption);
registry.set("scroll_to", handleScrollTo);
registry.set("hover", handleHover);
registry.set("fill", handleFill);

// ---------------------------------------------------------------------------
// Phase 5 tool handlers — Reliability Layer
// ---------------------------------------------------------------------------

import { handleRecover } from "./recover.js";
import { handleRollback } from "./rollback.js";

registry.set("recover", handleRecover);
registry.set("rollback", handleRollback);

// ---------------------------------------------------------------------------
// Phase 6 tool handlers — Daemon Hardening, Status, UX Polish
// ---------------------------------------------------------------------------

import { handleGetBridgeStatus } from "./getBridgeStatus.js";
import { handleSetPolicy } from "./setPolicy.js";
import { handleStartTrace } from "./startTrace.js";
import { handleStopTrace } from "./stopTrace.js";
import { handleGetLastTrace } from "./getLastTrace.js";
import { handleCaptureScreenshot } from "./captureScreenshot.js";
import { handleAnnotatedScreenshot } from "./annotatedScreenshot.js";
import { handleStartRecording } from "./startRecording.js";
import { handleStopRecording } from "./stopRecording.js";

registry.set("get_bridge_status", handleGetBridgeStatus);
registry.set("set_policy", handleSetPolicy);
registry.set("start_trace", handleStartTrace);
registry.set("stop_trace", handleStopTrace);
registry.set("get_last_trace", handleGetLastTrace);
registry.set("capture_screenshot", handleCaptureScreenshot);
registry.set("annotated_screenshot", handleAnnotatedScreenshot);
registry.set("start_recording", handleStartRecording);
registry.set("stop_recording", handleStopRecording);

import { handleNavigate } from "./navigate.js";
import { handleReload } from "./reload.js";
import { handleListTabs } from "./listTabs.js";
import { handleSwitchTab } from "./switchTab.js";
import { handleClickAt } from "./clickAt.js";
import { handleGetSemanticDiff } from "./getSemanticDiff.js";
import { handleClassifyForm } from "./classifyForm.js";
import { handleRunWorkflow } from "./runWorkflow.js";
import { handleRunBatch } from "./runBatch.js";
import { handleExportResults } from "./exportResults.js";
import { handleGetAuditLog } from "./getAuditLog.js";
import { handleClearAuditLog } from "./clearAuditLog.js";

registry.set("navigate", handleNavigate);
registry.set("reload", handleReload);
registry.set("list_tabs", handleListTabs);
registry.set("switch_tab", handleSwitchTab);
registry.set("click_at", handleClickAt);
registry.set("get_semantic_diff", handleGetSemanticDiff);
registry.set("classify_form", handleClassifyForm);

// ---------------------------------------------------------------------------
// Phase 5 tool handlers — Workflow / Batch Automation
// ---------------------------------------------------------------------------

registry.set("run_workflow", handleRunWorkflow);
registry.set("run_batch", handleRunBatch);
registry.set("export_results", handleExportResults);

// ---------------------------------------------------------------------------
// Phase 7 tool handlers — Audit Log
// ---------------------------------------------------------------------------

registry.set("get_audit_log", handleGetAuditLog);
registry.set("clear_audit_log", handleClearAuditLog);
registry.set("snapshot", makePassthrough("snapshot"));

// ---------------------------------------------------------------------------
// CDP 工具 — 直接注册，不依赖外部导入
// ---------------------------------------------------------------------------

import { extensionRouter } from "../extension/router.js";

function makePassthrough(name: string) {
  return async (args: unknown, ctx: ToolContext): Promise<BridgeResponse> => {
    const start = Date.now();
    const response = await extensionRouter.sendCommand(
      ctx.tabId, ctx.frameId, name,
      args ?? {}, ctx.timeoutMs ?? 30000, ctx.command.id,
    );
    return { ...response, id: ctx.command.id, tool: ctx.command.tool, telemetry: { ...response.telemetry, durationMs: Date.now() - start } };
  };
}

registry.set("mouse_click", makePassthrough("mouse_click"));
registry.set("network", makePassthrough("network"));
registry.set("save_as_pdf", makePassthrough("save_as_pdf"));
registry.set("upload", makePassthrough("upload"));
registry.set("cdp", makePassthrough("cdp"));
registry.set("close_tab", makePassthrough("close_tab"));
registry.set("close_session", makePassthrough("close_session"));
// snapshot 已注册为 CDP 版本
