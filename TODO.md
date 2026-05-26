# 待开发功能

## B 方案：插件独立调用 API（不依赖 oai_settings）✅ 已实现

### 状态
✅ 已完成 — 见 `src/direct-api.js`

### 实现方案
在 `window.fetch` 层面拦截 ST 发往自己服务端的 API 请求（`/api/backends/chat-completions/generate`），
直接调用目标模型的 API，将响应返回给 ST 处理。完全绕过 ST 的设置系统，不再修改 oai_settings。

### 优点
- 完全不影响酒馆本身的配置
- 不需要快照/恢复机制
- 支持任意 API 来源，不受 `chat_completion_source` 约束
- 失败时自动回退到原始请求（安全降级）
- 支持流式/非流式响应

### 核心模块
- `src/direct-api.js` — fetch 拦截器 + 直调 API
  - `initFetchInterceptor()`: 替换 `window.fetch`，保存原函数
  - `redirectToTarget()`: 提取消息 → 直调目标 API → 返回 Response
  - 15 秒超时 + ST abort signal 联动
  - 失败时 toastr 通知 + `originalFetch` 回退