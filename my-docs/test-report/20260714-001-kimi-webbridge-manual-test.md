# 20260714-001-kimi-webbridge-manual-test.md

> 测试日期：2026-07-14
> 测试者：（填写姓名）
> 测试环境：Chrome（加载已解压的扩展）+ Node.js Daemon（127.0.0.1:10186）
> 前置条件：`my-scripts/build-pack.sh` 成功，Chrome 已加载 `extension/` 目录
> 测试工具：`node my-scripts/test-tool.mjs <tool名> [参数JSON]`（绕过浏览器 CSP）

---

## 测试准备

### 0.1 启动 Daemon

```bash
./my-scripts/daemon.sh start
```

预期：显示 `daemon 运行中 — ws://127.0.0.1:10186`

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

等待 5 秒，执行：

```bash
node my-scripts/test-tool.mjs ping
```

预期：返回 `{result: {pong: true}}`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 返回数据 | |

### 1.2 list_tabs 基础验证

```bash
node my-scripts/test-tool.mjs list_tabs
```

预期：返回 `{result: {tabs: [...], total: <数量>}}`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| total 值 | |

---

## 2. CDP 纯工具测试

### 2.1 mouse_click — 真实鼠标点击

**测试步骤**：
1. 在浏览器中打开 `https://www.baidu.com`
2. 在终端执行：

```bash
node my-scripts/test-tool.mjs mouse_click '{"selector":"#kw"}'
```

预期：鼠标移动到百度搜索框中央并点击。返回 `{success: true, x: ..., y: ...}`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 返回数据 | |

### 2.2 snapshot — 无障碍树

```bash
node my-scripts/test-tool.mjs snapshot
```

预期：返回包含 `url`, `title`, `tree`, `nodeCount` 的 JSON

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| nodeCount 值 | |

### 2.3 network — 网络请求捕获

```bash
# 开始捕获
node my-scripts/test-tool.mjs network '{"cmd":"start"}'
# 等几秒，让页面发请求，然后列出
node my-scripts/test-tool.mjs network '{"cmd":"list"}'
# 获取详情（用上面 list 返回的第一个 requestId 替换）
node my-scripts/test-tool.mjs network '{"cmd":"detail","requestId":"<实际requestId>"}'
# 停止捕获
node my-scripts/test-tool.mjs network '{"cmd":"stop"}'
```

预期：
- start: `{success: true, message: "network capture started"}`
- list: `{count: >0, requests: [...]}`
- detail: 返回请求的 URL、状态码、响应体
- stop: `{success: true, message: "network capture stopped"}`

| 测试项 | 通过 | 失败 | 备注 |
|--------|:---:|:----:|------|
| start | [ ] | [ ] | |
| list（count > 0） | [ ] | [ ] | count= |
| detail | [ ] | [ ] | |
| stop | [ ] | [ ] | |

### 2.4 save_as_pdf — 存 PDF

```bash
node my-scripts/test-tool.mjs save_as_pdf '{"landscape":false,"paperFormat":"a4"}'
```

预期：返回 `{data: "<base64>", mimeType: "application/pdf", dataLength: <number>}`
验证：在浏览器地址栏输入 `data:application/pdf;base64,<data>` 查看

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| dataLength | |

### 2.5 upload — 文件上传

**测试步骤**：
1. 打开一个含 `<input type="file">` 的页面（如 MDN 示例页面）
2. 创建测试文件：`echo "hello" > /tmp/test.txt`
3. 执行：

```bash
node my-scripts/test-tool.mjs upload '{"selector":"input[type=\"file\"]","files":["/tmp/test.txt"]}'
```

预期：`{success: true, selector: "input[type=\"file\"]", fileCount: 1, files: ["/tmp/test.txt"]}`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 返回数据 | |

### 2.6 cdp — 任意 CDP 命令透传

```bash
node my-scripts/test-tool.mjs cdp '{"method":"Page.getLayoutMetrics","params":{}}'
```

预期：返回 `{layoutViewport: {...}, contentSize: {...}}`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 返回数据片段 | |

### 2.7 close_tab — 关闭标签页

```bash
node my-scripts/test-tool.mjs close_tab '{"tabId":<标签页ID>}'
```

> tabId 通过 list_tabs 获取

预期：标签页关闭，返回 `{success: true, closed: true}`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 备注 | |

---

## 3. 双通道工具测试（CDP 优先 + Content Script 降级）

### 3.1 click_ref — CDP 真实点击

在百度页面（`#su` 是搜索按钮）：

```bash
node my-scripts/test-tool.mjs click_ref '{"target":{"selector":"#su"}}'
```

预期：鼠标在搜索按钮上真实点击，页面开始搜索。返回 `{success: true, x: ..., y: ...}`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 页面反应 | |

### 3.2 fill — CDP 表单填充

在百度页面（`#kw` 是搜索输入框）：

```bash
node my-scripts/test-tool.mjs fill '{"target":{"selector":"#kw"},"value":"CDP测试"}'
```

预期：搜索框填入「CDP测试」，返回 `{success: true, value: "CDP测试"}`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 页面反应 | |

### 3.3 evaluate_v2 — CDP 执行 JS

```bash
node my-scripts/test-tool.mjs evaluate_v2 '{"code":"document.title","returnMode":"json"}'
```

预期：返回 `{type: "string", value: "<当前页面标题>"}`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 返回值 | |

### 3.4 capture_screenshot — CDP 截图

```bash
node my-scripts/test-tool.mjs capture_screenshot
```

预期：返回 `{format: "png", dataLength: <大量>, data: "<base64>"}`
验证：浏览器打开 `data:image/png;base64,<data>`

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| dataLength | |

---

## 4. 双通道降级测试

### 4.1 模拟 CDP 失败 → 期望降级到 Content Script

在 `chrome://extensions/` 页面执行 click_ref（CDP 无法 attach 该页面）：

```bash
node my-scripts/test-tool.mjs click_ref '{"target":{"selector":"body"}}'
```

预期：CDP attach 失败 → 控制台打印降级日志 → 自动通过 Content Script 路径执行

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |
| 返回数据 | |

---

## 5. 回归测试（已有功能正常）

### 5.1 navigate

```bash
node my-scripts/test-tool.mjs navigate '{"url":"https://www.baidu.com"}'
```

预期：标签页导航到百度

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |

### 5.2 reload

```bash
node my-scripts/test-tool.mjs reload
```

预期：当前页面刷新

| 结果 | |
|------|-|
| 通过 | [ ] |
| 失败 | [ ] |

### 5.3 get_bridge_status

```bash
node my-scripts/test-tool.mjs get_bridge_status
```

预期：返回扩展版本、连接状态、daemon 端口（10186）等

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
| **总计** | **19** | / | |

### 发现的问题

| 序号 | 问题描述 | 严重程度 | 状态 |
|------|---------|:--------:|:----:|
| | | | |

### 备注 / 建议
