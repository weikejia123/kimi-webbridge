/**
 * Kimi WebBridge v2.0 — Extension Service Worker
 *
 * Maintains a persistent WebSocket connection to the local daemon,
 * routes incoming v2 commands to per-tab content scripts, and returns
 * structured responses. Includes Manifest-V3 keep-alive, auto-reconnect,
 * tab tracking, and v1 backward-compatibility shims.
 */

import type { BridgeCommand, BridgeResponse, BridgeStatus } from "../shared/protocol.js";
import { createBridgeError } from "../shared/errors.js";
import { getStatus, setPolicy, setConnectionState, recordHeartbeat, setTracesActive } from "./status.js";
import { checkPolicyBeforeAction } from "./policy.js";
import { TraceStore, captureTraceScreenshot } from "./trace.js";
import { startRecording, stopRecording, getRecordingStatus, getPartialBlob } from "./recording.js";
import { handleNavigate, handleReload, handleListTabs, handleSwitchTab } from "./browserActions.js";
import { logAction, getAuditLog, clearAuditLog } from "./auditLog.js";
import { redactPii } from "./piiRedaction.js";
import { checkRateLimit } from "./rateLimiter.js";
import { checkDomainPermission } from "./permissionModel.js";
import { isCdpTool, executeCdpTool, isDualChannelTool } from "./cdpTools.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DAEMON_HOST = "127.0.0.1";
const DAEMON_PORT = 10186;
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;
const KEEP_ALIVE_ALARM_NAME = "kimi-webbridge-keepalive";
const KEEP_ALIVE_INTERVAL_MIN = 20 / 60; // ~20 seconds (Chrome may throttle to ~30s)

// ---------------------------------------------------------------------------
// Types & State
// ---------------------------------------------------------------------------

interface PendingRequest {
  resolve: (resp: BridgeResponse) => void;
  reject: (err: Error) => void;
  timer: number;
  requestId: string;
  tabId: number;
}

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimer: number | null = null;
const pendingRequests = new Map<string, PendingRequest>();
let activeTabId: number | null = null;
let isShuttingDown = false;
const traceStore = new TraceStore();

// ---------------------------------------------------------------------------
// WebSocket Connection Management
// ---------------------------------------------------------------------------

function getWebSocketUrl(): string {
  if (activeTabId !== null) {
    return `ws://${DAEMON_HOST}:${DAEMON_PORT}/extension?tabId=${activeTabId}`;
  }
  return `ws://${DAEMON_HOST}:${DAEMON_PORT}/extension`;
}

function connect(): void {
  if (isShuttingDown) return;
  if (
    ws !== null &&
    (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)
  ) {
    return;
  }
  if (activeTabId === null) {
    console.info("[Fahd's WebBridge] No active tab; deferring daemon connection");
    return;
  }

  // Tear down any stale socket before reconnecting.
  if (ws !== null) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    ws = null;
  }

  const url = getWebSocketUrl();
  console.info("[Fahd's WebBridge] Connecting to daemon:", url);

  try {
    ws = new WebSocket(url);
  } catch (err) {
    console.error("[Fahd's WebBridge] Failed to create WebSocket:", err);
    scheduleReconnect();
    return;
  }

  ws.onopen = (): void => {
    console.info("[Fahd's WebBridge] Connected to daemon");
    reconnectAttempts = 0;
    setConnectionState(true, activeTabId);
    sendRegistration();
  };

  ws.onmessage = (event: MessageEvent): void => {
    handleDaemonMessage(event.data).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Fahd's WebBridge] Error handling daemon message:", msg);
    });
  };

  ws.onerror = (event: Event): void => {
    console.error("[Fahd's WebBridge] WebSocket error:", event);
  };

  ws.onclose = (event: CloseEvent): void => {
    console.info(
      "[Fahd's WebBridge] WebSocket closed:",
      event.code,
      event.reason,
    );
    ws = null;
    setConnectionState(false, activeTabId);
    cleanupPendingRequests("WebSocket closed");
    scheduleReconnect();
  };
}

