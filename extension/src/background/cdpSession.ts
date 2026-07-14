/**
 * Offscreen Document 管理器
 *
 * 负责创建/关闭 offscreen document，并通过消息传递执行 CDP 调试命令。
 * V1-20260714
 */

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen/offscreen.html");

/** 确保 offscreen document 已创建 */
async function ensureOffscreen(): Promise<void> {
  // chrome.runtime.getContexts 是 MV3 方法，需判断可用性
  if (typeof chrome.runtime.getContexts === "function") {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
      documentUrls: [OFFSCREEN_URL],
    });
    if (existing && existing.length > 0) return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["BLOBS" as chrome.offscreen.Reason],
      justification: "Execute chrome.debugger commands outside service worker",
    });
  } catch (err) {
    // 如果已存在会抛错，忽略
    if (
      err instanceof Error &&
      err.message?.includes("already exists")
    ) {
      return;
    }
    throw err;
  }
}

/** 向 offscreen document 发送调试命令 */
async function sendToOffscreen(
  action: string,
  tabId: number,
  method?: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  await ensureOffscreen();

  return new Promise((resolve, reject) => {
    const msg: Record<string, unknown> = {
      target: "offscreen-debugger",
      action,
      tabId,
    };
    if (method) msg.method = method;
    if (params !== undefined) msg.params = params;

    const timeout = setTimeout(() => {
      reject(new Error("offscreen response timeout (15s)"));
    }, 15000);

    chrome.runtime.sendMessage(msg, (response) => {
      clearTimeout(timeout);
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        reject(new Error(lastErr.message));
        return;
      }
      if (!response || !response.ok) {
        reject(new Error(response?.error ?? "Unknown offscreen error"));
        return;
      }
      resolve(response.result);
    });
  });
}

// ---------------------------------------------------------------------------
// 对外接口（替代原有的 chrome.debugger 直接调用）
// ---------------------------------------------------------------------------

let activeTabId: number | null = null;

export async function attach(tabId: number): Promise<void> {
  await sendToOffscreen("attach", tabId);
  activeTabId = tabId;
}

export async function send<T = unknown>(
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  if (activeTabId === null) {
    throw new Error("CDP: no tab attached — call cdpAttach(tabId) first");
  }
  return (await sendToOffscreen(
    "send",
    activeTabId,
    method,
    params,
  )) as T;
}

export async function detach(tabId?: number): Promise<void> {
  const target = tabId ?? activeTabId;
  if (target === null) return;
  await sendToOffscreen("detach", target);
  if (activeTabId === target) activeTabId = null;
}

export function getAttachedTabId(): number | null {
  return activeTabId;
}

export function isAttached(): boolean {
  return activeTabId !== null;
}
