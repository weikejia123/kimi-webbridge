# 20260714-001-kimi-webbridge-manual-test.md

> 测试日期：2026-07-14
> 测试者：（填写姓名）
> 测试环境：Chrome（加载已解压的扩展）+ Node.js Daemon（127.0.0.1:10086）
> 前置条件：`my-scripts/build-pack.sh` 成功，Chrome 已加载 `extension/` 目录

---

## 测试准备

### 0.1 启动 Daemon

```bash
cd projects/chrome-ext/kimi-webbridge
npm run start:daemon
```

预期：终端显示 `WebSocket server running on ws://127.0.0.1:10086`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 备注 | |

### 0.2 确认 Extension 已加载

Chrome 打开 `chrome://extensions/`，确认 "Fahd's WebBridge 0.7.0" 已启用且无错误

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 备注（如有错误红色提示） | |

---

## 1. WebSocket 连接与保活

### 1.1 自动连接

等待 5 秒，查看 Chrome 扩展 Service Worker 的控制台输出（`chrome://extensions/` → 点 "service worker" 链接 → Console）

预期：显示 `[Fahd's WebBridge] Connected to daemon`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 日志内容 | |

### 1.2 断线重连

停止 Daemon（`Ctrl+C`），等待几秒，再启动 Daemon

预期：控制台显示重连日志，最终重新 `Connected`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 备注 | |

---

## 2. CDP 纯工具测试

> 以下测试需用 WebSocket 客户端向 Daemon 发送 JSON 命令。
> 简易方法：打开浏览器 DevTools Console（在普通页面中，如 `about:blank` 除外），执行以下 JS 脚本。

### 2.1 mouse_click — 真实鼠标点击

**测试步骤**：
1. 在浏览器中打开 `https://www.baidu.com`
2. 在 Console 中执行：

```js
const ws = new WebSocket('ws://127.0.0.1:10086/ws');
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'tool_call', requestId: 'test-001',
    payload: { name: 'mouse_click', args: { selector: '#kw' } }
  }));
};
ws.onmessage = (e) => console.log('Response:', e.data);
```

预期：鼠标移动到百度搜索框中央（实际移动），然后执行左键点击。返回 `{success: true, x: ..., y: ...}`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 返回数据 | |

### 2.2 snapshot — 无障碍树

```js
ws.send(JSON.stringify({
  type: 'tool_call', requestId: 'test-002',
  payload: { name: 'snapshot', args: {} }
}));
```

预期：返回包含 `url`, `title`, `tree`（完整 AX 节点树）, `nodeCount` 的 JSON

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| nodeCount 值 | |

### 2.3 network — 网络请求捕获

```js
// 开始捕获
ws.send(JSON.stringify({
  type: 'tool_call', requestId: 'test-003a',
  payload: { name: 'network', args: { cmd: 'start' } }
}));
// 等几秒，让页面发一些请求，然后列出
setTimeout(() => {
  ws.send(JSON.stringify({
    type: 'tool_call', requestId: 'test-003b',
    payload: { name: 'network', args: { cmd: 'list' } }
  }));
}, 3000);
// 获取详情（用上面 list 返回的第一个 requestId）
ws.send(JSON.stringify({
  type: 'tool_call', requestId: 'test-003c',
  payload: { name: 'network', args: { cmd: 'detail', requestId: '<实际requestId>' } }
}));
// 停止捕获
ws.send(JSON.stringify({
  type: 'tool_call', requestId: 'test-003d',
  payload: { name: 'network', args: { cmd: 'stop' } }
}));
```

预期：
- start: `{success: true, message: "network capture started"}`
- list: `{count: >0, requests: [...]}`（有实际网络请求记录）
- detail: 返回请求的完整 URL、状态码、响应体
- stop: `{success: true, message: "network capture stopped"}`

| 测试项 | 通过 | 失败 | 备注 |
|--------|:---:|:----:|------|
| start | [ ] | [ ] | |
| list（count > 0） | [ ] | [ ] | count= |
| detail | [ ] | [ ] | |
| stop | [ ] | [ ] | |

### 2.4 save_as_pdf — 存 PDF

```js
ws.send(JSON.stringify({
  type: 'tool_call', requestId: 'test-004',
  payload: { name: 'save_as_pdf', args: { landscape: false, format: 'a4' } }
}));
```

预期：返回 `{data: "<base64>", mimeType: "application/pdf", dataLength: <number>, ...}`
验证：可将 base64 data 在浏览器中打开 `data:application/pdf;base64,<data>` 查看是否显示 PDF

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| dataLength | |

### 2.5 upload — 文件上传

**测试步骤**：
1. 打开一个包含 `<input type="file">` 的页面（如 https://developer.mozilla.org/zh-CN/docs/Web/HTML/Element/input/file 的示例）
2. 执行：

```js
ws.send(JSON.stringify({
  type: 'tool_call', requestId: 'test-005',
  payload: { name: 'upload', args: { selector: 'input[type="file"]', files: ['/tmp/test.txt'] } }
}));
```