async function sendRegistration(): Promise<void> {
  if (ws === null || ws.readyState !== WebSocket.OPEN) return;

  const { daemonToken } = await chrome.storage.local.get("daemonToken");
  const token = typeof daemonToken === "string" ? daemonToken : "";

  try {
    ws.send(JSON.stringify({ type: "auth", token }));
  } catch (err) {
    console.error("[Fahd's WebBridge] Failed to send auth:", err);
  }

  const registration = {
    type: "register",
    tabId: activeTabId,
    version: chrome.runtime.getManifest().version,
    manifestVersion: chrome.runtime.getManifest().manifest_version,
  };

  try {
    ws.send(JSON.stringify(registration));
  } catch (err) {
    console.error("[Fahd's WebBridge] Failed to send registration:", err);
  }
}

function scheduleReconnect(): void {
  if (isShuttingDown) return;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error("[Fahd's WebBridge] Max reconnect attempts reached");
    return;
  }

  reconnectAttempts++;
  const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts - 1);
  console.info(
    `[Fahd's WebBridge] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
  );

  reconnectTimer = self.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function sendToDaemon(response: BridgeResponse, correlationId?: string): void {
  if (ws === null || ws.readyState !== WebSocket.OPEN) {
    console.warn(
      "[Fahd's WebBridge] Cannot send response; WebSocket not open",
    );
    return;
  }
  try {
    const payload = correlationId !== undefined
      ? { requestId: correlationId, response }
      : response;
    ws.send(JSON.stringify(payload));
  } catch (err) {
    console.error("[Fahd's WebBridge] Failed to send response:", err);
  }
}

function cleanupPendingRequests(reason: string): void {
  for (const [, pending] of pendingRequests) {
    clearTimeout(pending.timer);
    pending.resolve({
      v: "2.0",
      id: pending.requestId,
      ok: false,
      tool: "unknown",
      result: null,
      error: createBridgeError(
        "UNKNOWN_ERROR",
        `Request aborted: ${reason}`,
        { recoverable: true },
      ),
      warnings: [],
      telemetry: { durationMs: 0 },
    });
  }
  pendingRequests.clear();
}

// ---------------------------------------------------------------------------
// Command Routing (daemon → content script → daemon)
// ---------------------------------------------------------------------------

async function handleDaemonMessage(data: unknown): Promise<void> {
  let parsed: unknown;
  try {
    parsed = typeof data === "string" ? JSON.parse(data) : data;
  } catch (err) {
    console.error("[Fahd's WebBridge] Invalid JSON from daemon:", err);
    return;
  }

  const msg = parsed as Record<string, unknown>;
  const correlationId = typeof msg.requestId === "string" ? msg.requestId : undefined;

  // Ignore non-command frames (e.g. registration acks).
  if (typeof msg.id !== "string" || typeof msg.tool !== "string") {
    console.warn("[Fahd's WebBridge] Malformed message from daemon:", parsed);
    return;
  }

  // Normalise to a full BridgeCommand envelope before forwarding.
  const cmd: BridgeCommand = {
    v: "2.0",
    id: msg.id,
    tool: msg.tool,
    args: msg.args ?? {},
    timeoutMs:
      typeof msg.timeoutMs === "number" ? msg.timeoutMs : DEFAULT_TIMEOUT_MS,
  };
  const resolvedTabId =
    typeof msg.tabId === "number" ? msg.tabId : activeTabId;
  if (resolvedTabId !== null) {
    (cmd as Record<string, unknown>).tabId = resolvedTabId;
  }
  if (typeof msg.frameId === "number") {
    (cmd as Record<string, unknown>).frameId = msg.frameId;
  }

  const tabId = resolvedTabId ?? undefined;
  if (tabId === undefined) {
    sendToDaemon({
      v: "2.0",
      id: cmd.id,
      ok: false,
      tool: cmd.tool,
      result: null,
      error: createBridgeError(
        "UNKNOWN_ERROR",
        "No target tab specified and no active tab available",
        { recoverable: true },
      ),
      warnings: [],
      telemetry: { durationMs: 0 },
    });
    return;
  }

  // Browser-level actions are handled directly by the service worker.
  if (cmd.tool === "navigate") {
    const response = await handleNavigate(cmd);
    sendToDaemon(response, correlationId);
    return;
  }
  if (cmd.tool === "reload") {
    const response = await handleReload(cmd);
    sendToDaemon(response, correlationId);
    return;
  }
  if (cmd.tool === "list_tabs") {
    const response = await handleListTabs(cmd);
    sendToDaemon(response, correlationId);
    return;
  }
  if (cmd.tool === "switch_tab") {
    const response = await handleSwitchTab(cmd);
    sendToDaemon(response, correlationId);
    return;
  }

  // CDP tools — 通过 chrome.debugger 协议执行的浏览器级操作
  if (isCdpTool(cmd.tool)) {
    const start = Date.now();
    const tabId = typeof cmd.tabId === "number" ? cmd.tabId : activeTabId;
    if (tabId === null && cmd.tool !== "close_tab" && cmd.tool !== "close_session") {
      sendToDaemon({
        v: "2.0",
        id: cmd.id,
        ok: false,
        tool: cmd.tool,
        result: null,
        error: createBridgeError(
          "UNKNOWN_ERROR",
          "No target tab specified and no active tab available",
          { recoverable: true },
        ),
        warnings: [],
        telemetry: { durationMs: Date.now() - start },
      });
      return;
    }
    try {
      const result = await executeCdpTool(cmd.tool, tabId ?? 0, cmd.args as Record<string, unknown>);
      sendToDaemon({
        v: "2.0",
        id: cmd.id,
        ok: true,
        tool: cmd.tool,
        result,
        error: null,
        warnings: [],
        telemetry: { durationMs: Date.now() - start },
      });
      return; // CDP 成功，直接返回
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 双通道工具：CDP 失败后降级到 Content Script
      if (isDualChannelTool(cmd.tool)) {
        console.warn(
          `[Fahd's WebBridge] CDP ${cmd.tool} failed, falling back to content script: ${message}`,
        );
        // 不 return，继续执行后续的 Content Script 路由
      } else {
        sendToDaemon({
          v: "2.0",
          id: cmd.id,
          ok: false,
          tool: cmd.tool,
          result: null,
          error: createBridgeError("UNKNOWN_ERROR", message, { recoverable: true }),
          warnings: [],
          telemetry: { durationMs: Date.now() - start },
        });
      }
    }
    // 纯 CDP 工具在此 return；双通道工具 CDP 失败后不 return（降落伞）
  }

  // Audit log commands are handled directly by the service worker.
  if (cmd.tool === "get_audit_log") {
    const start = Date.now();
    const args = cmd.args as Record<string, unknown>;
    const filter: Parameters<typeof getAuditLog>[0] = {};
    if (typeof args.tabId === "number") filter.tabId = args.tabId;
    if (typeof args.since === "number") filter.since = args.since;
    if (typeof args.tool === "string") filter.tool = args.tool;
    const entries = await getAuditLog(filter);
    sendToDaemon({
      v: "2.0",
      id: cmd.id,
      ok: true,
      tool: cmd.tool,
      result: { entries, count: entries.length },
      error: null,
      warnings: [],
      telemetry: { durationMs: Date.now() - start },
    }, correlationId);
    return;
  }
  if (cmd.tool === "clear_audit_log") {
    const start = Date.now();
    await clearAuditLog();
    sendToDaemon({
      v: "2.0",
      id: cmd.id,
      ok: true,
      tool: cmd.tool,
      result: { cleared: true },
      error: null,
      warnings: [],
      telemetry: { durationMs: Date.now() - start },
    }, correlationId);
    return;
  }

  // Verify the tab exists before attempting to message it.
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    sendToDaemon({
      v: "2.0",
      id: cmd.id,
      ok: false,
      tool: cmd.tool,
      result: null,
      error: createBridgeError(
        "UNKNOWN_ERROR",
        `Tab not found: ${tabId}`,
        { recoverable: true },
      ),
      warnings: [],
      telemetry: { durationMs: 0 },
    });
    return;
  }

  // Policy check
  const policyCheck = await checkPolicyBeforeAction(tabId, cmd.tool);
  if (!policyCheck.allowed) {
    sendToDaemon({
      v: "2.0",
      id: cmd.id,
      ok: false,
      tool: cmd.tool,
      result: null,
      error: createBridgeError(
        "PERMISSION_DENIED",
        policyCheck.reason ?? "Action blocked by policy",
      ),
      warnings: [],
      telemetry: { durationMs: 0 },
    });
    return;
  }

  // Domain permission check
  const domainCheck = checkDomainPermission(tab.url ?? "");
  if (!domainCheck.allowed) {
    sendToDaemon({
      v: "2.0",
      id: cmd.id,
      ok: false,
      tool: cmd.tool,
      result: null,
      error: createBridgeError(
        "PERMISSION_DENIED",
        domainCheck.reason ?? "Domain not permitted",
      ),
      warnings: [],
      telemetry: { durationMs: 0 },
    });
    return;
  }

  // Rate limit check
  const rateCheck = checkRateLimit(tabId);
  if (!rateCheck.allowed) {
    sendToDaemon({
      v: "2.0",
      id: cmd.id,
      ok: false,
      tool: cmd.tool,
      result: null,
      error: createBridgeError(
        "PERMISSION_DENIED",
        `Rate limit exceeded; retry after ${rateCheck.retryAfterMs}ms`,
      ),
      warnings: [],
      telemetry: { durationMs: 0 },
    });
    return;
  }

  const cmdStart = Date.now();
  try {
    // Ensure content script is present; inject if missing.
    const injected = await ensureContentScriptInjected(tabId);
    if (!injected) {
      sendToDaemon({
        v: "2.0",
        id: cmd.id,
        ok: false,
        tool: cmd.tool,
        result: null,
        error: createBridgeError(
          "UNKNOWN_ERROR",
          "Content script not available and injection failed",
          { recoverable: true },
        ),
        warnings: [],
        telemetry: { durationMs: Date.now() - cmdStart },
      }, correlationId);
      return;
    }

    const response = await routeToContentScript(tabId, cmd.frameId, cmd);
    sendToDaemon(response, correlationId);

    // Fire-and-forget audit log
    const redactedArgs: Record<string, unknown> = {};
    if (cmd.args && typeof cmd.args === "object") {
      for (const [key, value] of Object.entries(cmd.args as Record<string, unknown>)) {
        redactedArgs[key] = typeof value === "string" ? redactPii(value) : value;
      }
    }
    void logAction({
      timestamp: Date.now(),
      tabId,
      url: tab.url ?? "",
      tool: cmd.tool,
      args: redactedArgs,
      success: response.ok,
      errorCode: response.error?.code,
      durationMs: Date.now() - cmdStart,
    });

    if (traceStore.isActive()) {
      traceStore.add({
        id: cmd.id,
        timestamp: Date.now(),
        tool: cmd.tool,
        args: cmd.args,
        result: response.result,
        durationMs: Date.now() - cmdStart,
        url: tab.url ?? "",
      });
      // Fire-and-forget screenshot capture for the trace record
      captureTraceScreenshot(tabId)
        .then((screenshot) => {
          if (screenshot) {
            traceStore.addScreenshot(cmd.id, screenshot);
          }
        })
        .catch(() => {
          /* ignore screenshot errors */
        });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendToDaemon({
      v: "2.0",
      id: cmd.id,
      ok: false,
      tool: cmd.tool,
      result: null,
      error: createBridgeError("UNKNOWN_ERROR", redactPii(message), {
        recoverable: true,
      }),
      warnings: [],
      telemetry: { durationMs: 0 },
    }, correlationId);
    // Fire-and-forget audit log for exception
    const exceptionRedactedArgs: Record<string, unknown> = {};
    if (cmd.args && typeof cmd.args === "object") {
      for (const [key, value] of Object.entries(cmd.args as Record<string, unknown>)) {
        exceptionRedactedArgs[key] = typeof value === "string" ? redactPii(value) : value;
      }
    }
    void logAction({
      timestamp: Date.now(),
      tabId,
      url: tab.url ?? "",
      tool: cmd.tool,
      args: exceptionRedactedArgs,
      success: false,
      errorCode: "UNKNOWN_ERROR",
      durationMs: Date.now() - cmdStart,
    });
  }
}

