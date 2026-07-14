/**
 * CDP 工具实现
 *
 * 通过 chrome.debugger API 实现的 7 个缺失工具：
 * mouse_click, snapshot, network, save_as_pdf, upload, cdp, close_tab
 *
 * 每个工具接受 params 参数对象，返回结果对象（遵循 Kimi Official 协议格式）。
 * V1-20260714
 */

import { attach, send } from "./cdpSession.js";

// ---------------------------------------------------------------------------
// 1. mouse_click — 真实鼠标点击（CDP Input.dispatchMouseEvent）
// ---------------------------------------------------------------------------

export interface MouseClickParams {
  selector?: string;
  ref?: string;
  x?: number;
  y?: number;
}

export async function handleMouseClick(
  tabId: number,
  params: MouseClickParams,
): Promise<Record<string, unknown>> {
  await attach(tabId);

  let targetX: number;
  let targetY: number;

  if (typeof params.x === "number" && typeof params.y === "number") {
    // 直接坐标
    targetX = params.x;
    targetY = params.y;
  } else {
    // 通过选择器或 ref 定位元素
    const selector = params.selector ?? params.ref;
    if (!selector) {
      throw new Error("mouse_click: requires selector/ref or x/y coordinates");
    }

    const evalResult = await send<{
      result?: { value?: { x?: number; y?: number; w?: number; h?: number } };
    }>("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { error: 'element not found: ' + ${JSON.stringify(selector)} };
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
      })()`,
      returnByValue: true,
    });

    const val = evalResult?.result?.value as
      | { x: number; y: number; w: number; h: number }
      | { error: string }
      | undefined;
    if (!val || "error" in val) {
      throw new Error(`mouse_click: ${(val as { error?: string })?.error ?? "element not found"}`);
    }
    targetX = val.x as number;
    targetY = val.y as number;
  }

  // 真实鼠标事件序列
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: targetX,
    y: targetY,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: targetX,
    y: targetY,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: targetX,
    y: targetY,
    button: "left",
    clickCount: 1,
  });

  return { success: true, x: Math.round(targetX), y: Math.round(targetY) };
}

// ---------------------------------------------------------------------------
// 2. snapshot — 无障碍树（CDP Accessibility.getFullAXTree）
// ---------------------------------------------------------------------------

export interface SnapshotParams {
  /** 是否包含详细属性 */
  detailed?: boolean;
}

export async function handleSnapshot(
  tabId: number,
  _params: SnapshotParams,
): Promise<Record<string, unknown>> {
  await attach(tabId);

  const tab = await chrome.tabs.get(tabId);
  const axTree = await send<{ nodes: unknown[] }>("Accessibility.getFullAXTree");

  return {
    url: tab.url,
    title: tab.title,
    tree: axTree.nodes,
    nodeCount: axTree.nodes.length,
  };
}

// ---------------------------------------------------------------------------
// 3. network — 网络请求捕获（CDP Network.*）
// ---------------------------------------------------------------------------

/** 网络请求记录存储 */
const networkStore = new Map<string, NetworkRecord>();

interface NetworkRecord {
  requestId: string;
  url: string;
  method: string;
  timestamp: number;
  status?: number;
  mimeType?: string;
  completed: boolean;
}

/** 已开启网络捕获的标签页 */
const networkActiveTabs = new Set<number>();

/** 是否已注册 onEvent 监听 */
let networkListenerRegistered = false;

function ensureNetworkListener(): void {
  if (networkListenerRegistered) return;
  networkListenerRegistered = true;

  chrome.debugger.onEvent.addListener((source, method, params) => {
    const tabId = source.tabId;
    if (!tabId || !networkActiveTabs.has(tabId)) return;

    if (method === "Network.requestWillBeSent" && params) {
      const p = params as { requestId: string; request?: { url: string; method: string }; timestamp?: number };
      networkStore.set(p.requestId, {
        requestId: p.requestId,
        url: p.request?.url ?? "",
        method: p.request?.method ?? "",
        timestamp: p.timestamp ?? Date.now(),
        completed: false,
      });
    }

    if (method === "Network.responseReceived" && params) {
      const p = params as { requestId: string; response?: { status: number; mimeType: string } };
      const record = networkStore.get(p.requestId);
      if (record && p.response) {
        record.status = p.response.status;
        record.mimeType = p.response.mimeType;
      }
    }

    if (method === "Network.loadingFinished" && params) {
      const p = params as { requestId: string };
      const record = networkStore.get(p.requestId);
      if (record) record.completed = true;
    }
  });
}

export interface NetworkParams {
  cmd: "start" | "stop" | "list" | "detail";
  filter?: string;
  requestId?: string;
}

export async function handleNetwork(
  tabId: number,
  params: NetworkParams,
): Promise<Record<string, unknown>> {
  ensureNetworkListener();

  switch (params.cmd) {
    case "start": {
      await attach(tabId);
      networkActiveTabs.add(tabId);
      networkStore.clear();
      await send("Network.enable");
      return { success: true, message: "network capture started" };
    }

    case "stop": {
      networkActiveTabs.delete(tabId);
      try {
        await send("Network.disable");
      } catch {
        // 忽略禁用失败
      }
      return { success: true, message: "network capture stopped" };
    }

    case "list": {
      let records = [...networkStore.values()];
      if (params.filter) {
        records = records.filter((r) => r.url.includes(params.filter!));
      }
      return {
        count: records.length,
        requests: records.map((r) => ({
          requestId: r.requestId,
          url: r.url,
          method: r.method,
          status: r.status,
          mimeType: r.mimeType,
          completed: r.completed,
        })),
      };
    }

    case "detail": {
      if (!params.requestId) throw new Error("network: requestId required for detail");
      const record = networkStore.get(params.requestId);
      if (!record) throw new Error(`network: request "${params.requestId}" not found`);

      await attach(tabId);
      const body = await send<{ body: string; base64Encoded?: boolean }>(
        "Network.getResponseBody",
        { requestId: params.requestId },
      );

      let parsedBody: unknown = body.body;
      if (!body.base64Encoded) {
        try {
          parsedBody = JSON.parse(body.body);
        } catch {
          // 保留原始字符串
        }
      }

      return {
        requestId: record.requestId,
        url: record.url,
        method: record.method,
        status: record.status,
        base64Encoded: body.base64Encoded ?? false,
        body: parsedBody,
      };
    }

    default:
      throw new Error(`network: unknown cmd "${params.cmd}"`);
  }
}

// ---------------------------------------------------------------------------
// 4. save_as_pdf — 存 PDF（CDP Page.printToPDF）
// ---------------------------------------------------------------------------

export interface SaveAsPdfParams {
  landscape?: boolean;
  printBackground?: boolean;
  scale?: number;
  paperFormat?: "letter" | "legal" | "a4" | "a3" | "tabloid";
  fileName?: string;
}

const PAPER_SIZES: Record<string, [number, number]> = {
  letter: [8.5, 11],
  legal: [8.5, 14],
  a4: [8.27, 11.69],
  a3: [11.69, 16.54],
  tabloid: [11, 17],
};

export async function handleSaveAsPdf(
  tabId: number,
  params: SaveAsPdfParams,
): Promise<Record<string, unknown>> {
  await attach(tabId);

  const format = (params.paperFormat ?? "letter").toLowerCase();
  const paperSize = (PAPER_SIZES[format] ?? PAPER_SIZES.letter)!;
  const [paperWidth, paperHeight] = paperSize;
  const scale = typeof params.scale === "number" ? Math.max(0.1, Math.min(2, params.scale)) : 1;

  const result = await send<{ data: string }>("Page.printToPDF", {
    printBackground: params.printBackground !== false,
    landscape: !!params.landscape,
    scale,
    paperWidth,
    paperHeight,
    preferCSSPageSize: true,
  });

  if (!result?.data) throw new Error("save_as_pdf: CDP returned no data");

  // 获取页面标题作为文件名参考
  let pageTitle = "";
  try {
    const titleResult = await send<{ result?: { value?: string } }>(
      "Runtime.evaluate",
      { expression: "document.title", returnByValue: true },
    );
    pageTitle = titleResult?.result?.value ?? "";
  } catch {
    // 忽略
  }

  return {
    data: result.data,
    mimeType: "application/pdf",
    dataLength: result.data.length,
    pageTitle,
    requestedFileName: params.fileName ?? "",
  };
}

// ---------------------------------------------------------------------------
// 5. upload — 文件上传（CDP DOM.setFileInputFiles）
// ---------------------------------------------------------------------------

export interface UploadParams {
  selector: string;
  files: string[];
}

export async function handleUpload(
  tabId: number,
  params: UploadParams,
): Promise<Record<string, unknown>> {
  if (!params.selector) throw new Error("upload: selector is required");
  if (!params.files || !Array.isArray(params.files) || params.files.length === 0) {
    throw new Error("upload: files is required (array of local file paths)");
  }

  await attach(tabId);

  // 查找文件输入元素
  const docResult = await send<{ root: { nodeId: number } }>("DOM.getDocument");
  const queryResult = await send<{ nodeId: number }>("DOM.querySelector", {
    nodeId: docResult.root.nodeId,
    selector: params.selector,
  });

  if (!queryResult?.nodeId) {
    throw new Error(`upload: element not found: ${params.selector}`);
  }

  await send("DOM.setFileInputFiles", {
    files: params.files,
    nodeId: queryResult.nodeId,
  });

  return {
    success: true,
    selector: params.selector,
    fileCount: params.files.length,
    files: params.files,
  };
}

// ---------------------------------------------------------------------------
// 6. cdp — 任意 CDP 命令透传
// ---------------------------------------------------------------------------

export interface CdpParams {
  method: string;
  params?: Record<string, unknown>;
}

export async function handleCdp(
  tabId: number,
  params: CdpParams,
): Promise<Record<string, unknown>> {
  if (!params.method) throw new Error("cdp: method is required");

  await attach(tabId);
  const result = await send(params.method, params.params ?? {});

  return result === null || result === undefined
    ? {}
    : (result as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// 7. close_tab — 关闭标签页（chrome.taps API）
// ---------------------------------------------------------------------------

export async function handleCloseTab(
  _tabId: number,
  params: { tabId?: number },
): Promise<Record<string, unknown>> {
  const targetTabId = params.tabId ?? _tabId;
  if (targetTabId == null) {
    return { success: true, closed: false, reason: "no tab specified" };
  }
  try {
    await chrome.tabs.remove(targetTabId);
    return { success: true, closed: true };
  } catch {
    return { success: true, closed: false, reason: "tab already closed" };
  }
}

// ---------------------------------------------------------------------------
// 8. Dual-Channel Tools（CDP 优先，失败可降级到 Content Script）
// ---------------------------------------------------------------------------

export interface ClickRefParams {
  target: { ref?: string; selector?: string; text?: string; name?: string };
  button?: string;
  clickCount?: number;
}

export async function handleClickRefCDP(
  tabId: number,
  params: ClickRefParams,
): Promise<Record<string, unknown>> {
  const selector = params.target?.selector;
  const ref = params.target?.ref;
  if (!selector && !ref) {
    throw new Error("click_ref: requires target.selector or target.ref");
  }

  await attach(tabId);

  // 用 CDP 找元素并真实点击
  const expr = selector
    ? `document.querySelector(${JSON.stringify(selector)})`
    : `(() => {
      const el = document.querySelector(${JSON.stringify(ref)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`;

  const evalResult = await send<{
    result?: { value?: unknown; subtype?: string };
  }>("Runtime.evaluate", {
    expression: selector
      ? `(() => {
          const el = ${expr};
          if (!el) return { error: 'element not found' };
          const r = el.getBoundingClientRect();
          el.scrollIntoView({ block: 'center' });
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.tagName };
        })()`
      : `(() => {
          const el = document.querySelector('[data-ref="${ref}"]');
          if (!el) return { error: 'ref not found' };
          const r = el.getBoundingClientRect();
          el.scrollIntoView({ block: 'center' });
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.tagName };
        })()`,
    returnByValue: true,
  });

  const val = evalResult?.result?.value as
    | { x: number; y: number; tag?: string }
    | { error: string }
    | undefined;

  if (!val || "error" in val) {
    throw new Error(`click_ref: ${(val as { error?: string })?.error ?? "failed"}`);
  }

  // 真实鼠标事件
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: val.x, y: val.y });
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed", x: val.x, y: val.y,
    button: params.button ?? "left", clickCount: params.clickCount ?? 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x: val.x, y: val.y,
    button: params.button ?? "left", clickCount: params.clickCount ?? 1,
  });

  return { success: true, x: Math.round(val.x), y: Math.round(val.y), tag: val.tag };
}

export interface FillCDPParams {
  target: { selector: string };
  value: string;
  clear?: boolean;
}

export async function handleFillCDP(
  tabId: number,
  params: FillCDPParams,
): Promise<Record<string, unknown>> {
  const selector = params.target?.selector;
  if (!selector) throw new Error("fill: target.selector is required");
  if (params.value === undefined) throw new Error("fill: value is required");

  await attach(tabId);

  const value = JSON.stringify(params.value);
  const clearField = params.clear !== false;

  const result = await send<{ result?: { value?: Record<string, unknown> } }>(
    "Runtime.evaluate",
    {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { error: 'element not found' };
        el.focus();
        ${clearField ? "el.value = '';" : ""}
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set;
        if (nativeSetter) nativeSetter.call(el, ${value});
        else el.value = ${value};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, tag: el.tagName };
      })()`,
      returnByValue: true,
    },
  );

  const val = result?.result?.value as { success?: boolean; error?: string } | undefined;
  if (!val || val.error) {
    throw new Error(`fill: ${val?.error ?? "failed"}`);
  }

  return { success: true, value: params.value };
}

