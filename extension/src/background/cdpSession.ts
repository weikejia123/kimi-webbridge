/**
 * CDP Session Manager
 *
 * 封装 chrome.debugger API，管理标签页的 Debugger 会话生命周期。
 * 按需 attach（每次操作前 attach，操作后保持），避免反复弹权限窗口。
 * V1-20260714
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let attachedTabId: number | null = null;
let attachInProgress = false;
const attachQueue: Array<{
  resolve: (tabId: number) => void;
  reject: (err: Error) => void;
}> = [];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** 当前已 attach 的标签页 ID，没有则 null */
export function getAttachedTabId(): number | null {
  return attachedTabId;
}

/** 是否已 attach */
export function isAttached(): boolean {
  return attachedTabId !== null;
}

/**
 * 将 Debugger attach 到指定标签页。
 * 如果已经是该标签页则直接返回，否则 detach 旧的再 attach 新的。
 */
export async function attach(tabId: number): Promise<void> {
  if (attachedTabId === tabId) return;

  // 如果正在 attach 过程中，排队等待
  if (attachInProgress) {
    return new Promise<void>((resolve, reject) => {
      attachQueue.push({ resolve: () => resolve(), reject });
    });
  }

  attachInProgress = true;
  try {
    // Detach 旧的
    if (attachedTabId !== null && attachedTabId !== tabId) {
      await detachInternal(attachedTabId);
    }

    // Attach 新的
    if (attachedTabId !== tabId) {
      await new Promise<void>((resolve, reject) => {
        chrome.debugger.attach(
          { tabId },
          "1.3",
          () => {
            const lastErr = chrome.runtime.lastError;
            if (lastErr) {
              reject(new Error(`debugger.attach failed: ${lastErr.message}`));
              return;
            }
            attachedTabId = tabId;
            resolve();
          },
        );
      });
    }

    // 唤醒队列
    for (const item of attachQueue) item.resolve(tabId);
    attachQueue.length = 0;
  } catch (err) {
    for (const item of attachQueue) item.reject(err as Error);
    attachQueue.length = 0;
    throw err;
  } finally {
    attachInProgress = false;
  }
}

/**
 * 从指定标签页 detach。
 * 如果 tabId 匹配当前 attach 的标签页，置空 attachedTabId。
 */
export async function detach(tabId?: number): Promise<void> {
  const target = tabId ?? attachedTabId;
  if (target === null) return;
  await detachInternal(target);
  if (attachedTabId === target) attachedTabId = null;
}

/**
 * 通过 CDP 发送命令到当前已 attach 的标签页。
 * 必须先调用 attach()。
 */
export async function send<T = unknown>(
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  if (attachedTabId === null) {
    throw new Error("CDP: no tab attached — call cdpAttach(tabId) first");
  }

  return new Promise<T>((resolve, reject) => {
    chrome.debugger.sendCommand(
      { tabId: attachedTabId! },
      method,
      params ?? {},
      (result) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          reject(new Error(`CDP ${method} failed: ${lastErr.message}`));
          return;
        }
        resolve(result as T);
      },
    );
  });
}

/**
 * 确保标签页已 attach。如果 tabId 匹配当前则跳过，否则 attach。
 * 便捷方法：直接 attach + 检查。
 */
export async function ensureAttached(tabId: number): Promise<void> {
  await attach(tabId);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function detachInternal(tabId: number): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      chrome.debugger.detach(
        { tabId },
        () => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) {
            // "Debugger is not attached" 可忽略
            if (
              lastErr.message?.includes("not attached") ||
              lastErr.message?.includes("No tab with given id")
            ) {
              resolve();
              return;
            }
            reject(new Error(`debugger.detach failed: ${lastErr.message}`));
            return;
          }
          resolve();
        },
      );
    });
  } catch {
    // 忽略 detach 错误
  }
}

// chrome.debugger.onDetach 监听
chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId === attachedTabId) {
    attachedTabId = null;
  }
});
