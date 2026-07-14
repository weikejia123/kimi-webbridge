# kimi-webbridge 融合方案设计（V1-20260714）

> 融合 Kimi Official（CDP 深度控制）与 Fahd's WebBridge（Content Script 精细 DOM 操作）
> 遵循"不破坏上游，my-前缀隔离"原则

## 1. 设计目标

吸取两者之长，打造双通道浏览器控制引擎：

| 通道 | 能力来源 | 适用场景 |
|------|---------|---------|
| **CDP 通道**（新增） | Kimi Official 的 17 个工具集 | 深度浏览器控制（截图/PDF/网络/鼠标事件/无障碍树） |
| **Content Script 通道**（保留） | Fahd's 现有的 35 个模块 | 元素稳定性追踪、操作验证、页面变化检测、高亮覆盖 |

## 2. 架构总览

```
AI Agent / Daemon（Node.js, 127.0.0.1:10086）
  │
  │ WebSocket JSON-RPC（兼容 Kimi 协议 /ws）
  ▼
Extension Service Worker（background/serviceWorker.ts）
  │
  ├── CDP Path（chrome.debugger API）
  │   ├── navigate / find_tab / close_tab / list_tabs
  │   ├── evaluate（Runtime.evaluate）
  │   ├── click / fill / mouse_click（DOM + Input）
  │   ├── key_type / send_keys（Input.*）
  │   ├── screenshot / save_as_pdf（Page.*）
  │   ├── snapshot（Accessibility.getFullAXTree）
  │   ├── network（Network.*）
  │   ├── upload（DOM.setFileInputFiles）
  │   └── cdp（任意 CDP 命令透传）
  │
  └── Content Script Path（tabs.sendMessage → content/）
      ├── elementRegistry / elementResolver / elementScanner
      ├── clickAt / fillNative / selectOption / hover
      ├── actionability / domStability / pageState
      ├── highlightOverlay / automationOverlay
      ├── pageDiff / templateExtractor / textExtractor
      └── formClassifier / formSubmit / evaluateV2 / keyboard
```

## 3. 融合策略

### 3.1 优先使用 CDP，Content Script 做补充

```
调用某个工具时：
  1. 如果该操作有 CDP 实现，默认走 CDP
  2. 如需内容验证（元素是否存在、是否可交互），先用 CDP 评估
  3. 如需精确 DOM 级操作验证（动作后检查页面变化），走 content script
  4. 如果 CDP 调用失败，fallback 到 content script 实现
```

### 3.2 关键融合点

| 工具 | CDP 实现 | Content Script 补充 |
|------|---------|-------------------|
| click | Input.dispatchMouseEvent + DOM.resolveNode | clickAt 做稳定性验证 + highlight |
| fill | Runtime.evaluate 设 value + dispatchEvent | fillNative 做 contenteditable 兼容 |
| screenshot | Page.captureScreenshot | annotatedScreenshot 做标注 |
| snapshot | Accessibility.getFullAXTree → @e refs | elementScanner 做补充 DOM 细节 |
| evaluate | Runtime.evaluate（CDP 有 sandbox） | evaluateSandbox（CS 有 DOM 上下文） |

### 3.3 工具矩阵（完整 17+ 工具）

```
┌─────────────────┬──────────┬──────────────┬──────────────────┐
│ 工具             │ 通道      │ CDP 命令      │ Fahd's 已有      │
├─────────────────┼──────────┼──────────────┼──────────────────┤
│ navigate        │ CDP      │ Page.navigate │ browserActions   │
│ find_tab        │ CDP      │ tabs.query    │ handleListTabs   │
│ close_tab       │ CDP      │ tabs.remove   │ ❌               │
│ close_session   │ CDP      │ tabs.remove[] │ batch runner     │
│ list_tabs       │ CDP      │ tabs.query    │ handleListTabs   │
│ evaluate        │ CDP      │ Runtime.eval  │ evaluateV2       │
│ click           │ 双通道   │ Input.mouse   │ clickAt          │
│ mouse_click     │ CDP      │ Input.mouse   │ ❌               │
│ fill            │ 双通道   │ Runtime.eval  │ fillNative       │
│ key_type        │ CDP      │ Input.insert  │ keyboard         │
│ send_keys       │ CDP      │ Input.dispatch│ ❌（有 keyboard）│
│ screenshot      │ CDP      │ Page.capture  │ annotatedScrn    │
│ save_as_pdf     │ CDP      │ Page.print    │ ❌               │
│ snapshot        │ CDP      │ AXTree        │ ❌               │
│ network         │ CDP      │ Network.*     │ ❌               │
│ upload          │ CDP      │ DOM.setFiles  │ ❌               │
│ cdp             │ CDP      │ 透传任意命令  │ ❌               │
└─────────────────┴──────────┴──────────────┴──────────────────┘
```

## 4. WebSocket 协议

### 4.1 连接

- URL: `ws://127.0.0.1:10086/ws`（兼容 Kimi 官方路径）
- 自动重连：30s 间隔（chrome.alarms）
- 连接超时：10s

### 4.2 消息格式

**Extension → Daemon（上行）：**
```json
// 连接建立时
{"type": "hello", "payload": {"extensionVersion": "x.y.z"}}

// 心跳响应
{"type": "pong"}

// 工具执行结果
{"type": "tool_result", "responseToRequestId": "<id>", "payload": {"data": {...}}}
// 或错误
{"type": "tool_result", "responseToRequestId": "<id>", "payload": {"error": "..."}}
```

**Daemon → Extension（下行）：**
```json
// 心跳
{"type": "ping"}

// 确认
{"type": "hello_ack"}

// 工具调用请求
{"type": "tool_call", "requestId": "<id>", "payload": {"name": "navigate", "args": {"url": "..."}}}
```

