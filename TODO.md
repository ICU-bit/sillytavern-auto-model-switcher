# 待开发与测试事项

> 当前 `refactor` 分支为 v1.2.0 待测试版本，尚未合并到默认 `master`。

## ✅ 已实现

### Plan B：插件独立调用 API

插件在 `window.fetch` 层拦截 SillyTavern 发往 `/api/backends/chat-completions/generate` 的请求，直接调用目标模型 API，再将响应交回 SillyTavern 处理。

核心实现：`src/direct-api.ts`

- 不修改 `oai_settings`
- 支持流式与非流式响应
- 失败时回退原始请求
- 与 SillyTavern 的 `AbortSignal` 联动
- 直调 API 超时可配置，默认 60 秒
- 超时或网络错误可自动重试，默认 1 次
- HTTP 错误不重试

### 状态与预设协调

核心实现：`src/coordinator.ts`、`src/state.ts`、`src/preset-proxy.ts`

- 四状态 FSM：`IDLE` → `PENDING_SWITCH` → `SWITCHED` → `PENDING_RESTORE`
- coordinator 统一管理 fetch、Proxy 与 preset overrides 三层副作用
- Proxy 安全超时可配置，默认 30 秒
- 支持多预设、模块开关和字段内联编辑

### PC 与移动端适配

核心实现：`src/mobile.ts`、`src/ui-bindings.ts`、`style.css`

- PC/移动端通用自定义模态框
- 移动端手风琴布局
- `navigator.share()` 原生分享（支持时）
- 最小 44px 触摸目标
- `prefers-reduced-motion` 支持

## 🧪 发布前测试清单

### PC 端

- [ ] 插件加载、设置保存和硬刷新后配置恢复
- [ ] NSFW 检测、待切换、目标模型直调和自动恢复
- [ ] 多预设的新建、导入、导出、重命名和删除
- [ ] 超时后按设置重试；HTTP 错误不重试并安全回退
- [ ] swipe 取消旧检测，不产生 error 日志刷屏
- [ ] thinking 模型长首字延迟场景下，提高超时后可正常返回

### 移动端

- [ ] 设置面板布局、滚动和 44px 触摸目标
- [ ] 自定义 `prompt` / `confirm` 模态框
- [ ] 预设模块手风琴交互
- [ ] 支持时调用系统分享，不支持时正确下载
- [ ] 减少动画系统偏好生效

## 🔮 后续计划

- **独立消息拼接** — 自行组装聊天上下文，支持更多 API 协议
- **多目标模型** — 支持多个目标模型按规则轮换
- **自动化测试** — 为状态机、URL 规范化、重试策略和预设解析补充单元测试
