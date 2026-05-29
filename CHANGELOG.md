# 更新日志

## v1.1.0 (2026-05-29)

### 🎉 新功能

#### 移动端适配
- **自定义模态框**：替换原生 `prompt()` 和 `confirm()`，移动端友好的居中对话框
- **移动端分享**：导出日志/预设时优先使用 `navigator.share()` 原生分享面板
- **手风琴模式**：移动端预设模块列表同时只展开一个模块，减少滚动
- **触摸目标**：所有交互元素最小高度 44px，符合 WCAG 2.5.5 / Apple HIG 标准
- **响应式断点**：对齐 SillyTavern 的 1000px / 768px / 450px 三档断点
- **流式间距**：使用 `clamp()` 实现间距随屏幕宽度平滑缩放
- **减少动画**：支持系统 `prefers-reduced-motion` 偏好，禁用所有动画/过渡

#### 新增模块
- `src/mobile.js`：移动端工具模块，包含 `isMobile()`、`showPrompt()`、`showConfirm()`、`shareOrDownload()`、`initAccordion()`、`prefersReducedMotion()`

### 🔧 改进

- 日志导出从 Blob + `<a>.click()` 改为 `shareOrDownload()` 统一封装
- 预设导出从 Blob + `<a>.click()` 改为 `shareOrDownload()` 统一封装
- 删除/重命名/新建预设的对话框改为自定义模态框
- 预设模块头添加 `data-module` 属性支持手风琴控制

### 📁 文件变更

| 文件 | 变更 |
|------|------|
| `src/mobile.js` | 新增 318 行 — 移动端工具模块 |
| `style.css` | 新增 204 行 — 响应式断点、触摸目标、减少动画 |
| `index.js` | 修改 36 行 — 集成 mobile.js |
| `src/settings.js` | 修改 12 行 — 集成 shareOrDownload |

---

## v1.0.0 (2026-05-27)

### 🎉 首个稳定版本

#### 核心功能
- **Plan B fetch 拦截**：通过 `window.fetch` 拦截实现 API 重定向，完全绕过 `oai_settings`
- **NSFW 检测**：AI 回复渲染完成后自动调用轻量化模型检测
- **自动切换**：检测到 NSFW 时自动切换至预设模型，正常后自动恢复
- **有限状态机**：IDLE → PENDING_SWITCH → SWITCHED → PENDING_RESTORE 完整状态管理
- **可视化设置面板**：所有配置通过 SillyTavern 扩展设置界面完成

#### 预设系统
- **多预设管理**：ST 风格下拉选择器，导入/导出/删除/重命名/新建
- **Proxy 预设系统**：通过 ES6 Proxy 拦截 ST 设置对象，无需直接修改 `oai_settings`
- **预设导入**：导入酒馆预设文件，自动识别模块，每字段独立开关

#### UI 设计
- **原生 ST 设计系统**：使用 SillyTavern CSS 变量和组件类
- **可折叠日志面板**：按级别过滤，支持复制/导出 JSON
- **状态指示灯**：支持脉冲动画，实时显示运行状态

#### 其他
- AGPL v3 开源协议
- 独立 API 配置：切换目标模型的 API 地址和密钥可独立设置
- 正文提取：自动提取 `<content>` 标签内的正文内容用于检测
