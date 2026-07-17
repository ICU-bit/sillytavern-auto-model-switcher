# NSFW 模型切换器 — 架构与开发手册

> **版本**：1.2.0（`refactor` 待测试）
> **技术栈**：TypeScript strict、ES Module、jQuery、SillyTavern Extension API
> **运行入口**：`dist/index.js`
> **仓库**：https://github.com/ICU-bit/sillytavern-auto-model-switcher

## 1. 分支与发布状态

- `master`：GitHub 默认稳定分支，普通安装地址默认获取该分支。
- `refactor`：当前 TypeScript 构建型版本，已推送但仍等待 PC/移动端实机测试。
- 在维护者明确批准前，不将 `refactor` 合并到 `master`。

最终用户直接使用已提交的 `dist/`，无需 Node.js。开发者编辑 `src/*.ts` 后必须重新构建并同步提交 `dist/*.js` 与 source map。

## 2. 开发与验证

```bash
npm install
npm run dev      # watch 构建
npm run build    # 单次构建
npm run check    # tsc --noEmit
npm test         # 当前同样执行 tsc --noEmit
```

浏览器调试时需使用 `Ctrl+F5` 或 `Ctrl+Shift+R` 清除 ES Module 缓存。

## 3. 当前文件结构

```text
src/
├── index.ts              入口与模块编排
├── coordinator.ts        统一协调 fetch、Proxy、presetOverrides
├── state.ts              四状态 FSM 与转换 hook
├── event-handlers.ts     SillyTavern 事件注册/注销
├── direct-api.ts         Plan B fetch 拦截和目标 API 直调
├── detector.ts           NSFW 检测 API 调用与正文提取
├── preset-proxy.ts       power_user Proxy 覆盖与安全恢复
├── preset-modules.ts     预设模块定义、字段渲染与转义
├── settings.ts           设置类型、默认值、持久化与预设 CRUD
├── logger.ts             环形日志、级别过滤与渲染回调
├── mobile.ts             PC/移动端模态框、分享、手风琴与设备检测
├── ui-builder.ts         设置面板 HTML 构建
└── ui-bindings.ts        UI 事件绑定、预设交互和日志面板

dist/                     与上述 13 个模块对应的 .js + .js.map
 types/sillytavern.d.ts    SillyTavern API 类型声明
manifest.json              js 指向 dist/index.js
style.css                  ST 主题与响应式样式
```

已废弃的 `model-switcher`（Plan A）和 `utils` 不属于当前运行架构。

## 4. 核心设计

### 4.1 Plan B：fetch 拦截直调

插件不通过自动修改 `oai_settings` 切换模型。`direct-api.ts` 包装 `window.fetch`，只在切换状态下匹配：

```text
/api/backends/chat-completions/generate
```

匹配后把 SillyTavern 已组装的消息体发送到目标 OpenAI 兼容 API，并将目标 `Response` 返回给 SillyTavern。失败时通知用户并调用原始 fetch，从而安全回退到原模型。

当前容错设置：

- `apiTimeoutMs`：直调 API 超时，默认 60000ms。
- `apiRetries`：超时或网络错误的重试次数，默认 1。
- HTTP 非 2xx：不重试，直接进入回退路径。
- SillyTavern `AbortSignal`：与每次直调请求联动，监听器在 `finally` 中清理。

### 4.2 四状态 FSM

```text
IDLE
  └─ 检测到 NSFW → PENDING_SWITCH
PENDING_SWITCH
  ├─ 下一次生成开始 → SWITCHED
  └─ 检测到正常内容 → IDLE
SWITCHED
  └─ 检测到正常内容 → PENDING_RESTORE
PENDING_RESTORE
  └─ 下一次生成开始 → IDLE
```

`state.ts` 负责纯状态转换；`coordinator.ts` 根据转换统一启停 fetch 拦截、Proxy 和请求参数覆盖，避免三层副作用不同步。

### 4.3 Proxy 预设系统

`preset-proxy.ts` 通过 ES6 Proxy 包装 `power_user` 的预设对象，使 SillyTavern 在格式化请求时读取已启用的 NSFW 预设字段，同时不持久化修改原对象。

