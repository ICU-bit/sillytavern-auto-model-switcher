# 更新日志

## v1.2.0 (2026-06-05)

### 🔥 重大架构升级

#### TypeScript 全面迁移
- 全部源代码从 JavaScript 迁移到 TypeScript (`tsc strict: true`)
- 新增 `src/*.ts` 源码 + `dist/*.js` 编译产物（dist 入 git，用户开箱即用）
- 新增 `types/sillytavern.d.ts` 集中收口 ST 类型声明
- 新增 `tsconfig.json` + `package.json` + `package-lock.json`

#### 状态协调器 (Phase 4 Batch B)
- 新增 `src/coordinator.ts` — `SwitcherCoordinator`，统一持有 fetch 拦截 + Proxy 覆盖 + presetOverrides 三层副作用
- 状态机引入 `onTransition` hook，副作用由状态转换自动驱动
- 6 条原本散落的路径（switch / restore / manual / safety_timeout / plugin_off / fetch_fallback）收敛到协调器

#### 模块化抽离 (Phase 4 Batch C)
- 新增 `src/utils.ts` — `escapeHtml` / `extractGenParams` / `getSettingsRoot`
- 新增 `src/preset-modules.ts` — `PRESET_MODULES` 定义与 HTML 渲染
- 新增 `src/event-handlers.ts` — ST 事件处理器（DI 化注入）
- `src/index.ts` 由 786 行瘦身到 ~574 行

### 🐛 致命 Bug 修复

| ID | 描述 | 文件 |
|---|---|---|
| **isMobile** | `getContext().isMobile` 是函数引用，原代码 `Boolean(...)` 永远为 `true`，导致桌面端误走移动端分支、accordion 误激活 | `src/mobile.ts:52` |
| **H1 Proxy 污染** | 字符串 marker 通过 Proxy.set trap 写入 `power_user.instruct`，被 ST 序列化保存到磁盘，卸载插件后残留 | `src/preset-proxy.ts` |
| **H2 SWITCHED 卡死** | `tryEnable` 失败时 `onOperationAborted` 不处理 SWITCHED → state 卡在 SWITCHED 但 runtime 已 idle，UI 撒谎 | `src/coordinator.ts:268` |
| **H3 监听器泄漏** | `eventSource.on` 无配套 off，热重载会累积 listener，detect 重复触发 | `src/event-handlers.ts` |
| **H4 异常裸抛** | `onMessageRendered` 无 try/catch，AbortError 污染日志 | `src/event-handlers.ts:85` |
| **H5 signal 残留** | fetch fallback 时只剥离 `init.signal`，`input` 是 Request 实例时 signal 仍 aborted | `src/direct-api.ts:135` |

### 🛡️ 安全加固

- **原型污染防护** — 预设导入 `JSON.parse` 加 reviver 过滤 `__proto__` / `constructor` / `prototype`
- **localStorage 校验** — 日志加载时 `Array.isArray` 检查，防止外部污染导致日志模块挂掉
- **Symbol marker** — `preset-proxy` 改用 `Symbol.for(...)`，JSON.stringify / structuredClone 自动跳过
- **detectNSFW 资源泄漏** — externalSignal 已 aborted 时主动短路，避免 timer 泄漏 + fetch 仍发出

### 🔧 改进

- `src/event-handlers.ts` 引入 `EventHandlerDeps` DI 接口，可单独 unregister
- `types/sillytavern.d.ts` 修正 `EventSource.off` 错误声明（ST 实际叫 `removeListener`）
- `types/sillytavern.d.ts` 修正 `isMobile` 类型从 `boolean` 改为 `() => boolean`
- `index.ts` 移除重复的 `extension_settings as unknown as ...` 类型逃逸，统一用 `utils.getSettingsRoot()`
- `preset-proxy` 增加 `purgeLegacyMarker()` 一次性清理升级残留

### 📁 文件变更摘要

| 类别 | 文件 |
|---|---|
| 新增源码 | `src/coordinator.ts` `src/utils.ts` `src/preset-modules.ts` `src/event-handlers.ts` |
| 新增构建 | `dist/*.js` × 13 + `.map` + `tsconfig.json` + `package.json` |
| 新增类型 | `types/sillytavern.d.ts` |
| 删除 | `index.js`（顶层）+ `src/*.js`（迁移到 `.ts` 编译输出到 `dist/`） |

### ⚠️ 升级提示

- ST 加载入口由 `index.js` 切换为 `dist/index.js`（manifest.json 已自动更新）
- 旧版本残留的 `__nsfw_proxy_installed__` 字符串 marker 会被自动清理
- 用户无需手动操作，插件加载时自动迁移

---

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