### 4.3 Popup 通信（runtime.onMessage）

```typescript
// 弹窗 → background
{type: "GET_STATUS"}                    → {connected, serverUrl}
{type: "CONNECT", url: "ws://..."}      → {success}
{type: "DISCONNECT"}                     → {success}
{type: "TEST_CONNECTION", url: "..."}   → {ok, reason?}
```

## 5. 文件变更清单

### 5.1 新增文件

| 文件 | 用途 |
|------|------|
| `extension/src/background/cdpTools.ts` | CDP 工具实现（17 个工具的 CDP 封装） |
| `extension/src/background/cdpSession.ts` | CDP 会话管理（attach/detach/命令发送） |
| `extension/src/background/reconnectManager.ts` | 重连管理器（alarms 驱动的 30s 重连） |
| `extension/src/popup/` | React 弹窗组件（状态/设置/高级配置） |
| `extension/icons/` | 插件图标（16/32/48/128） |
| `extension/_locales/en/messages.json` | 英文语言包 |
| `extension/_locales/zh_CN/messages.json` | 中文语言包 |
| `extension/public/popup.html` | 弹窗入口 HTML |

### 5.2 修改文件

| 文件 | 改动 |
|------|------|
| `extension/manifest.json` | +debugger 权限，+popup，+icons，+default_locale，+action |
| `extension/src/background/serviceWorker.ts` | +CDP 层初始化，+重连管理器，+popup 消息路由 |
| `extension/src/shared/protocol.ts` | +CDP 命令类型，+popup 消息类型 |

### 5.3 保留不变

| 目录 | 原因 |
|------|------|
| `extension/src/content/` | Content Script 全套保留作为补充通道 |
| `extension/src/shared/errors.ts` | 错误类型复用 |
| `daemon/` | 已有 daemon 保持不变，兼容 /ws 路径 |
| `scripts/` | 构建脚本不变 |

## 6. CDP 工具详细设计（cdpTools.ts）

### 6.1 CDP 会话管理（cdpSession.ts）

```typescript
class CdpSession {
  attachedTabId: number | null;

  async attach(tabId: number): Promise<void>
  async detach(): Promise<void>
  async send<T>(method: string, params?: object): Promise<T>
  isAttached(): boolean
  getAttachedTabId(): number | null
}
```

使用 `chrome.debugger` API，按需 attach/detach。

### 6.2 工具实现

每个工具是一个 `async` 函数，遵循统一签名：

```typescript
type ToolHandler = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
```

**navigate** — `chrome.debugger.sendCommand({tabId}, 'Page.navigate', {url})`
**find_tab** — `chrome.tabs.query()` + URL hostname 匹配
**close_tab** — `chrome.tabs.remove(tabId)` 或 Close session batch
**click** — CDP: DOM.getDocument → DOM.querySelector → DOM.resolveNode → Runtime.callFunctionOn(click)
**mouse_click** — CDP: DOM.getBoxModel → Input.dispatchMouseEvent(pressed/released)
**fill** — CDP: DOM.getDocument → DOM.querySelector → Runtime.evaluate(set value + dispatchEvent)
**key_type** — CDP: Input.insertText
**send_keys** — CDP: Input.dispatchKeyEvent (with modifier bits)
**screenshot** — CDP: Page.captureScreenshot (with optional clip)
**save_as_pdf** — CDP: Page.printToPDF
**snapshot** — CDP: Accessibility.getFullAXTree → 格式化成结构化树 + @e refs
**network** — CDP: Network.enable/disable → 监听 Network.requestWillBeSent/responseReceived/loadingFinished → getResponseBody
**upload** — CDP: DOM.querySelector → DOM.setFileInputFiles
**evaluate** — CDP: Runtime.evaluate (with awaitPromise)
**cdp** — 透传：任意 method + params，返回原始结果

### 6.3 标签页管理

```typescript
// 维护会话内标签页 ID 集合
const sessionTabIds = new Set<number>();
let activeTabId: number | null = null;
```

## 7. 实施计划

### Phase 1：基础设施（CDP 层）
1. 创建 `cdpSession.ts` — CDP attach/detach/send 封装
2. 创建 `cdpTools.ts` — 7 个缺失工具实现（mouse_click, snapshot, network, save_as_pdf, upload, cdp, close_tab/list_tabs）
3. 修改 `manifest.json` — 加 debugger 权限

### Phase 2：重连 + Popup
4. 创建 `reconnectManager.ts` — alarms 驱动的 30s 重连
5. 创建 popup 目录 + React 组件
6. 添加 icons 和 _locales

### Phase 3：现有工具增强
7. 增强 click/fill（CDP 优先 + content script fallback）
8. 增强 screenshot（CDP + content script 标注合成）
9. 增强 evaluate（CDP + content script sandbox 双通道）

### Phase 4：测试 + 文档
10. 测试全部 17 个工具
11. 编写使用文档到 my-docs/

## 8. 关键决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| CDP attach 策略 | 按需 attach（每次操作前 attach，操作后保持） | 避免权限弹窗，性能可接受 |
| 重连间隔 | 30s（chrome.alarms） | Kimi 官方策略，平衡省电和响应 |
| WebSocket 路径 | 兼容 `/ws`（Kimi 官方格式） | 方便复用 Kimi daemon 或兼容生态 |
| Popup 框架 | 原生 HTML + CSS（不引入 React） | 减少构建复杂度，保持轻量 |
| 错误处理 | CDP 优先，失败 fallback 到 content script | 两种场景都不漏 |
