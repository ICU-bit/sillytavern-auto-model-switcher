# NSFW模型切换器

[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/ICU-bit/sillytavern-auto-model-switcher)](https://github.com/ICU-bit/sillytavern-auto-model-switcher/releases)
[![JavaScript](https://img.shields.io/badge/language-JavaScript-yellow.svg)](index.js)
[![SillyTavern](https://img.shields.io/badge/SillyTavern-Extension-FF6B6B.svg)](https://sillytavern.app)
[![Dev Branch](https://img.shields.io/badge/branch-dev-blueviolet)](https://github.com/ICU-bit/sillytavern-auto-model-switcher/tree/dev)

SillyTavern 扩展插件：在 AI 回复完成后自动检测 NSFW 内容，并根据检测结果在下次生成时切换至预设模型。

---

## 功能特性

- 🎯 **自动 NSFW 检测** — AI 回复渲染完成后自动调用轻量化模型检测
- 🔄 **自动临时切换** — 检测到 NSFW 时自动切换至预设模型，正常后自动恢复
- ⚡ **Plan B 直调 API** — fetch 拦截层面重定向 API 请求，完全绕过 oai_settings，不依赖 ST 事件时序
- 🧠 **有限状态机** — IDLE → 待切换 → 已切换 → 待恢复 完整状态管理，swipe 自动取消
- ⚙️ **可视化设置面板** — 所有配置通过 SillyTavern 扩展设置界面完成
- 🔌 **独立 API 配置** — 切换目标模型的 API 地址和密钥可独立设置
- 📦 **预设导入（dev）** — 导入酒馆预设文件，自动识别模块，每字段独立开关 + 内联编辑
- 📝 **内置运行日志** — 插件面板内实时显示运行状态和检测结果
- 🔍 **正文提取** — 自动提取 `<content>` 标签内的正文内容用于检测
- 🛡️ **AGPL v3 协议** — 最严格的开源保护

## 安装方法

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

# 克隆仓库
git clone https://github.com/ICU-bit/sillytavern-auto-model-switcher.git

# 重启 SillyTavern（插件自动加载）
```

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
index.js                    ← 入口控制器（事件注册、设置面板）
├── src/direct-api.js       ← [Plan B] fetch 拦截器 + 直调 API（核心）
├── src/state.js            ← 有限状态机（IDLE → PENDING → SWITCHED → RESTORE）
├── src/detector.js         ← NSFW 检测 API 调用
├── src/logger.js           ← 日志收集与渲染
├── src/settings.js         ← 设置持久化与 DOM 同步
└── src/model-switcher.js   ← [Plan A 保留] oai_settings 快照（仅手动恢复用）
```

详细技术文档见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 分支说明

| 分支 | 版本 | 说明 |
|---|---|---|
| `master` | v1.0.0 | **稳定版** — Plan B 直调 API 核心功能 |
| `dev` | v1.1.0-dev | **开发版** — 预设导入、模块化开关、内联编辑等新功能 |

可通过 ST 扩展管理器切换分支：
```
Manage extensions → NSFW模型切换器 → Switch branch → dev
```

## 开发计划

### master（稳定版）
- [x] **B 方案** — fetch 拦截直调 API，完全绕过 oai_settings（v1.0.0）

### dev（开发中）
- [x] **预设导入** — 支持导入酒馆预设文件（OpenAI Settings / Instruct / Context / Sysprompt / Reasoning）
- [x] **模块识别** — 自动检测预设包含的模块，以表格形式展示
- [x] **字段级开关** — 每个字段独立勾选开关，模块主开关控制全部
- [x] **内联编辑** — 点击字段行展开编辑器，支持修改和保存
- [ ] **多目标模型** — 支持多个 NSFW 模型按规则轮换
- [ ] **预设导出** — 将当前配置导出为标准预设文件
- [ ] **可配置超时** — 直调 API 超时时间用户可调

详见 [TODO.md](TODO.md)。

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