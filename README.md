# NSFW模型切换器

[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/ICU-bit/sillytavern-auto-model-switcher)](https://github.com/ICU-bit/sillytavern-auto-model-switcher/releases)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6.svg)](src/index.ts)
[![SillyTavern](https://img.shields.io/badge/SillyTavern-Extension-FF6B6B.svg)](https://sillytavern.app)

SillyTavern 扩展插件：在 AI 回复完成后自动检测 NSFW 内容，并根据检测结果在下次生成时切换至预设模型。

> 🆕 **v1.2.0（refactor 测试分支）**：TypeScript 全面迁移、模块拆分、可配置超时与重试、移动端适配和安全加固。当前版本正在等待 PC/移动端实机测试，尚未合并到默认 `master`。详见 [CHANGELOG.md](CHANGELOG.md)。

---

## 功能特性

- 🎯 **自动 NSFW 检测** — AI 回复渲染完成后自动调用轻量化模型检测
- 🔄 **自动临时切换** — 检测到 NSFW 时自动切换至预设模型，正常后自动恢复
- ⚡ **Plan B 直调 API** — fetch 拦截层面重定向 API 请求，完全绕过 oai_settings，不依赖 ST 事件时序
- 🧠 **有限状态机** — 完善的 IDLE → 待切换 → 已切换 → 待恢复 状态管理，swipe 自动取消
- 🎨 **原生 UI 设计** — 使用 SillyTavern CSS 变量和组件类，完美融入 ST 暗色主题
- 📦 **多预设管理** — 支持导入/导出/删除/重命名/新建预设，ST 风格下拉选择器
- 🔧 **Proxy 预设系统** — 通过 Proxy 拦截 ST 设置对象，无需直接修改 oai_settings
- 📝 **增强日志系统** — 可折叠日志面板，按级别过滤，支持复制/导出 JSON
- 🔌 **独立 API 配置** — 切换目标模型的 API 地址和密钥可独立设置
- 🔍 **正文提取** — 自动提取 `<content>` 标签内的正文内容用于检测
- ⏱️ **可配置容错** — 可调整直调 API 超时、失败重试次数与 Proxy 安全超时
- 📱 **PC/移动端适配** — 自定义模态框、移动端手风琴、原生分享与 44px 触摸目标
- 🛡️ **AGPL v3 协议** — 最严格的开源保护

> ⚠️ **分支说明**：GitHub 默认安装地址当前仍指向稳定版 `master`。`refactor` 是待测试版本；测试人员手动安装时请使用 `git clone -b refactor ...`。

## 安装方法

以下安装方式面向默认稳定分支 `master`。参与 v1.2.0 `refactor` 测试时，请使用后文的测试分支命令。

### 方式一：通过插件管理页面安装（推荐）

1. 打开 SillyTavern
2. 点击左侧 **扩展** 图标
3. 切换到 **下载扩展和资源** 标签页
4. 在 **自定义插件URL** 输入框中填入：
   ```
   https://github.com/ICU-bit/sillytavern-auto-model-switcher
   ```
5. 点击 **安装** 按钮
6. 在 **已安装的扩展** 列表中找到 **NSFW模型切换器**，点击启用

### 方式二：手动安装

```bash
# 进入 SillyTavern 扩展目录
cd SillyTavern/public/scripts/extensions/third-party/

# 克隆 refactor 测试分支
git clone -b refactor https://github.com/ICU-bit/sillytavern-auto-model-switcher.git

# 重启 SillyTavern（插件自动加载）
```

### 升级当前分支

如果你已经安装过本插件，升级当前所在分支：

```bash
cd SillyTavern/public/scripts/extensions/third-party/sillytavern-auto-model-switcher/
git pull
```

然后在浏览器中 `Ctrl + F5` 强制刷新酒馆即可。**配置自动迁移，无需重新设置。**

> 💡 本插件采用「dist 入 git」模式 — 用户开箱即用，无需安装 Node.js 或运行 `npm install`。

## 配置说明

安装启用后，在 SillyTavern 右侧扩展设置面板中找到 **NSFW模型切换器** 进行配置：

### 必要配置

| 字段 | 说明 |
|---|---|
| **轻量化检测模型 → API地址** | NSFW 检测 API 地址（如硅基流动 `https://api.siliconflow.cn/v1`） |
| **轻量化检测模型 → 模型名称** | 检测模型名（如 `Qwen2.5-14B-Instruct`） |
| **切换目标模型 → 目标模型名称** | 检测到 NSFW 后切换到的模型名称 |
| **切换目标模型 → 目标模型API地址** | 切换目标模型的 API 地址（直调模式，需填写完整 URL） |

### 可选配置

| 字段 | 说明 |
|---|---|
| **检测 API 密钥** | NSFW 检测 API 的密钥 |
| **目标模型API密钥** | 切换目标模型的 API 密钥 |
| **NSFW 预设导入** | 导入酒馆预设文件，自动分模块展示，每字段独立开关 + 内联编辑 |
| **直调 API 超时** | 等待目标 API 响应的最长时间，默认 60 秒；thinking 模型可适当提高 |
| **失败重试次数** | 超时或网络错误后的自动重试次数，默认 1 次；HTTP 错误不重试 |
| **Proxy 安全超时** | Proxy 覆盖的兜底恢复时间，默认 30 秒 |
| **显示通知** | 切换/恢复时显示 toastr 弹窗 |
| **调试模式** | 显示详细运行日志，方便排查问题 |

### 配置示例

```
主模型: Custom（豆包 API）  →  检测模型: Qwen2.5-14B-Instruct（硅基流动）
                            →  切换目标: DeepSeek-V4-Flash（DeepSeek 官网）
```

---

## ⚠️ 已知问题

### NSFW 检测模型偶发返回空内容

**现象**: 轻量化检测模型（如 Qwen2.5-7B-Instruct）有时输出空字符串，检测失败

**原因**: 模型自身安全策略导致长内容时拒绝输出

**建议**: 更换为更大或更稳定的检测模型，如 `Qwen2.5-14B-Instruct`

### 目标 API 不支持 CORS

**现象**: 直调目标 API 时浏览器报跨域错误，回退到原始模型

**原因**: Plan B 通过浏览器直接调用目标 API，部分 API 服务端未配置 CORS 头

**解决方案**: 选择支持 CORS 的 API 提供商，或通过代理转发

---

## 新功能详解

### 🎨 原生 UI 设计

插件使用 SillyTavern 的 CSS 变量和组件类，完美融入 ST 的暗色主题：
- 所有颜色通过 `--SmartThemeBodyColor`、`--black30a` 等变量定义
- 输入框、按钮、复选框使用 ST 原生样式类
- 状态指示灯支持脉冲动画
- 响应式设计，适配不同屏幕尺寸

### 📦 多预设管理

支持管理多个 NSFW 预设配置：
- **下拉选择器** — ST 风格的预设选择下拉菜单
- **导入/导出** — JSON 格式预设文件导入导出
- **删除/重命名** — 预设的删除和重命名操作
- **新建预设** — 基于当前配置创建新预设
- **模块开关** — 可单独启用/禁用预设中的各个模块（instruct、context、sysprompt 等）

### 🔧 Proxy 预设系统（偷天换日）

通过 ES6 Proxy 拦截 ST 的设置对象，实现"偷天换日"效果：
- **不修改原对象** — Proxy 包装，ST 原始设置保持不变
- **格式化兼容** — ST 的格式化流程读取 Proxy 对象，获取 NSFW 预设值
- **自动恢复** — 生成请求完成后自动恢复原始值
- **安全超时** — 默认 30 秒且可在高级设置中调整，防止状态卡死

---

## 工作流程

```
AI 回复完成
    │
    ▼
CHARACTER_MESSAGE_RENDERED 事件触发
    │
    ├── 跳过用户消息
    │
    ▼
获取消息内容 → 提取 <content> 标签正文
    │
    ▼
调用检测 API（自动取消前一次未完成的检测）
    │
    ├── NSFW → 状态机: IDLE → 待切换 → 保存快照
    │
    ├── 正常 → 状态机: 已切换 → 待恢复（或 PENDING_SWITCH → IDLE）
    │
    └── 失败 → 状态机: 已切换 → 待恢复（保守处理）
                        │
                        ▼
               用户发送消息 → GENERATION_STARTED
                        │
                ┌───────┴───────┐
                ▼               ▼
        启用 fetch 拦截器    禁用 fetch 拦截器
                │               │
                ▼               ▼
       ST 请求被重定向到     ST 请求正常发往
       目标模型 API          原模型 API
```

## 状态机说明

| 状态 | 说明 |
|---|---|
| `IDLE` | 空闲，无待处理动作 |
| `PENDING_SWITCH` | 已检测到 NSFW，等待下次生成时切换 |
| `SWITCHED` | 当前正在使用目标模型 |
| `PENDING_RESTORE` | 已检测到正常内容，等待下次生成时恢复 |

## 技术架构

```
src/                              dist/                       ← 编译产物 (入 git)
├── index.ts                      → dist/index.js             ← 入口控制器
├── coordinator.ts                → dist/coordinator.js       ← 状态协调器（统一三层副作用）
├── state.ts                      → dist/state.js             ← 有限状态机 + onTransition hook
├── event-handlers.ts             → dist/event-handlers.js    ← ST 事件处理器（DI 化）
├── direct-api.ts                 → dist/direct-api.js        ← Plan B fetch 拦截器 + 直调
├── preset-proxy.ts               → dist/preset-proxy.js      ← Proxy 预设系统（偷天换日）
├── preset-modules.ts             → dist/preset-modules.js    ← 预设模块定义与渲染
├── detector.ts                   → dist/detector.js          ← NSFW 检测 API 调用
├── settings.ts                   → dist/settings.js          ← 设置持久化与 DOM 同步
├── logger.ts                     → dist/logger.js            ← 日志收集与渲染
├── mobile.ts                     → dist/mobile.js            ← PC/移动端工具（模态框/分享/手风琴）
├── ui-builder.ts                 → dist/ui-builder.js         ← 设置面板 HTML 构建
└── ui-bindings.ts                → dist/ui-bindings.js        ← UI 事件绑定与交互

types/sillytavern.d.ts            ← 集中收口 ST 类型声明
style.css                         ← 原生 ST 设计系统样式表
tsconfig.json                     ← TypeScript strict 模式配置
manifest.json                     ← ST 扩展清单 (js → dist/index.js)
```

详细技术文档见 [ARCHITECTURE.md](ARCHITECTURE.md)，开发者贡献指南见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发计划

### ✅ 已完成

- **B 方案** — fetch 拦截直调 API，完全绕过 oai_settings (v1.0.0)
- **多预设管理** — ST 风格下拉选择器，导入/导出/删除/重命名/新建 (v1.0.0)
- **Proxy 预设系统** — 通过 Proxy 拦截 ST 设置对象 (v1.0.0)
- **原生 UI 设计** — 使用 ST CSS 变量和组件类 (v1.0.0)
- **增强日志系统** — 可折叠面板，按级别过滤，支持复制/导出 (v1.0.0)
- **移动端适配** — 自定义模态框、手风琴模式、触摸目标 44px (v1.1.0)
- **TypeScript 全面迁移** — 全部源码 strict 模式 .ts (v1.2.0)
- **状态协调器** — 统一持有 fetch + Proxy + presetOverrides 三层副作用 (v1.2.0)
- **致命 Bug 修复** — isMobile / SWITCHED 卡死 / Proxy 污染 / 事件泄漏 等 6 处 (v1.2.0)
- **安全加固** — 原型污染防护 / Symbol marker / 资源泄漏修复 (v1.2.0)
- **可配置容错** — 直调 API 超时、失败重试次数与 Proxy 安全超时均可调 (v1.2.0)
- **UI 模块拆分** — `ui-builder` / `ui-bindings` / `preset-modules` 降低入口复杂度 (v1.2.0)

> 🧪 `refactor` 分支当前等待 PC 与移动端实机测试，测试完成并经维护者批准后再合并到 `master`。

### 🔮 计划中

- **独立消息拼接** — 自行组装聊天上下文，支持任意 API 协议
- **多目标模型** — 支持多个 NSFW 模型按规则轮换

详见 [TODO.md](TODO.md) 和 [CHANGELOG.md](CHANGELOG.md)。

## 贡献指南

欢迎提交 Issue 和 Pull Request。

1. Fork 本仓库
2. 创建你的功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交你的修改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

## 许可证

本项目基于 [GNU Affero General Public License v3.0](LICENSE) 开源。

AGPL v3 是目前最严格的开源协议。任何人无论以何种形式使用或修改本项目的代码（包括通过网络提供服务），都必须公开修改后的完整源码。