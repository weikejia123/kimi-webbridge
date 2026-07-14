# kimi-webbridge — Fahd's WebBridge v2.0

| 字段 | 内容 |
|------|------|
| **用途** | AI Agent 通过本地 WebSocket Daemon + Chrome Extension 控制真实浏览器的自动化桥接工具 |
| **应用场景** | AI Agent 控制浏览器执行点击/填写/截图等 DOM 操作；批量自动化工作流 |
| **标签** | `浏览器自动化`\|`Chrome扩展`\|`AI-Agent`\|`WebSocket`\|`ManifestV3` |
| **技术栈** | TypeScript\|Node.js\|Chrome Extension MV3\|WebSocket\|esbuild |
| **内部版本** | V1-20260714 |
| **依赖** | Node.js 18+, Chrome 浏览器, npm workspaces（extension/ + daemon/） |
| **关联** | 上游: `efrg123/kimi-webbridge` | fork: `weikejia123/kimi-webbridge` | 本地: `chrome-ext/kimi-webbridge/` |

## 结构

```
chrome-ext/kimi-webbridge/
├── daemon/          # 本地 WebSocket 服务端 (127.0.0.1:10086)
├── extension/       # Chrome Extension Manifest V3
├── scripts/         # 构建/打包/测试脚本
├── docs/            # 规划文档
├── my-docs/         # 本地二开记录
├── README-WAKE.md   # 本文件
└── AGENTS.md        # 上游项目文档
```

## fork 信息

- **上游**: `https://github.com/efrg123/kimi-webbridge.git`
- **origin**: `https://github.com/weikejia123/kimi-webbridge.git`
- **分支**: `wkj-001-20260714-init`（二开分支）