export interface EvaluateCDPParams {
  code: string;
  args?: unknown;
  returnMode?: string;
  timeoutMs?: number;
}

export async function handleEvaluateCDP(
  tabId: number,
  params: EvaluateCDPParams,
): Promise<Record<string, unknown>> {
  if (!params.code) throw new Error("evaluate: code is required");

  await attach(tabId);

  const result = await send<{
    result?: { type?: string; value?: unknown; subtype?: string };
    exceptionDetails?: { text?: string; exception?: { description?: string } };
  }>("Runtime.evaluate", {
    expression: params.code,
    returnByValue: params.returnMode !== "preview",
    awaitPromise: true,
    timeout: params.timeoutMs ?? 5000,
  });

  if (result.exceptionDetails) {
    throw new Error(
      `evaluate: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
    );
  }

  return {
    type: result.result?.type,
    value: result.result?.value,
    subtype: result.result?.subtype,
  };
}

export async function handleScreenshotCDP(
  tabId: number,
  _params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await attach(tabId);

  const result = await send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
  });

  if (!result?.data) throw new Error("screenshot: CDP returned no data");

  return { format: "png", dataLength: result.data.length, data: result.data };
}

// ---------------------------------------------------------------------------
// Tool Router — 统一分派入口
// ---------------------------------------------------------------------------

export type CdpToolHandler = (
  tabId: number,
  params: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

const cdpToolMap: Record<string, CdpToolHandler> = {
  mouse_click: (tabId, p) => handleMouseClick(tabId, p as unknown as MouseClickParams),
  snapshot: (tabId, p) => handleSnapshot(tabId, p as unknown as SnapshotParams),
  network: (tabId, p) => handleNetwork(tabId, p as unknown as NetworkParams),
  save_as_pdf: (tabId, p) => handleSaveAsPdf(tabId, p as unknown as SaveAsPdfParams),
  upload: (tabId, p) => handleUpload(tabId, p as unknown as UploadParams),
  cdp: (tabId, p) => handleCdp(tabId, p as unknown as CdpParams),
  close_tab: (tabId, p) => handleCloseTab(tabId, p),
  close_session: (tabId, p) => handleCloseTab(tabId, p), // 用法兼容
  // Dual-channel tools（CDP 优先）
  click_ref: (tabId, p) => handleClickRefCDP(tabId, p as unknown as ClickRefParams),
  fill: (tabId, p) => handleFillCDP(tabId, p as unknown as FillCDPParams),
  evaluate_v2: (tabId, p) => handleEvaluateCDP(tabId, p as unknown as EvaluateCDPParams),
  capture_screenshot: (tabId, p) => handleScreenshotCDP(tabId, p),
};

/** 判断工具名是否走 CDP 通道 */
export function isCdpTool(tool: string): boolean {
  return tool in cdpToolMap;
}

/** 双通道工具集（CDP 优先，失败降级到 Content Script） */
const dualChannelTools = new Set([
  "click_ref",
  "fill",
  "evaluate_v2",
  "capture_screenshot",
]);

/** 判断是否为双通道工具 */
export function isDualChannelTool(tool: string): boolean {
  return dualChannelTools.has(tool);
}

/** 执行 CDP 工具 */
export async function executeCdpTool(
  tool: string,
  tabId: number,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const handler = cdpToolMap[tool];
  if (!handler) {
    throw new Error(`Unknown CDP tool: ${tool}`);
  }
  return handler(tabId, args);
}
