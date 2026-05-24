# NSFW模型切换器

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![JavaScript](https://img.shields.io/badge/language-JavaScript-yellow.svg)](index.js)
[![SillyTavern](https://img.shields.io/badge/SillyTavern-Extension-FF6B6B.svg)](https://sillytavern.app)

SillyTavern 扩展插件：在 AI 回复完成后自动检测 NSFW 内容，并根据检测结果在下次生成时切换至预设模型。

---

## 功能特性

- 🎯 **自动 NSFW 检测** — AI 回复渲染完成后自动调用轻量化模型检测
- 🔄 **自动临时切换** — 检测到 NSFW 时自动切换至预设模型，正常后自动恢复
- 🧠 **有限状态机** — 完善的 IDLE → 待切换 → 已切换 → 待恢复 状态管理
- ⚙️ **可视化设置面板** — 所有配置通过 SillyTavern 扩展设置界面完成
- 🔌 **独立 API 配置** — 切换目标模型的 API 地址和密钥可独立设置
- 💾 **预设还原** — 切换后自动保留并恢复原模型的 instruct/context/sysprompt/reasoning 预设
- 📝 **内置运行日志** — 插件面板内实时显示运行状态和检测结果
- 🔍 **正文提取** — 自动提取 `<content>` 标签内的正文内容用于检测

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
| **轻量化检测模型 → 模型名称** | 检测模型名（如 `Qwen2.5-7B-Instruct`） |
| **切换目标模型 → 目标模型名称** | 检测到 NSFW 后切换到的模型名称 |
| **切换目标模型 → API来源** | 切换目标的 API 来源（如 `DeepSeek`、`Custom`） |

### 可选配置

| 字段 | 说明 |
|---|---|
| **API密钥** | 检测 API / 目标 API 的密钥（如使用酒馆已有配置可不填） |
| **目标模型API地址** | 切换目标模型的 API 地址（如使用酒馆已有配置可不填） |
| **显示通知** | 切换/恢复时显示 toastr 弹窗 |
| **调试模式** | 显示详细运行日志，方便排查问题 |

### 配置示例

```
主模型: Custom（豆包 API）  →  检测模型: Qwen2.5-7B-Instruct（硅基流动）
                            →  切换目标: DeepSeek-V4-Flash（DeepSeek 官网）
```

---

## ⚠️ 已知问题

### 恢复原模型后出现 "A parameter specified in the request is not valid"

**现象**: 切换至目标模型（如 DeepSeek）正常工作，但恢复到原模型（如 Custom/豆包）后，下一次生成报参数错误。

**状态**: 排查中

**可能原因**:
1. `chat_completion_source` 切换回原来源后，`oai_settings` 中原来源的 API URL/Key 未能完全还原
2. SillyTavern 切换 `chat_completion_source` 时触发了预设加载，导致某些参数被覆盖

**临时解决方案**:
- 在 SillyTavern 的 API 连接面板中手动切换一下 API 来源再切回来
- 或点击插件面板的 **恢复原模型** 按钮后刷新页面

### NSFW 检测模型偶发返回空内容

**现象**: 轻量化检测模型（如 Qwen2.5-7B-Instruct）有时输出空字符串，检测失败

**原因**: 模型自身安全策略导致长内容时拒绝输出

**建议**: 更换为更大或更稳定的检测模型，如 `Qwen2.5-14B-Instruct`

---

## 工作流程

```
AI 回复完成
    │
    ▼
CHARACTER_MESSAGE_RENDERED 事件触发
    │
    ├── 跳过用户消息
    ├── 跳过检测进行中的并发
    │
    ▼
获取消息内容 → 提取 <content> 标签正文
    │
    ▼
调用检测 API
    │
    ├── NSFW → 状态机: IDLE → 待切换 → 保存快照
    │
    ├── 正常 → 状态机: 已切换 → 待恢复
    │
    └── 失败 → 状态机: 已切换 → 待恢复（保守处理）
                        │
                        ▼
               用户发送消息 → GENERATION_STARTED
                        │
                ┌───────┴───────┐
                ▼               ▼
          switchToModel()  restoreOriginalModel()
                │               │
                ▼               ▼
         oai_settings 已切换  oai_settings 已恢复
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
index.js                    ← 入口控制器
├── src/logger.js           ← 日志收集与渲染
├── src/settings.js         ← 设置持久化与 DOM 同步
├── src/state.js            ← 有限状态机
├── src/detector.js         ← NSFW 检测 API 调用
└── src/model-switcher.js   ← oai_settings 快照与模型切换
```

详细技术文档见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 开发计划

- [ ] **B 方案** — 插件独立调用 API，完全脱离 oai_settings 依赖
- [ ] 独立 API 调用模块
- [ ] 消息历史自动拼接
- [ ] 回复注入与 UI 刷新

详见 [TODO.md](TODO.md)。

## 贡献指南

欢迎提交 Issue 和 Pull Request。

1. Fork 本仓库
2. 创建你的功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交你的修改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

## 许可证

本项目基于 [GNU General Public License v3.0](LICENSE) 开源。