> 需先创建 /tmp/test.txt：`echo "hello" > /tmp/test.txt`

预期：`{success: true, selector: "input[type=\"file\"]", fileCount: 1, files: ["/tmp/test.txt"]}`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 备注 | |

### 2.6 cdp — 任意 CDP 命令透传

```js
ws.send(JSON.stringify({
  type: 'tool_call', requestId: 'test-006',
  payload: { name: 'cdp', args: { method: 'Page.getLayoutMetrics', params: {} } }
}));
```

预期：返回 `{layoutViewport: {...}, contentSize: {...}}` 等页面布局指标

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 返回数据片段 | |

### 2.7 close_tab — 关闭标签页

```js
ws.send(JSON.stringify({
  type: 'tool_call', requestId: 'test-007',
  payload: { name: 'close_tab', args: { tabId: <当前标签页ID> } }
}));
```

> tabId 可通过 `list_tabs` 获取

预期：标签页关闭，返回 `{success: true, closed: true}`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 备注 | |

---

## 3. 双通道工具测试（CDP 优先 + Content Script 降级）

### 3.1 click_ref — CDP 真实点击

```js
ws.send(JSON.stringify({
  type: 'tool_call', requestId: 'test-008',
  payload: { name: 'click_ref', args: { target: { selector: '#su' } } }
}));
```

> 在百度页面执行，`#su` 是百度搜索按钮

预期：鼠标在搜索按钮位置执行真实点击。页面应开始搜索或跳转。
返回 `{success: true, x: ..., y: ..., tag: "INPUT"}`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 页面反应 | |

### 3.2 fill — CDP 表单填充

```js
ws.send(JSON.stringify({
  type: 'tool_call', requestId: 'test-009',
  payload: { name: 'fill', args: { target: { selector: '#kw' }, value: 'CDP 测试' } }
}));
```

> 在百度页面执行，`#kw` 是搜索输入框

预期：搜索框填入「CDP 测试」文字，返回 `{success: true, value: "CDP 测试"}`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 页面反应 | |

### 3.3 evaluate_v2 — CDP 执行 JS

```js
ws.send(JSON.stringify({
  type: 'tool_call', requestId: 'test-010',
  payload: { name: 'evaluate_v2', args: { code: 'document.title', returnMode: 'json' } }
}));
```

预期：返回 `{type: "string", value: "<当前页面标题>", subtype: undefined}`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 返回值 | |

### 3.4 capture_screenshot — CDP 截图

```js
ws.send(JSON.stringify({
  type: 'tool_call', requestId: 'test-011',
  payload: { name: 'capture_screenshot', args: {} }
}));
```

预期：返回 `{format: "png", dataLength: <large number>, data: "<base64>"}`
验证：在浏览器地址栏输入 `data:image/png;base64,<data>` 查看图片

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| dataLength | |

---

## 4. 双通道降级测试

### 4.1 模拟 CDP 失败 → 期望降级到 Content Script

> 场景：在 `chrome://extensions/` 等 CDP 无法 attach 的页面执行 click_ref

1. 在 Chrome 地址栏打开 `chrome://extensions/` 标签页
2. 执行 click_ref 命令（随便选个元素）

预期：CDP attach 失败 → 控制台打印 `[Fahd's WebBridge] CDP click_ref failed, falling back to content script: ...`
→ 自动通过 Content Script 路径执行点击

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 控制台输出片段 | |

---

## 5. 回归测试（已有功能正常）

### 5.1 navigate

```js
ws.send(JSON.stringify({
  type: 'tool_call', requestId: 'test-r1',
  payload: { name: 'navigate', args: { url: 'https://www.baidu.com' } }
}));
```

预期：新标签页打开百度

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |

### 5.2 list_tabs

```js
ws.send(JSON.stringify({
  type: 'tool_call', requestId: 'test-r2',
  payload: { name: 'list_tabs', args: {} }
}));
```

预期：返回所有已打开标签页列表

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |

### 5.3 reload

```js
ws.send(JSON.stringify({
  type: 'tool_call', requestId: 'test-r3',
  payload: { name: 'reload', args: {} }
}));
```

预期：当前页面刷新

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |

---

## 测试总结

| 测试类别 | 通过数 | 失败数 | 覆盖率 |
|----------|:------:|:------:|:------:|
| 测试准备（2 项） | / | / | |
| WebSocket 连接（2 项） | / | / | |
| CDP 纯工具（7 项） | / | / | |
| 双通道工具（4 项） | / | / | |
| 降级测试（1 项） | / | / | |
| 回归测试（3 项） | / | / | |
| **总计** | **/** | **/** | |

### 发现的问题

| 序号 | 问题描述 | 严重程度 | 状态 |
|------|---------|:--------:|:----:|
| | | | |

> 严重程度：🔴 阻断 / 🟡 一般 / 🟢 轻微
> 状态：待修复 / 已修复 / 不修复

### 备注 / 建议