- marker 使用 `Symbol.for(...)`，不会进入 JSON 序列化。
- 导入 JSON 过滤 `__proto__`、`constructor`、`prototype`。
- `safetyTimeoutMs` 默认 30000ms，可配置；异常时自动恢复覆盖状态。

### 4.4 检测与 swipe

`CHARACTER_MESSAGE_RENDERED` 触发后，`event-handlers.ts` 获取最后一条 AI 消息并调用 `detector.ts`。新检测开始时会取消旧请求，过期检测结果通过 detection id 丢弃。

`AbortError` 是 swipe 或超时下的正常取消路径，仅记录 debug，不记为 error。检测 API 返回空 `content` 时会记录 warning 并返回无法判断。

### 4.5 PC 与移动端

`mobile.ts` 同时服务 PC 和移动端，而不是独立或废弃方案：

- `showPrompt()` / `showConfirm()`：替代浏览器原生对话框，PC 与移动端通用。
- `initAccordion()`：移动端预设模块手风琴。
- `shareOrDownload()`：移动端优先系统分享，否则下载文件。
- `isMobile()`：正确调用 SillyTavern `getContext().isMobile()`。
- `prefersReducedMotion()`：遵循系统减少动画偏好。

## 5. 设置模型

`settings.ts` 的关键字段：

| 字段 | 默认值 | 用途 |
|---|---:|---|
| `enabled` | `false` | 插件总开关 |
| `nsfwApiUrl` | `""` | 检测 API 地址 |
| `nsfwApiKey` | `""` | 检测 API Key |
| `nsfwModelName` | `""` | 检测模型 |
| `modelA` | `""` | NSFW 目标模型 |
| `modelAApiUrl` | `""` | 目标 API 地址 |
| `modelAApiKey` | `""` | 目标 API Key |
| `apiTimeoutMs` | `60000` | 直调 API 超时 |
| `apiRetries` | `1` | 网络/超时重试次数 |
| `safetyTimeoutMs` | `30000` | Proxy 安全恢复超时 |
| `logMaxEntries` | `200` | 日志环形缓冲上限 |

`collectAndSaveFromDom()` 采用白名单增量更新，保留未显示在 DOM 中的预设数据，避免新增字段被整对象重建意外丢失。

## 6. 初始化与事件生命周期

`index.ts` 初始化顺序：

1. 加载设置并配置日志上限。
2. 初始化 Proxy 和 fetch interceptor。
3. 注入 `ui-builder.ts` 生成的面板。
4. 绑定 `ui-bindings.ts` 事件和日志渲染。
5. 注册 `event-handlers.ts` 的 SillyTavern 事件。
6. 初始化移动端手风琴和减少动画样式。
7. 暴露 `window.__nsfwDebug()` 供诊断。

事件处理器支持注销，防止热重载时 listener 累积。

## 7. 调试

浏览器控制台：

```javascript
__nsfwDebug()
extension_settings['nsfw-model-switcher']
oai_settings.chat_completion_source
```

加载失败时检查：

1. `manifest.json` 的 `js` 是否为 `dist/index.js`。
2. Network 中 `dist/index.js` 及子模块是否为 200。
3. 是否执行过 `npm run build` 并提交最新 dist。
4. 浏览器是否已硬刷新。

## 8. 发布前测试

当前 `refactor` 不视为已完成实机验收。合并 `master` 前至少验证：

- PC：检测、切换、恢复、多预设 CRUD、超时/重试/回退、swipe 取消。
- 移动端：布局、滚动、模态框、手风琴、触摸目标、分享/下载。
- thinking 模型：提高超时后可容纳较长首字延迟。
- 回归：插件关闭、手动恢复、fetch fallback 后状态与 UI 一致。

详细清单见 [TODO.md](TODO.md)。

## 9. 约束与安全注意事项

- 不直接编辑 `dist/*.js`；只改 `src/*.ts` 后构建。
- 不把 `dist/` 加入 `.gitignore`。
- 自动切换不得重新引入直接修改 `oai_settings` 的 Plan A。
- API Key 按 SillyTavern 扩展惯例保存在扩展设置中；导出配置或备份时注意密钥安全。
- 目标 API URL 由用户配置，浏览器直调要求目标服务支持 CORS。
- 所有插入 HTML 的预设名称和字段值必须经过 `escapeHtml()`。