/**
 * Wait for the manifest-injected content script to be ready.
 * We do NOT use chrome.scripting.executeScript with files here because
 * that injects into the MAIN world, not the isolated content-script world,
 * so chrome.tabs.sendMessage would still fail with "Receiving end does not exist."
 * The manifest already auto-injects the content script at document_idle.
 */
async function ensureContentScriptInjected(tabId: number): Promise<boolean> {
  const maxRetries = 5;
  const retryDelayMs = 200;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const ok = await new Promise<boolean>((resolve) => {
        chrome.tabs.sendMessage(
          tabId,
          { v: "2.0", id: `ping-${Date.now()}`, tool: "ping", args: {} },
          () => {
            const lastErr = chrome.runtime.lastError;
            if (lastErr) {
              resolve(false);
            } else {
              resolve(true);
            }
          },
        );
      });
      if (ok) return true;
    } catch {
      /* ignore */
    }
    if (attempt < maxRetries - 1) {
      await new Promise((r) => self.setTimeout(r, retryDelayMs));
    }
  }
  return false;
}

function routeToContentScript(
  tabId: number,
  frameId: number | undefined,
  cmd: BridgeCommand,
): Promise<BridgeResponse> {
  return new Promise((resolve) => {
    const timeoutMs = cmd.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();
    const key = `${tabId}:${cmd.id}`;

    const timer = self.setTimeout(() => {
      pendingRequests.delete(key);
      resolve({
        v: "2.0",
        id: cmd.id,
        ok: false,
        tool: cmd.tool,
        result: null,
        error: createBridgeError(
          "UNKNOWN_ERROR",
          "Content script did not respond in time",
          { recoverable: true },
        ),
        warnings: [],
        telemetry: {
          durationMs: Date.now() - startTime,
          timedOut: true,
        },
      });
    }, timeoutMs);

    const pending: PendingRequest = {
      resolve: (resp: BridgeResponse): void => {
        clearTimeout(timer);
        pendingRequests.delete(key);
        resolve(resp);
      },
      reject: (err: Error): void => {
        clearTimeout(timer);
        pendingRequests.delete(key);
        resolve({
          v: "2.0",
          id: cmd.id,
          ok: false,
          tool: cmd.tool,
          result: null,
          error: createBridgeError("UNKNOWN_ERROR", err.message, {
            recoverable: true,
          }),
          warnings: [],
          telemetry: { durationMs: Date.now() - startTime },
        });
      },
      timer,
      requestId: cmd.id,
      tabId,
    };

    pendingRequests.set(key, pending);

    const callback = (response: unknown): void => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        pending.reject(
          new Error(lastErr.message ?? "Unknown runtime error"),
        );
        return;
      }
      pending.resolve(response as BridgeResponse);
    };

    if (frameId !== undefined) {
      chrome.tabs.sendMessage(tabId, cmd, { frameId }, callback);
    } else {
      chrome.tabs.sendMessage(tabId, cmd, callback);
    }
  });
}

