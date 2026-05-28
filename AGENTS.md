# NSFW 模型切换器 (Dev)

开发版扩展，含 NSFW 预设导入功能。ST junction 指向此处。

## STRUCTURE

```
sillytavern-auto-model-switcher-dev/
├── index.js                    # 入口控制器（事件注册、设置面板）
├── manifest.json               # ST 扩展清单
├── src/
│   ├── direct-api.js           # [Plan B] fetch 拦截器 + 直调 API（核心）
│   ├── state.js                # 有限状态机（IDLE → PENDING → SWITCHED → RESTORE）
│   ├── detector.js             # NSFW 检测 API 调用
│   ├── logger.js               # 日志收集与渲染
│   ├── settings.js             # 设置持久化与 DOM 同步
│   └── model-switcher.js       # [Plan A 保留] oai_settings 快照（仅手动恢复用）
├── ARCHITECTURE.md             # 详细技术架构文档
├── README.md                   # 用户文档
└── TODO.md                     # 开发计划
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| 入口控制 | `index.js` | 事件注册、设置面板注入 |
| fetch 拦截 | `src/direct-api.js` | Plan B 核心，匹配 `/api/backends/chat-completions/generate` |
| 状态管理 | `src/state.js` | 有限状态机，`getPendingAction()` 只读 |
| NSFW 检测 | `src/detector.js` | OpenAI 兼容 API 调用，支持 AbortSignal |
| 预设导入 | `index.js` | dev 独有功能，文件上传、模块/字段开关 |
| 日志面板 | `src/logger.js` | 环形缓冲区日志渲染 |

## CONVENTIONS

- **ES5 风格**：var、function 表达式（与 master 的 ES6 不同）
- **无构建步骤**：纯 ES Module，浏览器直接加载
- **无 package.json**：依赖通过相对路径导入 ST 核心模块
- **预设流程**：`applyNsfwPresets()` → `setPresetOverrides()` → `onRequestRedirected()` → `restoreOriginalPresets()`

## ANTI-PATTERNS

- **禁止直接修改 oai_settings**：Plan B 通过 fetch 拦截实现
- **禁止在 master 分支修改**：所有改动必须先在 dev 分支完成
- **禁止未经用户确认合并到 master**：必须等待用户明确确认
