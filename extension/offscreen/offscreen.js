/**
 * Offscreen Document — CDP Debugger Proxy
 *
 * 在 offscreen document 中执行 chrome.debugger.attach/sendCommand/detach，
 * 避免 MV3 Service Worker 中 debugger API 挂起的问题。
 * 通过 chrome.runtime.onMessage 接收 Service Worker 的命令。
 * V1-20260714
 */

let attachedTabId = null;
const ATTACH_TIMEOUT = 5000;
const COMMAND_TIMEOUT = 10000;

function attach(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("attach timeout (" + ATTACH_TIMEOUT + "ms)"));
    }, ATTACH_TIMEOUT);
    chrome.debugger.attach({ tabId: tabId }, "1.3", () => {
      clearTimeout(timer);
      const err = chrome.runtime.lastError;
      if (err) { reject(new Error(err.message)); return; }
      attachedTabId = tabId;
      resolve();
    });
  });
}

function sendCommand(method, params) {
  if (attachedTabId === null) {
    return Promise.reject(new Error("No tab attached"));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("sendCommand timeout (" + COMMAND_TIMEOUT + "ms): " + method));
    }, COMMAND_TIMEOUT);
    chrome.debugger.sendCommand({ tabId: attachedTabId }, method, params || {}, (result) => {
      clearTimeout(timer);
      const err = chrome.runtime.lastError;
      if (err) { reject(new Error(err.message)); return; }
      resolve(result);
    });
  });
}

function detach() {
  if (attachedTabId === null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), 3000);
    chrome.debugger.detach({ tabId: attachedTabId }, () => {
      clearTimeout(timer);
      attachedTabId = null;
      resolve();
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== "offscreen-debugger") return false;
  (async () => {
    try {
      switch (msg.action) {
        case "attach":
          await attach(msg.tabId);
          sendResponse({ ok: true, tabId: msg.tabId });
          break;
        case "detach":
          await detach();
          sendResponse({ ok: true });
          break;
        case "send":
          if (attachedTabId === null) await attach(msg.tabId);
          const r = await sendCommand(msg.method, msg.params || {});
          sendResponse({ ok: true, result: r });
          break;
        case "execute":
          await attach(msg.tabId);
          const x = await sendCommand(msg.method, msg.params || {});
          await detach();
          sendResponse({ ok: true, result: x });
          break;
        default:
          sendResponse({ ok: false, error: "Unknown action: " + msg.action });
      }
    } catch (e) {
      try { await detach(); } catch (_) {}
      sendResponse({ ok: false, error: e.message || String(e) });
    }
  })();
  return true;
});