// ---------------------------------------------------------------------------
// Keep-Alive (Manifest V3)
// ---------------------------------------------------------------------------

function setupKeepAlive(): void {
  void chrome.alarms.create(KEEP_ALIVE_ALARM_NAME, {
    periodInMinutes: KEEP_ALIVE_INTERVAL_MIN,
  });
}

chrome.alarms.onAlarm.addListener((alarm): void => {
  if (alarm.name !== KEEP_ALIVE_ALARM_NAME) return;

  // Ping the daemon to keep the WebSocket alive and the worker running.
  if (ws !== null && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
      recordHeartbeat();
    } catch {
      // If the send fails the close handler will schedule a reconnect.
    }
  }

  // Ensure we are connected whenever the alarm fires.
  if (ws === null || ws.readyState === WebSocket.CLOSED) {
    connect();
  }
});

// Keep the service worker alive while internal or external ports are active.
chrome.runtime.onConnect.addListener((port): void => {
  console.info("[Fahd's WebBridge] Internal port connected:", port.name);
  port.onDisconnect.addListener((): void => {
    console.info("[Fahd's WebBridge] Internal port disconnected:", port.name);
  });
});

chrome.runtime.onConnectExternal.addListener((port): void => {
  console.info("[Fahd's WebBridge] External port connected:", port.name);
  port.onDisconnect.addListener((): void => {
    console.info("[Fahd's WebBridge] External port disconnected");
  });
});

