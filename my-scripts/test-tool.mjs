#!/usr/bin/env node
/**
 * kimi-webbridge 手动测试辅助工具
 * 向 Daemon 发送 WebSocket 命令并打印返回结果。
 * 绕过浏览器 CSP 限制。
 *
 * 用法: node my-scripts/test-tool.mjs <tool名> [参数JSON]
 * 示例:
 *   node my-scripts/test-tool.mjs list_tabs
 *   node my-scripts/test-tool.mjs navigate '{"url":"https://www.baidu.com"}'
 *   node my-scripts/test-tool.mjs mouse_click '{"selector":"#kw"}'
 *   node my-scripts/test-tool.mjs capture_screenshot
 *   node my-scripts/test-tool.mjs snapshot
 *   node my-scripts/test-tool.mjs network '{"cmd":"start"}'
 */

import WebSocket from "ws";

const HOST = process.env.WEBBRIDGE_HOST || "127.0.0.1";
const PORT = process.env.WEBBRIDGE_PORT || "10186";
const URL = `ws://${HOST}:${PORT}/ws`;

const tool = process.argv[2];
const argsRaw = process.argv[3];

if (!tool) {
  console.log("用法: node my-scripts/test-tool.mjs <tool名> [参数JSON]");
  console.log("示例:");
  console.log("  node my-scripts/test-tool.mjs list_tabs");
  console.log("  node my-scripts/test-tool.mjs navigate '{\"url\":\"https://www.baidu.com\"}'");
  process.exit(1);
}

let args = {};
if (argsRaw) {
  try {
    args = JSON.parse(argsRaw);
  } catch {
    console.error("❌ 参数不是有效 JSON:", argsRaw);
    process.exit(1);
  }
}

console.log(`→ 连接 ${URL}`);
console.log(`→ 工具: ${tool}`);
console.log(`→ 参数: ${JSON.stringify(args)}`);
console.log("");

const ws = new WebSocket(URL);
const requestId = `manual-${Date.now()}`;

ws.on("open", () => {
  console.log("✓ 已连接，发送命令...");
  ws.send(JSON.stringify({
    v: "2.0",
    id: requestId,
    tool,
    args,
  }));
});

ws.on("message", (data) => {
  const resp = JSON.parse(data.toString());
  console.log("═".repeat(50));
  console.log("响应:");
  console.log(JSON.stringify(resp, null, 2));
  console.log("═".repeat(50));
  ws.close();
});

ws.on("error", (err) => {
  console.error("❌ 连接错误:", err.message);
  process.exit(1);
});

ws.on("close", () => {
  process.exit(0);
});

// 30 秒超时
setTimeout(() => {
  console.error("⏰ 超时: 30秒无响应");
  ws.close();
  process.exit(1);
}, 30000);
