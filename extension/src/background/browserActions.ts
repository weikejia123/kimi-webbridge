/**
 * Kimi WebBridge v2.0 — Browser-Level Actions (Service Worker)
 *
 * Handles navigate, reload, list_tabs, switch_tab directly in the service worker
 * without routing through the content script.
 */

import type { BridgeResponse, BridgeCommand } from "../shared/protocol.js";
import { createBridgeError } from "../shared/errors.js";

export async function handleNavigate(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = Date.now();
  const args = cmd.args as Record<string, unknown>;
  const url = typeof args.url === "string" ? args.url : "";

  if (!url) {
    return {
      v: "2.0",
      id: cmd.id,
      ok: false,
      tool: cmd.tool,
      result: null,
      error: createBridgeError("INVALID_ARGUMENT", "Missing 'url' argument"),
      warnings: [],
      telemetry: { durationMs: Date.now() - start },
    };
  }

  const tabId = typeof cmd.tabId === "number" ? cmd.tabId : undefined;
  try {
    if (tabId !== undefined) {
      await chrome.tabs.update(tabId, { url });
    } else {
      await chrome.tabs.update({ url });
    }
    return {
      v: "2.0",
      id: cmd.id,
      ok: true,
      tool: cmd.tool,
      result: { navigated: true, url },
      error: null,
      warnings: [],
      telemetry: { durationMs: Date.now() - start },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      v: "2.0",
      id: cmd.id,
      ok: false,
      tool: cmd.tool,
      result: null,
      error: createBridgeError("UNKNOWN_ERROR", message, { recoverable: true }),
      warnings: [],
      telemetry: { durationMs: Date.now() - start },
    };
  }
}

export async function handleReload(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = Date.now();
  const args = cmd.args as Record<string, unknown>;
  const bypassCache = args.bypassCache === true;
  const tabId = typeof cmd.tabId === "number" ? cmd.tabId : undefined;

  try {
    if (tabId !== undefined) {
      await chrome.tabs.reload(tabId, { bypassCache });
    } else {
      await chrome.tabs.reload({ bypassCache });
    }
    return {
      v: "2.0",
      id: cmd.id,
      ok: true,
      tool: cmd.tool,
      result: { reloaded: true },
      error: null,
      warnings: [],
      telemetry: { durationMs: Date.now() - start },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      v: "2.0",
      id: cmd.id,
      ok: false,
      tool: cmd.tool,
      result: null,
      error: createBridgeError("UNKNOWN_ERROR", message, { recoverable: true }),
      warnings: [],
      telemetry: { durationMs: Date.now() - start },
    };
  }
}

export async function handleListTabs(_cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = Date.now();
  try {
    const tabs = await chrome.tabs.query({});
    const result = tabs.map((t) => ({
      id: t.id,
      url: t.url,
      title: t.title,
      active: t.active,
      windowId: t.windowId,
      pinned: t.pinned,
    }));
    return {
      v: "2.0",
      id: _cmd.id,
      ok: true,
      tool: _cmd.tool,
      result: { tabs: result, total: result.length },
      error: null,
      warnings: [],
      telemetry: { durationMs: Date.now() - start },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      v: "2.0",
      id: _cmd.id,
      ok: false,
      tool: _cmd.tool,
      result: null,
      error: createBridgeError("UNKNOWN_ERROR", message, { recoverable: true }),
      warnings: [],
      telemetry: { durationMs: Date.now() - start },
    };
  }
}

export async function handleSwitchTab(cmd: BridgeCommand): Promise<BridgeResponse> {
  const start = Date.now();
  const args = cmd.args as Record<string, unknown>;
  const tabId = typeof args.tabId === "number" ? args.tabId : undefined;

  if (tabId === undefined) {
    return {
      v: "2.0",
      id: cmd.id,
      ok: false,
      tool: cmd.tool,
      result: null,
      error: createBridgeError("INVALID_ARGUMENT", "Missing 'tabId' argument"),
      warnings: [],
      telemetry: { durationMs: Date.now() - start },
    };
  }

  try {
    await chrome.tabs.update(tabId, { active: true });
    // Also focus the window containing the tab
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return {
      v: "2.0",
      id: cmd.id,
      ok: true,
      tool: cmd.tool,
      result: { switched: true, tabId },
      error: null,
      warnings: [],
      telemetry: { durationMs: Date.now() - start },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      v: "2.0",
      id: cmd.id,
      ok: false,
      tool: cmd.tool,
      result: null,
      error: createBridgeError("UNKNOWN_ERROR", message, { recoverable: true }),
      warnings: [],
      telemetry: { durationMs: Date.now() - start },
    };
  }
}