// ---------------------------------------------------------------------------
// Internal Messages (status, policy, trace)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as Record<string, unknown>;
  const type = msg.type as string;

  if (type === "get_status") {
    sendResponse(getStatus());
    return false;
  }

  if (type === "get_bridge_status") {
    void (async (): Promise<void> => {
      const manifest = chrome.runtime.getManifest();
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      const extStatus = getStatus();
      const browser: BridgeStatus["browser"] = {};
      if (extStatus.activeTabId !== null) browser.activeTabId = extStatus.activeTabId;
      if (activeTab?.url !== undefined) browser.url = activeTab.url;
      if (activeTab?.title !== undefined) browser.title = activeTab.title;
      const status: BridgeStatus = {
        daemon: {
          version: "1.0.0",
          port: 10186,
          protocol: "2.0",
        },
        extension: {
          connected: extStatus.connected,
          version: manifest.version,
          manifestVersion: manifest.manifest_version,
        },
        browser,
        capabilities: {
          press_key: true,
          key_combo: true,
          focus: true,
          submit_form: true,
          wait_for: true,
          evaluate_v2: true,
          get_page_state: true,
          extract_text: true,
          get_full_text: true,
          query_elements: true,
          click_ref: true,
          highlight: true,
          find_element: true,
          describe_element: true,
          list_actions: true,
          select_option: true,
          scroll_to: true,
          hover: true,
          fill: true,
          recover: true,
          get_bridge_status: true,
          set_policy: true,
          start_trace: true,
          stop_trace: true,
          get_last_trace: true,
          capture_screenshot: true,
          annotated_screenshot: true,
          start_recording: true,
          stop_recording: true,
        },
      };
      sendResponse(status);
    })();
    return true;
  }

  if (type === "set_policy") {
    setPolicy(msg.args as Parameters<typeof setPolicy>[0]);
    sendResponse({ success: true });
    return false;
  }

  if (type === "start_trace") {
    traceStore.start();
    setTracesActive(true);
    sendResponse({ success: true });
    return false;
  }

  if (type === "stop_trace") {
    const traces = traceStore.stop();
    setTracesActive(false);
    sendResponse({ traces });
    return false;
  }

  if (type === "get_last_trace") {
    const count = typeof msg.count === "number" ? msg.count : undefined;
    sendResponse(traceStore.getLast(count));
    return false;
  }

  if (type === "capture_screenshot") {
    void (async (): Promise<void> => {
      const targetTabId =
        typeof msg.tabId === "number" ? msg.tabId : activeTabId ?? undefined;
      if (targetTabId === undefined) {
        sendResponse({ success: false, error: "No active tab" });
        return;
      }
      try {
        const screenshot = await captureTraceScreenshot(targetTabId);
        if (screenshot) {
          sendResponse({ success: true, screenshot });
        } else {
          sendResponse({ success: false, error: "Screenshot capture returned empty" });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendResponse({ success: false, error: message });
      }
    })();
    return true;
  }

  if (type === "start_recording") {
    void (async (): Promise<void> => {
      const targetTabId =
        typeof msg.tabId === "number" ? msg.tabId : activeTabId ?? undefined;
      if (targetTabId === undefined) {
        sendResponse({ success: false, error: "No active tab" });
        return;
      }
      try {
        const startTime = await startRecording(targetTabId);
        sendResponse({ success: true, startTime });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendResponse({ success: false, error: message });
      }
    })();
    return true;
  }

  if (type === "stop_recording") {
    void (async (): Promise<void> => {
      try {
        const { blob, durationMs, tabId } = await stopRecording();
        // Convert blob to base64 for transmission
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1] ?? "";
          sendResponse({ success: true, base64, durationMs, tabId, sizeBytes: blob.size });
        };
        reader.onerror = () => {
          sendResponse({ success: false, error: "Failed to read recording blob" });
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendResponse({ success: false, error: message });
      }
    })();
    return true;
  }

  if (type === "get_recording_status") {
    sendResponse({ success: true, status: getRecordingStatus() });
    return false;
  }

  if (type === "get_recording_partial") {
    const blob = getPartialBlob();
    if (!blob) {
      sendResponse({ success: false, error: "No recording in progress" });
      return false;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1] ?? "";
      sendResponse({ success: true, base64, sizeBytes: blob.size });
    };
    reader.onerror = () => {
      sendResponse({ success: false, error: "Failed to read partial blob" });
    };
    reader.readAsDataURL(blob);
    return true;
  }

  if (type === "get_audit_log") {
    void (async (): Promise<void> => {
      const filter: Parameters<typeof getAuditLog>[0] = {};
      if (typeof msg.tabId === "number") filter.tabId = msg.tabId;
      if (typeof msg.since === "number") filter.since = msg.since;
      if (typeof msg.tool === "string") filter.tool = msg.tool;
      const entries = await getAuditLog(filter);
      sendResponse({ success: true, entries, count: entries.length });
    })();
    return true;
  }

  if (type === "clear_audit_log") {
    void (async (): Promise<void> => {
      await clearAuditLog();
      sendResponse({ success: true, cleared: true });
    })();
    return true;
  }

  return false;
});

// ---------------------------------------------------------------------------
// Tab Tracking
// ---------------------------------------------------------------------------

function updateActiveTab(tabId: number): void {
  if (activeTabId === tabId) return;
  activeTabId = tabId;
  setConnectionState(ws !== null && ws.readyState === WebSocket.OPEN, activeTabId);
  console.info("[Fahd's WebBridge] Active tab updated:", tabId);

  // Reconnect so the daemon sees the new tabId in the query string.
  if (ws !== null && ws.readyState === WebSocket.OPEN) {
    ws.close();
    // onclose schedules the reconnect.
  }
}

chrome.tabs.onActivated.addListener((activeInfo): void => {
  updateActiveTab(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(
  (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void => {
    if (changeInfo.status === "complete" && tab.active && tab.id !== undefined) {
      updateActiveTab(tab.id);
    }
  },
);

// ---------------------------------------------------------------------------
// v1 Backward Compatibility
// ---------------------------------------------------------------------------

const ALLOWED_EXTERNAL_IDS: string[] = [];

chrome.runtime.onMessageExternal.addListener(
  (message: unknown, sender: chrome.runtime.MessageSender, sendResponse): boolean => {
    if (!sender.id || !ALLOWED_EXTERNAL_IDS.includes(sender.id)) {
      sendResponse({
        ok: false,
        error: "External sender not allowed",
      });
      return false;
    }

    const cmd = message as BridgeCommand;

    if (cmd.v === "2.0" && typeof cmd.tool === "string") {
      const tabId = cmd.tabId ?? sender.tab?.id;
      if (tabId === undefined) {
        sendResponse({
          v: "2.0",
          id: cmd.id,
          ok: false,
          tool: cmd.tool,
          result: null,
          error: createBridgeError(
            "UNKNOWN_ERROR",
            "Cannot route v2 command: no sender tab",
            { recoverable: true },
          ),
          warnings: [],
          telemetry: { durationMs: 0 },
        });
        return false;
      }

      if (cmd.tabId !== undefined && sender.tab?.id !== cmd.tabId) {
        sendResponse({
          v: "2.0",
          id: cmd.id,
          ok: false,
          tool: cmd.tool,
          result: null,
          error: createBridgeError(
            "UNKNOWN_ERROR",
            "Sender tab does not match command tabId",
            { recoverable: true },
          ),
          warnings: [],
          telemetry: { durationMs: 0 },
        });
        return false;
      }

      void (async (): Promise<void> => {
        const policyCheck = await checkPolicyBeforeAction(tabId, cmd.tool);
        if (!policyCheck.allowed) {
          sendResponse({
            v: "2.0",
            id: cmd.id,
            ok: false,
            tool: cmd.tool,
            result: null,
            error: createBridgeError(
              "PERMISSION_DENIED",
              redactPii(policyCheck.reason ?? "Action blocked by policy"),
            ),
            warnings: [],
            telemetry: { durationMs: 0 },
          });
          return;
        }

        let tabUrl = "";
        try {
          const tab = await chrome.tabs.get(tabId);
          tabUrl = tab.url ?? "";
        } catch {
          /* ignore */
        }

        const domainCheck = checkDomainPermission(tabUrl);
        if (!domainCheck.allowed) {
          sendResponse({
            v: "2.0",
            id: cmd.id,
            ok: false,
            tool: cmd.tool,
            result: null,
            error: createBridgeError(
              "PERMISSION_DENIED",
              redactPii(domainCheck.reason ?? "Domain not permitted"),
            ),
            warnings: [],
            telemetry: { durationMs: 0 },
          });
          return;
        }

        const rateCheck = checkRateLimit(tabId);
        if (!rateCheck.allowed) {
          sendResponse({
            v: "2.0",
            id: cmd.id,
            ok: false,
            tool: cmd.tool,
            result: null,
            error: createBridgeError(
              "PERMISSION_DENIED",
              redactPii(`Rate limit exceeded; retry after ${rateCheck.retryAfterMs}ms`),
            ),
            warnings: [],
            telemetry: { durationMs: 0 },
          });
          return;
        }

        const extStart = Date.now();
        routeToContentScript(tabId, cmd.frameId, cmd)
          .then((response) => {
            sendResponse(response);
            const v1RedactedArgs: Record<string, unknown> = {};
            if (cmd.args && typeof cmd.args === "object") {
              for (const [key, value] of Object.entries(cmd.args as Record<string, unknown>)) {
                v1RedactedArgs[key] = typeof value === "string" ? redactPii(value) : value;
              }
            }
            void logAction({
              timestamp: Date.now(),
              tabId,
              url: tabUrl,
              tool: cmd.tool,
              args: v1RedactedArgs,
              success: response.ok,
              errorCode: response.error?.code,
              durationMs: Date.now() - extStart,
            });
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            sendResponse({
              v: "2.0",
              id: cmd.id,
              ok: false,
              tool: cmd.tool,
              result: null,
              error: createBridgeError("UNKNOWN_ERROR", redactPii(msg), {
                recoverable: true,
              }),
              warnings: [],
              telemetry: { durationMs: 0 },
            });
            const v1ErrRedactedArgs: Record<string, unknown> = {};
            if (cmd.args && typeof cmd.args === "object") {
              for (const [key, value] of Object.entries(cmd.args as Record<string, unknown>)) {
                v1ErrRedactedArgs[key] = typeof value === "string" ? redactPii(value) : value;
              }
            }
            void logAction({
              timestamp: Date.now(),
              tabId,
              url: tabUrl,
              tool: cmd.tool,
              args: v1ErrRedactedArgs,
              success: false,
              errorCode: "UNKNOWN_ERROR",
              durationMs: Date.now() - extStart,
            });
          });
      })();

      return true; // async response
    }

    // v1 backward-compat: return a minimal stub response.
    sendResponse({ ok: true, result: null });
    return false;
  },
);

// ---------------------------------------------------------------------------
// Lifecycle Bootstrap
// ---------------------------------------------------------------------------

chrome.runtime.onStartup.addListener((): void => {
  console.info("[Fahd's WebBridge] Service worker startup");
  connect();
});

/** Generate a random hex token for daemon auth. */
function generateHexToken(length = 32): string {
  const chars = "0123456789abcdef";
  let result = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    const byte = randomValues[i]!;
    result += chars[byte % chars.length];
  }
  return result;
}

/** Ensure a persistent daemon token exists in chrome.storage.local. */
async function ensurePersistentToken(): Promise<string> {
  const stored = await chrome.storage.local.get("daemonToken");
  if (typeof stored.daemonToken === "string" && stored.daemonToken.length > 0) {
    return stored.daemonToken;
  }
  const token = generateHexToken(32);
  await chrome.storage.local.set({ daemonToken: token });
  console.info("[Fahd's WebBridge] Generated persistent daemon token");
  return token;
}

chrome.runtime.onInstalled.addListener((): void => {
  console.info("[Fahd's WebBridge] Service worker installed");
  void ensurePersistentToken();
  connect();
});

// Immediate bootstrap: resolve current tab, start keep-alive, and connect.
void (async (): Promise<void> => {
  await ensurePersistentToken();
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const firstTab = tabs[0];
  if (firstTab !== undefined && firstTab.id !== undefined) {
    activeTabId = firstTab.id;
  }
  setupKeepAlive();
  connect();
})();

console.info("[Fahd's WebBridge] Service worker loaded.");
