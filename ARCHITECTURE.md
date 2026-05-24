# NSFW 模型切换器 — 项目架构与开发者手册

> **项目名称**: sillytavern-auto-model-switcher
>
> **版本**: 0.1.2
>
> **描述**: SillyTavern 扩展插件，在 AI 回复完成后自动检测 NSFW 内容，并根据检测结果在下次生成时切换至预设模型。
>
> **技术栈**: JavaScript (ES Module)、jQuery、SillyTavern Extension API
>
> **仓库**: https://github.com/ICU-bit/sillytavern-auto-model-switcher

---

## 目录

1. [开发者快速上手](#1-开发者快速上手)
2. [项目全景](#2-项目全景)
3. [SillyTavern 扩展开发须知](#3-sillytavern-扩展开发须知)
4. [组件详解](#4-组件详解)
5. [行为逻辑](#5-行为逻辑)
6. [组件交互](#6-组件交互)
7. [接口定义](#7-接口定义)
8. [调试指南](#8-调试指南)
9. [异常处理](#9-异常处理)
10. [已知问题与排错](#10-已知问题与排错)
11. [决策记录](#11-决策记录)
12. [未来规划](#12-未来规划)
13. [附录](#13-附录)

---

## 1. 开发者快速上手

### 1.1 环境要求

| 依赖 | 说明 |
|---|---|
| SillyTavern | 任何支持扩展的版本（2024+） |
| Node.js | SillyTavern 运行所需（≥18.x） |
| 浏览器 | Chrome/Firefox/Edge（用于调试） |

### 1.2 克隆与安装

```bash
# 1. 进入 SillyTavern 的 third-party 扩展目录
cd /path/to/SillyTavern/public/scripts/extensions/third-party/

# 2. 克隆仓库
git clone https://github.com/ICU-bit/sillytavern-auto-model-switcher.git

# 3. 重启 SillyTavern，插件会自动加载
```

查看加载是否成功：打开 SillyTavern → 右侧扩展面板 → 应该看到"NSFW模型切换器"折叠面板。

### 1.3 开发环境搭建

```bash
# 推荐：在仓库目录和安装目录之间建立链接
# 这样在仓库中修改代码，安装目录自动同步
# Windows (管理员 PowerShell)：
cmd /c mklink /D "E:\ST\projects\SillyTavern\public\scripts\extensions\third-party\sillytavern-auto-model-switcher" "E:\ST\projects\酒馆热插拔模型\sillytavern-auto-model-switcher"
```

### 1.4 开发工作流

```
修改代码 → 刷新浏览器页面(F5) → 查看效果 → 检查日志
                ↓
         没有生效？→ 检查控制台报错 → 修复 → 重试
```

**重要**: SillyTavern 扩展是 ES Module，浏览器会缓存模块。每次修改代码后必须**硬刷新**（`Ctrl+F5`或`Ctrl+Shift+R`）清除缓存。

### 1.5 首次运行检查清单

```
□ 插件面板在扩展设置中可见
□ 状态灯显示"配置不完整"（黄色）
□ 填写 NSFW 检测 API 地址和检测模型名
□ 填写切换目标模型名称和来源
□ 打开调试模式查看日志
□ 发送一条消息触发 AI 回复，观察日志
□ 确认检测结果正确解析
□ 确认切换/恢复正常执行
```

---

## 2. 项目全景

### 2.1 文件结构

```
sillytavern-auto-model-switcher/
│
├── index.js                    ← 入口控制器（插件加载起点）
├── manifest.json               ← ST 扩展声明文件
│
├── src/
│   ├── model-switcher.js       ← 模型切换器（oai_settings 快照管理）
│   ├── detector.js             ← NSFW 检测器（API 调用）
│   ├── state.js                ← 状态机（切换生命周期管理）
│   ├── settings.js             ← 设置管理器（持久化存储）
│   └── logger.js               ← 日志模块（收集与渲染）
│
├── ARCHITECTURE.md             ← 本文件
├── TODO.md                     ← 待开发功能记录
├── INSTALL.md                  ← 安装说明
└── README.md                   ← 项目介绍
```

### 2.2 组件总览

| 组件 | 文件名 | 类型 | 行数 | 核心功能 |
|---|---|---|---|---|
| 入口控制器 | `index.js` | 入口/编排 | ~417 | 初始化插件、注册事件、编排子模块 |
| 模型切换器 | `src/model-switcher.js` | 核心业务 | ~304 | oai_settings 快照管理、模型切换与恢复 |
| NSFW 检测器 | `src/detector.js` | 核心业务 | ~165 | 调用外部 API 对文本进行 NSFW 分类 |
| 状态机 | `src/state.js` | 核心业务 | ~166 | 有限状态机管理切换生命周期 |
| 设置管理器 | `src/settings.js` | 工具层 | ~106 | 扩展设置存取、DOM 双向绑定 |
| 日志模块 | `src/logger.js` | 工具层 | ~77 | 运行日志收集、存储和 UI 渲染 |

### 2.3 文件依赖关系

```
index.js                    ← 入口，依赖所有子模块
├── src/logger.js           ← 无依赖（纯工具）
├── src/settings.js         ← 依赖 SillyTavern: extensions.js（extension_settings）、script.js（saveSettingsDebounced）
├── src/state.js            ← 无依赖（纯业务逻辑）
├── src/detector.js         ← 依赖 logger、settings、SillyTavern: extensions.js（getContext）
└── src/model-switcher.js   ← 依赖 logger、settings、SillyTavern: script.js、openai.js（oai_settings）、power-user.js（power_user）
```

### 2.4 数据流全景

```
┌──────────────────────────────────────────────────────────────────────┐
│                          浏览器 / 用户操作                          │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ 发送消息     │  │ AI 回复完成  │  │ 操作设置面板  │               │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                │                  │                       │
│         ▼                ▼                  ▼                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    SillyTavern 事件总线                       │  │
│  │  GENERATION_STARTED | CHARACTER_MESSAGE_RENDERED | ...       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│         │                │                  │                       │
│         ▼                ▼                  ▼                       │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────────┐     │
│  │ index.js   │  │ index.js     │  │ settings.js            │     │
│  │ 触发切换   │  │ 触发检测     │  │ 保存/读取配置           │     │
│  │ 或恢复     │  │              │  │                        │     │
│  └─────┬──────┘  └──────┬───────┘  └────────────────────────┘     │
│        │                │                                          │
│        ▼                ▼                                          │
│  ┌────────────┐  ┌──────────────┐                                  │
│  │ model-     │  │ detector.js  │                                  │
│  │ switcher   │  │ → fetch API  │                                  │
│  │ → 修改     │  │ ← 检测结果   │                                  │
│  │ oai_settings│  └──────┬───────┘                                  │
│  └────────────┘         │                                          │
│                         ▼                                          │
│                   ┌──────────────┐                                  │
│                   │ state.js     │                                  │
│                   │ 更新状态      │                                  │
│                   └──────────────┘                                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. SillyTavern 扩展开发须知

### 3.1 ST 扩展加载机制

SillyTavern 扩展的加载顺序：

```
1. ST 读取 /public/scripts/extensions/ 下的所有 manifest.json
2. 按 manifest.json 中声明的 js 路径加载 ES Module
3. 扩展模块内部的 jQuery(async () => {...}) 自执行
4. 扩展可以通过事件监听与其他模块通信
```

**关键点**:
- ST **不会**自动调用扩展的任何导出函数。扩展必须在自身模块内执行初始化代码（jQuery 自执行模式）
- 扩展加载顺序由 `loading_order` 控制（越大越晚加载）
- 扩展可以通过 `import` 直接访问 ST 核心模块的导出

### 3.2 manifest.json 规范

```json
{
    "display_name": "NSFW模型切换器",         // 扩展显示名称
    "loading_order": 100,                      // 加载顺序（100=较晚加载）
    "requires": [],                            // 依赖的其他扩展
    "optional": [],                            // 可选依赖
    "js": "index.js",                          // 入口 JS 文件
    "author": "ICU-bit",
    "version": "0.1.0",
    "homePage": "https://github.com/ICU-bit/..."
}
```

**注意**: 不要使用非标准字段（如 `hooks`），ST 不会识别。

### 3.3 导入路径规则

插件安装在 `<ST>/public/scripts/extensions/third-party/<插件名>/` 下，导入路径相对于此：

| 目标模块 | 路径 | 说明 |
|---|---|---|
| `script.js` | `../../../../script.js` | ST 主模块 |
| `extensions.js` | `../../../extensions.js` | 扩展工具模块 |
| `openai.js` | `../../../../scripts/openai.js` | OpenAI API 设置 |
| `power-user.js` | `../../../../scripts/power-user.js` | 用户设置（预设） |
| 同目录文件 | `./src/xxx.js` | 自己的子模块 |

### 3.4 核心 API 速查

```javascript
// ---- 从 script.js 导入 ----
import { eventSource, event_types } from '../../../../script.js';
import { saveSettingsDebounced } from '../../../../script.js';

// 注册事件监听
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, callback);
eventSource.on(event_types.GENERATION_STARTED, callback);

// 防抖保存设置
saveSettingsDebounced();  // 默认 500ms 防抖

// ---- 从 extensions.js 导入 ----
import { getContext } from '../../../extensions.js';
const context = getContext();
context.chat  // 当前聊天消息数组
context.characters  // 角色列表

// ---- 扩展设置 ----
import { extension_settings } from '../../../extensions.js';
extension_settings['my-extension-name'] = { ... };
```

### 3.5 SillyTavern 关键数据结构

**oai_settings** (从 `openai.js` 导入):
```javascript
{
    chat_completion_source: 'openai' | 'claude' | 'custom' | 'deepseek' | ...,
    openai_model: 'gpt-4',
    deepseek_model: 'deepseek-chat',
    custom_model: 'doubao-pro',
    custom_url: 'https://...',       // 自定义来源的 API URL
    streaming: true,
    temp_openai: 1.0,
    preset_settings_openai: 'Default',
    // ... 更多预设参数
}
```

**power_user** (从 `power-user.js` 导入):
```javascript
{
    instruct: {                       // 指令模板
        enabled: true,
        preset: 'Alpaca',
        input_sequence: '### Instruction:',
        output_sequence: '### Response:',
        // ...
    },
    context: {                        // 上下文模板
        preset: 'Default',
        story_string: '...',
        // ...
    },
    sysprompt: {                      // 系统提示词
        enabled: true,
        name: 'Neutral - Chat',
        content: 'Write {{char}}\'s next reply...',
    },
    reasoning: {                      // 推理模板
        name: 'Blank',
        // ...
    },
}
```

---

## 4. 组件详解

### 4.1 入口控制器（index.js）

**职责范围**: 插件的生命周期管理、事件注册与编排

**核心职责**:
- 使用 `jQuery(async () => {...})` 自执行模式完成 ST 标准初始化
- 创建状态机单例（`createStateMachine()`）
- 生成设置面板 HTML 并注入到 `#extensions_settings`
- 注册 4 个 ST 事件监听器
- 管理两个关键标志位

**关键变量**:

| 变量 | 类型 | 用途 |
|---|---|---|
| `state` | `ModelStateMachine` | 状态机单例 |
| `isReady` | `boolean` | 插件初始化完成后设为 true，在此之前所有事件不处理 |
| `detectionInProgress` | `boolean` | 并发检测锁，防止多次检测同时进行 |

**初始化流程**:

```
jQuery(async () => {
    ① 合并默认设置 → extension_settings[EXTENSION_NAME]
    ② setupLogRendering() → 绑定日志 UI 更新回调
    ③ initSettingsPanel() → createSettingsHtml() → append 到 #extensions_settings
    ④ bindSettingsListeners() → 绑定 input/change/click 事件
    ⑤ registerEventListeners() → eventSource.on(...) × 4
    ⑥ isReady = true → "插件就绪"
})
```

**事件绑定表**:

| DOM 事件 | 选择器 | 处理函数 |
|---|---|---|
| `input change` | 所有输入框/选择框 | `collectAndSaveFromDom($panel)` + 更新状态灯 |
| `click` | `#nsfw_switcher_test_btn` | `testNsfwApi()` |
| `click` | `#nsfw_switcher_restore_btn` | `state.onManualRestore()` → `restoreOriginalModel()` |
| `click` | `#nsfw_switcher_clear_logs_btn` | `clearLogs()` |

**SillyTavern 事件绑定表**:

| 事件类型 | 回调函数 | 触发时机 |
|---|---|---|
| `CHARACTER_MESSAGE_RENDERED` | `onMessageRendered` | AI 消息渲染完成 |
| `GENERATION_STARTED` | `onGenerationStarted` | 用户发送消息开始生成 |
| `MESSAGE_SENT` | `onMessageSent` | 用户消息发送后（仅调试） |
| `EXTENSION_SETTINGS_LOADED` | `onSettingsLoaded` | 扩展设置加载完成 |

**设置面板 HTML 结构**:

```
.inline-drawer                              ← 可折叠容器
├── .inline-drawer-header                   ← 标题栏
│   ├── <b>NSFW模型切换器</b>
│   └── 折叠图标
└── .inline-drawer-content                  ← 内容区
    └── 状态栏（指示灯 + 状态文本 + 状态机文本）
    └── 启用开关（checkbox）
    └── NSFW 检测 API 区域
    │   ├── API 地址输入框（#nsfw_switcher_api_url）
    │   ├── API 密钥输入框（#nsfw_switcher_api_key）
    │   └── 模型名称输入框（#nsfw_switcher_model_name）
    └── 切换目标模型区域
    │   ├── 目标模型名称输入框（#nsfw_switcher_model_a）
    │   ├── 目标 API 地址输入框（#nsfw_switcher_model_a_api_url）
    │   ├── 目标 API 密钥输入框（#nsfw_switcher_model_a_api_key）
    │   ├── API 来源下拉框（#nsfw_switcher_model_a_source）
    │   ├── 显示通知 checkbox
    │   └── 调试模式 checkbox
    └── 操作按钮（测试API | 恢复原模型）
    └── 运行日志区域
```

---

### 4.2 模型切换器（src/model-switcher.js）

**职责范围**: `oai_settings` 快照管理、跨来源模型切换与恢复

这是插件中最关键的模块，直接操作 SillyTavern 的核心配置对象。

#### 4.2.1 映射表

**`SOURCE_TO_FIELD`**: 将 `chat_completion_source`（如 `'deepseek'`）映射到对应的模型字段名（如 `'deepseek_model'`）。

```javascript
// 使用方式：获取当前来源对应的模型字段
const field = SOURCE_TO_FIELD[oai_settings.chat_completion_source];
// → 返回 'deepseek_model'、'custom_model' 等
```

**`SOURCE_TO_API_URL_FIELD`**: 记录哪些来源需要额外保存 API URL，以及对应的字段名。

```javascript
// 目前只有 custom 来源需要——它的 API URL 存在 oai_settings.custom_url 中
// 其他来源（deepseek、openai 等）使用服务端默认 URL，oai_settings 中无对应字段
const SOURCE_TO_API_URL_FIELD = {
    'custom': 'custom_url',
};
```

#### 4.2.2 快照机制

快照是插件的核心状态。它在 `CHARACTER_MESSAGE_RENDERED` 检测到 NSFW 时创建（幂等），在 `restoreOriginalModel()` 被调用后清除。

**快照结构**:

```javascript
{
    chat_completion_source: 'custom',           // 原始 API 来源
    model_fields: {                              // 所有来源的模型名（快照时刻）
        openai_model: 'gpt-4',
        claude_model: 'claude-sonnet-4-5',
        deepseek_model: 'deepseek-chat',
        custom_model: 'doubao-pro',
        // ...全部 23 个来源
    },
    api_url: 'https://api.example.com/v1',     // 原始来源的 API URL（仅 custom）
    streaming: true,                            // 流式开关
    presets: {                                  // power_user 预设的深拷贝
        instruct: { enabled: true, preset: 'Alpaca', ... },
        context: { preset: 'Default', ... },
        sysprompt: { enabled: true, name: 'Neutral - Chat', ... },
        reasoning: { name: 'Blank', ... },
    },
}
```

**快照生命周期**:

```
首次检测到 NSFW（IDLE）
  │
  ▼
takeSnapshot() → settingsSnapshot 被赋值
  │
  ├── switchToModel() 时复用快照（不再重复创建）
  ├── restoreOriginalModel() 时读取并清空
  └── 手动恢复按钮 → clearSettingsSnapshot()
  │
  ▼
settingsSnapshot = null → 下次 NSFW 检测重新创建
```

#### 4.2.3 切换逻辑详解

```javascript
switchToModel(targetModel, targetSource, targetApiUrl, targetApiKey)
```

**参数说明**:

| 参数 | 来源 | 示例 | 必填 |
|---|---|---|---|
| `targetModel` | 设置面板"目标模型名称" | `'deepseek-v4-flash'` | 是 |
| `targetSource` | 设置面板"API来源" | `'deepseek'` | 是 |
| `targetApiUrl` | 设置面板"目标模型API地址" | `'https://api.deepseek.com/v1'` | 否 |
| `targetApiKey` | 设置面板"目标模型API密钥" | `'sk-xxx'` | 否 |

**执行步骤**:

```
① saveSettingsSnapshot()
   └─ 快照存在？→ return（幂等）
   └─ 不存在？→ takeSnapshot() 记录当前全部配置

② 确定目标来源
   └─ 优先用 targetSource 参数（来自 index.js 的 settings.modelASource）
   └─ 如果为空 → 报错返回

③ 切换 chat_completion_source
   └─ 如果 targetSource !== oai_settings.chat_completion_source
   └─ 则 oai_settings.chat_completion_source = targetSource

④ 写入模型名
   └─ oai_settings[SOURCE_TO_FIELD[targetSource]] = targetModel
   └─ 例如：oai_settings.deepseek_model = 'deepseek-v4-flash'

⑤ 写入 API URL（如果有）
   └─ 查找 SOURCE_TO_API_URL_FIELD[targetSource]
   └─ 如果存在且 plugin 提供了 URL → 写入对应字段
   └─ 例如：oai_settings.custom_url = 'https://...'

⑥ 写入 API Key（如果有）
   └─ oai_settings[targetSource + '_api_key'] = targetApiKey
   └─ 例如：oai_settings.deepseek_api_key = 'sk-xxx'

⑦ restorePresets() — 应用原模型的预设
   └─ 从快照中恢复 power_user 的 instruct/context/sysprompt/reasoning

⑧ saveSettingsDebounced() + toastr 通知
```

#### 4.2.4 恢复逻辑详解

```javascript
restoreOriginalModel()
```

**执行步骤**:

```
① 检查 settingsSnapshot 是否存在
   └─ 不存在 → "无可恢复的快照" → return false

② 从快照读取 source 和 field
   └─ source = settingsSnapshot.chat_completion_source
   └─ field = SOURCE_TO_FIELD[source]

③ 恢复 chat_completion_source
   └─ 如果 source !== 当前 source → 还原

④ 恢复模型名
   └─ oai_settings[field] = settingsSnapshot.model_fields[field]

⑤ 恢复 API URL
   └─ 查找 SOURCE_TO_API_URL_FIELD[source]
   └─ 如果存在且快照中有值 → 还原
   └─ 例如：oai_settings.custom_url = 快照中的原始值

⑥ 恢复 API Key
   └─ oai_settings[source + '_api_key'] = 快照值

⑦ 恢复 streaming
⑧ restorePresets()
⑨ saveSettingsDebounced()
⑩ settingsSnapshot = null（清除快照）
```

---

### 4.3 NSFW 检测器（src/detector.js）

**职责范围**: 调用外部 Chat Completion API 对文本进行 NSFW 分类

#### 4.3.1 API 调用细节

**请求结构**:

```json
{
    "model": "Qwen2.5-14B-Instruct",
    "messages": [
        {
            "role": "user",
            "content": "判断以下内容是否为 NSFW（成人/色情内容）。请只回复数字 1（是）或 0（否），不要输出任何其他内容：\n\n[消息正文...]"
        }
    ],
    "temperature": 0.0,
    "max_tokens": 5
}
```

**响应解析**:

```
response.json().choices[0].message.content.trim()
```

**结果映射**:

| 返回文本 | 解析结果 | 含义 |
|---|---|---|
| `'1'` / `'true'` / `'是'` / `'yes'` | `true` | NSFW |
| `'0'` / `'false'` / `'否'` / `'no'` | `false` | 正常 |
| `''` / 无限空格 / 其他文本 | `null` | 检测失败 |

**超时**: 30s（AbortController）。避免长时间等待。

**URL 标准化**: `normalizeApiUrl()` 自动补全 `/chat/completions`

```
"https://api.siliconflow.cn/v1" → "https://api.siliconflow.cn/v1/chat/completions"
"https://api.siliconflow.cn/v1/" → "https://api.siliconflow.cn/v1/chat/completions"
"https://api.siliconflow.cn/v1/chat/completions" → 不变
```

#### 4.3.2 消息获取策略

`onMessageRendered(messageId, type)` 中优先使用 `getMessageTextById(messageId)`，失败时回退到 `getLastAiMessageText()`。

**getMessageTextById**: 如果 messageId 有效且对应消息是 AI 消息，直接返回正文
**getLastAiMessageText**: 从 `context.chat` 倒序遍历，找最后一条 AI 消息

**正文提取**: `extractContent()` 从消息中提取 `<content>...</content>` 标签内的纯文本

```javascript
// 输入（原始消息）：
"<content>这是正文内容</content><UpdateVariable>其他数据</UpdateVariable>"

// 输出（提取后）：
"这是正文内容"

// 如果没有 content 标签，返回原文
```

---

### 4.4 状态机（src/state.js）

**职责范围**: NSFW 检测-切换-恢复的生命周期管理

#### 4.4.1 状态定义

```javascript
const State = Object.freeze({
    IDLE: 'idle',                    // 空闲，无待处理动作
    PENDING_SWITCH: 'pending_switch',// 待切换：检测到 NSFW，等待下次生成
    SWITCHED: 'switched',           // 已切换：当前正在使用目标模型
    PENDING_RESTORE: 'pending_restore',// 待恢复：检测到正常内容，等待下次生成
});
```

#### 4.4.2 状态转换表

| 当前状态 | 事件 | 新状态 | 返回值 |
|---|---|---|---|
| IDLE | `onNsfwDetected()` | PENDING_SWITCH | `true` |
| SWITCHED | `onNsfwDetected()` | SWITCHED（不变） | `false` |
| SWITCHED | `onCleanDetected()` | PENDING_RESTORE | `true` |
| PENDING_RESTORE | `onCleanDetected()` | PENDING_RESTORE（不变） | `true` |
| 其他 | `onCleanDetected()` | 不变 | `false` |
| SWITCHED | `onDetectionFailed()` | PENDING_RESTORE | `true` |
| 其他 | `onDetectionFailed()` | 不变 | `false` |
| PENDING_SWITCH | `onGenerationStarted()` | SWITCHED | `'switch'` |
| PENDING_RESTORE | `onGenerationStarted()` | IDLE | `'restore'` |
| 其他 | `onGenerationStarted()` | 不变 | `'none'` |
| 任意 | `onManualRestore()` / `reset()` | IDLE | `void` |

#### 4.4.3 中文状态描述

| 状态 | 显示文本 |
|---|---|
| IDLE | 空闲 |
| PENDING_SWITCH | 待切换 |
| SWITCHED | 已切换(NSFW模型) |
| PENDING_RESTORE | 待恢复 |

---

### 4.5 设置管理器（src/settings.js）

**职责范围**: SillyTavern 标准扩展设置存取

#### 4.5.1 默认设置

```javascript
DEFAULT_SETTINGS = {
    enabled: true,              // 插件总开关
    nsfwApiUrl: '',             // NSFW 检测 API 地址
    nsfwApiKey: '',             // NSFW 检测 API 密钥
    nsfwModelName: '',          // 检测模型名称
    modelA: '',                 // 切换目标模型名称
    modelAApiUrl: '',           // 切换目标 API 地址
    modelAApiKey: '',           // 切换目标 API 密钥
    modelASource: 'openai',     // 切换目标 API 来源
    showNotification: true,     // 显示 toastr 通知
    debugMode: false,           // 调试模式
}
```

#### 4.5.2 存储机制

使用 `extension_settings[EXTENSION_NAME]`（`EXTENSION_NAME = 'nsfw-model-switcher'`）进行持久化，数据存储在 SillyTavern 的 `settings.json` 中。

**加载**（合并默认值）:
```javascript
function loadSettings() {
    const stored = extension_settings[EXTENSION_NAME];
    if (!stored) {
        extension_settings[EXTENSION_NAME] = { ...DEFAULT_SETTINGS };
        return { ...DEFAULT_SETTINGS };
    }
    return { ...DEFAULT_SETTINGS, ...stored };  // 默认值兜底
}
```

**保存**（从 DOM 收集）:
```javascript
function collectAndSaveFromDom($formContainer) {
    extension_settings[EXTENSION_NAME] = {
        enabled: $formContainer.find('#nsfw_switcher_enabled').prop('checked'),
        nsfwApiUrl: $formContainer.find('#nsfw_switcher_api_url').val(),
        // ... 所有字段
    };
    saveSettingsDebounced();  // 防抖写入
}
```

#### 4.5.3 状态指示灯

| 条件 | 颜色 | 文本 |
|---|---|---|
| `!enabled` | 红 `#e74c3c` | 已禁用 |
| 配置不完整 | 黄 `#f39c12` | 配置不完整 |
| 一切正常 | 绿 `#27ae60` | 运行中 |

---

### 4.6 日志模块（src/logger.js）

**职责范围**: 运行日志的收集、存储和 UI 渲染

**数据结构**:

```javascript
// 每条日志
{
    timestamp: '04:08:22',   // 时间戳（toLocaleTimeString('zh-CN')）
    message: '检测结果: NSFW', // 日志内容
    type: 'warning',         // 类型：info | success | warning | error
}
```

**类型颜色**:

| 类型 | 颜色 |
|---|---|
| `info` | 蓝 `#3498db` |
| `success` | 绿 `#27ae60` |
| `warning` | 黄 `#f39c12` |
| `error` | 红 `#e74c3c` |

**渲染模式**: 渲染回调（观察者模式）

```javascript
// 注册回调（index.js 中）
setRenderCallback((logs) => {
    $('#nsfw_switcher_logs').html(renderLogsHtml(logs));
});

// 添加日志时自动触发回调
addLog('消息', 'info');  // → push到数组 → console.log → renderCallback(logs)
```

**缓冲区限制**: 最多 50 条，超出时删除最旧的。

---

## 5. 行为逻辑

### 5.1 主事件循环

```
AI 回复完成
    │
    ▼
CHARACTER_MESSAGE_RENDERED 事件触发
    │
    ├── 是否 isReady？  → 否 → return
    ├── 是否 enabled？  → 否 → return
    ├── 是否用户消息？  → 是 → return（type === 'user'）
    ├── 检测进行中？   → 是 → return（并发锁）
    │
    ▼
获取消息内容
    ├── getMessageTextById(messageId) 优先
    └── 失败 → getLastAiMessageText() 回退
    │
    ├── 无内容？ → return（"未找到 AI 消息内容"）
    │
    ▼
detectNSFW(content)
    │
    ├── true  (NSFW)  ──→ state.onNsfwDetected() → PENDING_SWITCH
    │                      saveSettingsSnapshot()
    │
    ├── false (正常)   ──→ state.onCleanDetected()
    │                       ├── 如果之前已切换 → PENDING_RESTORE
    │                       └── 如果本来就是空闲 → 无操作
    │
    └── null  (失败)   ──→ state.onDetectionFailed()
                            ├── 如果已切换 → 保守恢复 PENDING_RESTORE
                            └── 如果空闲 → 无操作

                       下次用户发送消息
                              │
                              ▼
                     GENERATION_STARTED 事件触发
                              │
                     state.onGenerationStarted()
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
        'switch'         'restore'          'none'
            │                 │                 │
            ▼                 ▼                 ▼
    switchToModel()   restoreOriginalModel()  跳过
            │                 │
            ▼                 ▼
     oai_settings       oai_settings
     已切换为目标        已恢复为原始
```

### 5.2 状态机时序图

```
时间 →
│
├── [AI 回复 1] → CHARACTER_MESSAGE_RENDERED
│   └── detectNSFW → NSFW → state: IDLE → PENDING_SWITCH
│                           快照已保存
│
├── [用户发送] → GENERATION_STARTED
│   └── state.onGenerationStarted() → 'switch'
│       switchToModel() → oai_settings 已切换到目标
│       state: PENDING_SWITCH → SWITCHED
│
├── [AI 回复 2] → CHARACTER_MESSAGE_RENDERED
│   └── detectNSFW → 正常 → state.onCleanDetected()
│       state: SWITCHED → PENDING_RESTORE
│
├── [用户发送] → GENERATION_STARTED
│   └── state.onGenerationStarted() → 'restore'
│       restoreOriginalModel() → oai_settings 已恢复
│       state: PENDING_RESTORE → IDLE
│       快照已清除
│
└── [AI 回复 3] → CHARACTER_MESSAGE_RENDERED
    └── detectNSFW → NSFW → state: IDLE → PENDING_SWITCH（重新开始）
```

### 5.3 常见场景处理

**场景 1: 连续 NSFW 回复**

```
IDLE → NSFW → PENDING_SWITCH → 生成 → SWITCHED
     → NSFW(已在SWITCHED) → 保持 SWITCHED（不重复创建快照）
     → NSFW(已在SWITCHED) → 保持 SWITCHED
     → 正常 → PENDING_RESTORE → 生成 → IDLE
```

**场景 2: 中途切换回正常**

```
SWITCHED → 正常 → PENDING_RESTORE → 用户不发送了
         → 又 NSFW → onNsfwDetected() 返回 false（SWITCHED 不变）
                     但快照存在，不会重复创建
```

**场景 3: 检测失败后恢复**

```
SWITCHED → 检测失败 → PENDING_RESTORE → 生成 → IDLE（保守恢复）
```

**场景 4: 手动恢复**

```
SWITCHED → 用户点"恢复原模型"按钮
         → state.onManualRestore() → IDLE
         → restoreOriginalModel() → 恢复配置
         → clearSettingsSnapshot()
```

---

## 6. 组件交互

### 6.1 依赖关系图

```
┌──────────────────────────────────────────────────────────────┐
│                     index.js (入口控制器)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ settings │  │  state   │  │ detector │  │ model-switcher│ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘ │
│       │              │             │               │          │
│       ▼              ▼             ▼               ▼          │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                  SillyTavern 核心模块                   │   │
│  │  script.js          extensions.js        openai.js     │   │
│  │  power-user.js      (浏览器) fetch API                 │   │
│  └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘

                ┌─────────────┐
                │   logger    │ ← 所有组件都依赖（通过 addLog）
                └─────────────┘
```

### 6.2 通信方式表

| 发起者 | 接收者 | 方式 | 数据 |
|---|---|---|---|
| index.js | detector | 函数调用（同步） | `detectNSFW(content)` → `Promise<boolean\|null>` |
| index.js | model-switcher | 函数调用（async） | `switchToModel(...)` → `Promise<boolean>` |
| index.js | state | 方法调用 | `state.onNsfwDetected()` → `boolean` |
| index.js | settings | 函数调用 | `loadSettings()` → `object` |
| 所有组件 | logger | 函数调用 | `addLog(msg, type)` → void |
| SillyTavern | index.js | EventEmitter | `CHARACTER_MESSAGE_RENDERED(messageId, type)` |
| model-switcher | oai_settings | 直接写入 | `oai_settings[field] = value` |
| model-switcher | power_user | Object.assign | `Object.assign(power_user.instruct, ...)` |
| detector | 外部 API | fetch (HTTP) | `POST /chat/completions` → Response |

### 6.3 关键函数调用链

**NSFW 检测链**:
```
CHARACTER_MESSAGE_RENDERED(messageId)
  → onMessageRendered(messageId, type)
    → getMessageTextById(messageId) || getLastAiMessageText()
      → getContext().chat[messageId].mes || 遍历 chat 找最后 AI 消息
        → extractContent(message.mes)  // 提取 <content> 标签
    → detectNSFW(content)
      → fetch(normalizeApiUrl(nsfwApiUrl), { body: JSON.stringify({...}) })
      → 解析 choices[0].message.content
    → state.onNsfwDetected() / onCleanDetected() / onDetectionFailed()
      → saveSettingsSnapshot()
```

**模型切换链**:
```
GENERATION_STARTED(type, params, dryRun)
  → onGenerationStarted(type, params, dryRun)
    → state.onGenerationStarted() → 'switch' | 'restore' | 'none'
    → switchToModel(targetModel, targetSource, targetApiUrl, targetApiKey)
      → saveSettingsSnapshot()  // 幂等
      → oai_settings.chat_completion_source = targetSource
      → oai_settings[modelField] = targetModel
      → oai_settings[urlField] = targetApiUrl  // 如果提供
      → oai_settings[keyField] = targetApiKey  // 如果提供
      → restorePresets()
      → saveSettingsDebounced()
```

---

## 7. 接口定义

### 7.1 入口控制器（index.js）

| 导出 | 说明 |
|---|---|
| 无 | 自执行模块，不对外导出任何接口（jQuery 自执行模式） |

**内部函数**:

| 函数 | 签名 | 说明 |
|---|---|---|
| `createSettingsHtml` | `() → string` | 生成设置面板 HTML 模板字符串 |
| `initSettingsPanel` | `() → jQuery \| null` | 注入面板到 `#extensions_settings` |
| `bindSettingsListeners` | `($panel: jQuery) → void` | 绑定 DOM 事件 |
| `onMessageRendered` | `(messageId: number, type: string) → Promise<void>` | 检测事件回调 |
| `onGenerationStarted` | `(type: string, params: object, dryRun: boolean) → Promise<void>` | 切换事件回调 |
| `onMessageSent` | `(messageId: number) → void` | 调试日志 |
| `onSettingsLoaded` | `() → void` | 设置加载完成 |
| `registerEventListeners` | `() → void` | 注册所有 ST 事件 |
| `setupLogRendering` | `() → void` | 绑定日志渲染回调 |

### 7.2 模型切换器（src/model-switcher.js）

| 导出 | 参数 | 返回值 | 说明 |
|---|---|---|---|
| `switchToModel` | `(targetModel: string, targetSource?: string, targetApiUrl?: string, targetApiKey?: string)` | `Promise<boolean>` | 切换到目标模型。先保存快照，再切换 source、模型名、URL、密钥。 |
| `restoreOriginalModel` | `()` | `Promise<boolean>` | 从快照恢复原始模型。还原 source、模型名、URL、密钥、预设。 |
| `saveSettingsSnapshot` | `()` | `boolean` | 手动保存快照。幂等。 |
| `clearSettingsSnapshot` | `()` | `void` | 清除快照。 |
| `hasSettingsSnapshot` | `()` | `boolean` | 检查快照是否存在。 |
| `getCurrentModelInfo` | `()` | `{model: string, source: string} \| null` | 获取当前模型信息。 |
| `getSupportedSources` | `()` | `string[]` | 获取所有支持的 API 来源列表。 |

**使用示例**:

```javascript
// 保存快照
saveSettingsSnapshot();  // → true（首次）或 true（已存在）

// 切换
const ok = await switchToModel(
    'deepseek-v4-flash',        // 目标模型名称
    'deepseek',                 // 目标 API 来源
    '',                         // 使用 deepseek 默认 URL
    ''                          // 使用 deepseek 已有 Key
);

// 恢复
const restored = await restoreOriginalModel();  // → true/false

// 查询
const info = getCurrentModelInfo();
// → { model: 'deepseek-v4-flash', source: 'deepseek' }

hasSettingsSnapshot();  // → true/false
```

### 7.3 NSFW 检测器（src/detector.js）

| 导出 | 参数 | 返回值 | 说明 |
|---|---|---|---|
| `detectNSFW` | `(content: string)` | `Promise<boolean \| null>` | true=NSFW, false=正常, null=检测失败 |
| `getLastAiMessageText` | `()` | `string \| null` | 获取最后一条 AI 消息（倒序遍历 chat） |
| `getMessageTextById` | `(messageId: number)` | `string \| null` | 通过 messageId 获取消息正文 |
| `testNsfwApi` | `()` | `Promise<boolean \| null>` | 测试 API 连通性 |

**detectNSFW 返回值含义**:

| 返回值 | 含义 | 用户日志 |
|---|---|---|
| `true` | NSFW 内容 | `[WARNING] 检测结果: NSFW → 下次生成将切换模型` |
| `false` | 正常内容 | `[INFO] 检测结果: 正常 → 下次生成将恢复原模型` |
| `null` | 检测失败（API 问题/空结果） | `[ERROR] API 测试失败 / [WARNING] 无法解析检测结果` |

### 7.4 状态机（src/state.js）

| 导出 | 类型 | 说明 |
|---|---|---|
| `State` | `Object` | 状态常量 `{IDLE, PENDING_SWITCH, SWITCHED, PENDING_RESTORE}` |
| `ModelStateMachine` | `Class` | 状态机类 |
| `createStateMachine` | `() → ModelStateMachine` | 工厂函数 |

**ModelStateMachine API**:

| 方法/属性 | 返回值 | 说明 |
|---|---|---|
| `state` (getter) | `string` | 当前状态值 |
| `isSwitchedOrPending` | `boolean` | 是否已切换或待恢复 |
| `isUsingSwitchedModel` | `boolean` | 是否正在使用目标模型 |
| `hasPendingAction` | `boolean` | 是否有待处理动作 |
| `shouldSwitch` | `boolean` | 是否需要切换 |
| `shouldRestore` | `boolean` | 是否需要恢复 |
| `hasOriginalSnapshot` | `boolean` | 快照是否已保存 |
| `markOriginalSaved()` | `void` | 标记快照已保存 |
| `onNsfwDetected()` | `boolean` | IDLE → PENDING_SWITCH |
| `onCleanDetected()` | `boolean` | SWITCHED → PENDING_RESTORE |
| `onDetectionFailed()` | `boolean` | SWITCHED → PENDING_RESTORE |
| `onGenerationStarted()` | `'switch'\|'restore'\|'none'` | 返回需要执行的动作 |
| `onManualRestore()` | `void` | 任何状态 → IDLE |
| `reset()` | `void` | 强制重置 |
| `getStateDescription()` | `string` | 中文状态描述 |

### 7.5 设置管理器（src/settings.js）

| 导出 | 类型/参数 | 返回值 | 说明 |
|---|---|---|---|
| `EXTENSION_NAME` | `'nsfw-model-switcher'` | `string` | 扩展名称常量 |
| `DEFAULT_SETTINGS` | `{...10个字段}` | `object` | 默认设置 |
| `loadSettings()` | `()` | `object` | 加载设置，合并默认值 |
| `saveSettings()` | `()` | `void` | 触发防抖保存 |
| `collectAndSaveFromDom($formContainer)` | `(jQuery)` | `void` | 从 DOM 收集并保存 |
| `applySettingsToDom(settings, $formContainer)` | `(object, jQuery)` | `void` | 设置值同步到 DOM |
| `updateStatusIndicator(settings, $container)` | `(object, jQuery)` | `void` | 更新状态灯 |

### 7.6 日志模块（src/logger.js）

| 导出 | 参数 | 返回值 | 说明 |
|---|---|---|---|
| `setRenderCallback` | `(callback: (logs) => void)` | `void` | 注册日志更新回调 |
| `addLog` | `(message: string, type?: string)` | `void` | 添加日志 |
| `clearLogs` | `()` | `void` | 清空所有日志 |
| `getLogs` | `()` | `Array<{timestamp, message, type}>` | 获取日志副本 |
| `renderLogsHtml` | `(logsArray: Array)` | `string` | 生成日志 HTML |

---

## 8. 调试指南

### 8.1 开启调试模式

插件设置面板 → 勾选 **"调试模式（显示详细日志）"**

开启后日志会包含：
- `调用 NSFW 检测 API...`
- `检测结果: 是/否/...`
- `检测 AI 回复中... (长度: xxx 字)`
- `生成开始 → 无需操作`
- 更详细的错误信息

### 8.2 浏览器开发者工具

**控制台（Console）**:
- 所有日志都以 `[NSFW模型切换器]` 前缀输出到 console
- 可以配合 `console.log()`、`console.dir()` 临时调试

**Network 面板**:
```
F12 → Network → Filter: "chat/completions"
```
查看 NSFW 检测 API 的请求和响应：
- **Headers**: 确认 URL 和 Authorization 正确
- **Payload**: 确认发送的 prompt 和参数
- **Response**: 确认 API 返回的 `content` 值

**Sources 面板**:
```
F12 → Sources → Pages → 搜索 index.js / model-switcher.js / detector.js
```
可以下断点、单步调试。

### 8.3 常见调试场景

**场景 A: 插件不加载**
```
检查：
1. console 是否有红色报错（Module import error）
2. Chrome 的 Sources 面板能否找到你的 index.js
3. 确认 manifest.json 的 js 路径是否正确
4. 确认插件在 third-party 目录下
```

**场景 B: 检测 API 不工作**
```
1. 开启调试模式
2. 看日志是否有"调用 NSFW 检测 API..."
3. F12 → Network → 找 chat/completions 请求
4. 看 Response 的 content 字段
```

**场景 C: 模型切换不生效**
```
1. 看日志是否有"执行切换" / "执行恢复"
2. 看日志中"已保存原模型"显示的值
3. 看状态机显示的状态
4. F12 → Console: 输入 oai_settings.chat_completion_source 查看当前 source
```

### 8.4 快速诊断命令

在浏览器 Console 中：

```javascript
// 查看当前 API 来源
oai_settings.chat_completion_source

// 查看当前模型
oai_settings[oai_settings.chat_completion_source + '_model']

// 查看插件设置
extension_settings['nsfw-model-switcher']

// 手动切换测试
// 先保存快照
// 然后手动修改 oai_settings
```

---

## 9. 异常处理

### 9.1 错误分类

| 错误场景 | 检测阶段 | 处理方式 | 用户可见反馈 |
|---|---|---|---|
| 插件无法加载（import 失败） | 初始化 | 浏览器报 Module error | 扩展面板不显示 |
| 设置面板元素未找到 | 初始化 | `addLog('error')`，返回 null | 日志：元素未找到 |
| oai_settings 不可用 | 快照/切换/恢复 | 中止操作，返回 false/null | 日志：oai_settings 不可用 |
| 未配置检测 API | 检测 | 返回 null | 日志：未配置 NSFW 检测 API |
| 检测 API HTTP 错误 | 检测 | throw Error | 日志：API 请求失败: 404 |
| 检测请求超时 | 检测 | AbortController 30s | 日志：检测请求超时 |
| API 返回空内容 | 检测 | 返回 null | 日志：无法解析检测结果 |
| 未指定切换模型 | 切换 | 返回 false | 日志：未指定切换模型 |
| 不支持的目标来源 | 切换 | 返回 false | 日志：不支持的切换目标来源 |
| 快照创建异常 | 快照 | catch → 返回 null | 日志：创建快照失败: ... |
| 无可恢复快照 | 恢复 | 返回 false | 日志：无可恢复的快照 |
| 切换/恢复代码异常 | 切换/恢复 | catch → 返回 false | 日志：切换/恢复失败: ... |
| restorePresets 异常 | 切换/恢复 | catch → continue | 日志：恢复预设失败: ... |

### 9.2 边界条件

| 边界情况 | 处理方式 |
|---|---|
| 快速连续多次回复 | `detectionInProgress` 锁，跳过后续 |
| 插件未就绪时触发事件 | `isReady` 守卫 |
| 用户消息触发检测 | `type === 'user'` 守卫 |
| 重复保存快照 | 幂等，`if (settingsSnapshot) return true` |
| 手动恢复时无快照 | 返回 false，不清除状态 |  |
| dryRun 参数 | `if (dryRun) return` |
| API URL 缺少路径 | `normalizeApiUrl()` 自动补全 |
| 设置新增字段 | `DEFAULT_SETTINGS` 合并确保兼容 |
| 日志超限 | 环形缓冲区，保留最新 50 条 |

### 9.3 故障恢复

- **插件无状态丢失**: `extension_settings` 持久化，重启后恢复
- **快照丢失**: 内存对象，重启后丢失。手动恢复会提示"无可恢复的快照"
- **模型切换失败**: `switchToModel()` 返回 false，不影响现有对话
- **检测 API 超时**: 30s 熔断，返回 null，不阻断流程

---

## 10. 已知问题与排错

### 10.1 常见问题

#### Q: 插件不显示入口

**可能原因**:
1. ES Module 导入失败 → 检查控制台红色报错
2. manifest.json 路径错误 → 确认 `js: "index.js"`
3. 浏览器缓存 → 硬刷新 `Ctrl+F5`
4. 扩展未正确安装 → 检查 third-party 目录下是否存在

#### Q: "无法创建快照：oai_settings 不可用"

**原因**: `oai_settings` 从 `script.js` 导入失败。
**修复**: 确认导入路径为 `import { oai_settings } from '../../../../../scripts/openai.js'`（从 `openai.js` 而非 `script.js`）

#### Q: "400 Bad Request" / "A parameter specified in the request is not valid"

**可能原因**:
1. 切换后的模型名不被目标 API 识别 → 确认模型名正确
2. 切换后的 API 来源未在 ST 中配置 → 插件已改为强制覆盖 URL/Key
3. 目标 API 不接受某些预设参数（如 DeepSeek V4）→ 在 ST 中调整预设

#### Q: 检测结果一直返回空（`无法解析检测结果:`）

**可能原因**:
1. 检测模型因安全策略拒绝输出（常见于 Qwen 系列）→ 换检测模型
2. 输入过长，模型输出空白 → 当前已无截断，换个更大的检测模型

#### Q: 切换后没有使用目标模型

**可能原因**:
1. `chat_completion_source` 未切换 → 检查日志是否有"切换 API 来源"
2. API URL 未覆盖 → 如果目标来源在 ST 中未配置，需要插件强制写入
3. 状态机状态不对 → 检查状态机显示的状态

### 10.2 已知限制

1. **快照内存存储**: 重启 SillyTavern 后快照丢失，需要重新检测 NSFW
2. **单例状态机**: 一个 SillyTavern 实例只支持一个状态机（当前设计如此）
3. **并发检测锁**: 如果 AI 极快速连续输出多条，后面的会被跳过
4. **只支持 Chat Completion**: 不支持 Text Completion API

### 10.3 调试 checklist

```
遇到问题 → 按顺序检查

[  ] 1. 硬刷新浏览器（Ctrl+F5）
[  ] 2. 查看 Console 是否有红色报错
[  ] 3. 开启插件调试模式
[  ] 4. 查看日志是否有错误信息
[  ] 5. F12 → Network → 检查 API 请求和响应
[  ] 6. Console 输入 oai_settings.chat_completion_source 查看当前来源
[  ] 7. 检查插件设置面板配置是否正确
[  ] 8. 在 ST 中切换一下 API 来源再切回来（刷新状态）
```

---

## 11. 决策记录

### 11.1 为什么从 script.js 导入 oai_settings 会失败？

`oai_settings` 在 SillyTavern 中的声明和导出链：

```
openai.js（声明 const + export）
    ↓
script.js（import，但不再 re-export）
```

`script.js` 使用 `oai_settings`，但不导出它。所以 `import { oai_settings } from './script.js'` 失败。

**修复**: 改为 `import { oai_settings } from '../../../../../scripts/openai.js'`

### 11.2 为什么切换方案经历了 Plan A → 回退？

| 阶段 | 方案 | 问题 |
|---|---|---|
| 初始 | 切换 chat_completion_source | SillyTavern 触发大量副作用 |
| Plan A | 不改 source，只改模型名/URL/Key | 跨提供商（custom→deepseek）行不通 |
| 最终 | 切换 source + 统一覆盖 URL/Key | 当前方案 |

**结论**: 必须切换 `chat_completion_source` 来支持跨提供商切换。副作用通过预设恢复来解决。

### 11.3 为什么 custom 来源的 API URL 字段名特殊？

SillyTavern 中大多数 API 提供商使用**服务端默认 URL**（如 DeepSeek 默认 `https://api.deepseek.com`），不需要在 `oai_settings` 中保存 URL。但 `custom` 来源需要用户自定义 URL，存放在 `oai_settings.custom_url` 中（注意字段名不是 `custom_api_url`）。

其他来源的 API 请求由 ST 服务端通过 `/api/backends/chat-completions/generate` 处理，服务端知道各提供商的默认 URL。

### 11.4 为什么 API Key 不需要快照保存？

SillyTavern 的 API Key 由 `secrets.js` 系统管理（写入 `secrets.json`），不是在 `oai_settings` 中直接存储。切换 `chat_completion_source` 后，ST 会从 secrets 中读取对应来源的 Key。

但如果目标来源从未在 ST 中配置过，secrets 中也没有该来源的 Key。这时插件会把插件设置面板中的 Key 写入 `oai_settings[source + '_api_key']`。

### 11.5 为什么检测 prompt 使用中文？

因为大多数用户使用中文，且轻量级检测模型在中文场景下更稳定。支持中英文结果解析（是/否/1/0/true/false/yes/no）。

---

## 12. 未来规划

### 12.1 B 方案：插件独立调用 API

详见 [TODO.md](./TODO.md)。

**核心思路**: 插件完全不碰 `oai_settings`，自己发送 HTTP 请求调用目标模型 API，将返回结果插入聊天记录。

**优点**:
- 完全不影响 ST 本体配置
- 不需要快照/恢复机制
- 支持任意 API 协议
- NSFW 模型可以用完全不同的 API 提供商

**需要实现**:
1. 新增 `src/api-client.js` — 独立 API 调用模块
2. 消息历史拼接 — 从 `getContext().chat` 读取并组装
3. 回复注入 — 调用 API 后将回复写入聊天记录并刷新 UI
4. 配置面板增强 — 新增更多参数配置

---

## 13. 附录

### A. 项目文件清单

| 文件 | 用途 | 是否提交 |
|---|---|---|
| `index.js` | 入口控制器 | ✅ |
| `manifest.json` | ST 扩展声明 | ✅ |
| `src/model-switcher.js` | 模型切换器 | ✅ |
| `src/detector.js` | NSFW 检测器 | ✅ |
| `src/state.js` | 状态机 | ✅ |
| `src/settings.js` | 设置管理器 | ✅ |
| `src/logger.js` | 日志模块 | ✅ |
| `ARCHITECTURE.md` | 架构文档（本文档） | ✅ |
| `TODO.md` | 待开发功能 | ✅ |
| `INSTALL.md` | 安装说明 | ✅ |
| `README.md` | 项目介绍 | ✅ |
| `.gitignore` | Git 忽略规则 | ✅（如有） |

### B. SillyTavern 事件参考

| 事件类型 | 触发时机 | 参数 | 本插件用途 |
|---|---|---|---|
| `CHARACTER_MESSAGE_RENDERED` | AI 消息渲染完成后 | `(messageId, type)` | 触发 NSFW 检测 |
| `GENERATION_STARTED` | 用户发送消息开始生成 | `(type, params, dryRun)` | 执行切换/恢复 |
| `MESSAGE_SENT` | 用户消息发送后 | `(messageId)` | 调试日志 |
| `EXTENSION_SETTINGS_LOADED` | 扩展设置加载完成后 | 无 | 同步 UI |

### C. chat_completion_source 字段名映射

| ST 中的值 | 模型字段 | API URL 字段 | 说明 |
|---|---|---|---|
| `openai` | `openai_model` | 无 | OpenAI |
| `claude` | `claude_model` | 无 | Anthropic Claude |
| `openrouter` | `openrouter_model` | 无 | OpenRouter |
| `custom` | `custom_model` | `custom_url` | 自定义 OpenAI 兼容 |
| `deepseek` | `deepseek_model` | 无 | DeepSeek |
| `siliconflow` | `siliconflow_model` | 无 | SiliconFlow |
| `ai21` | `ai21_model` | 无 | AI21 |
| `azure_openai` | `azure_openai_model` | 无 | Azure OpenAI |
| `cohere` | `cohere_model` | 无 | Cohere |
| ... | `{source}_model` | 无 | 其他来源 |

### D. 预设字段说明

| 预设类型 | power_user 路径 | 用途 | 示例值 |
|---|---|---|---|
| instruct | `power_user.instruct` | 指令模板（输入输出格式） | `{ preset: 'Alpaca', input_sequence: '### Instruction:', ... }` |
| context | `power_user.context` | 上下文模板 | `{ preset: 'Default', story_string: '...' }` |
| sysprompt | `power_user.sysprompt` | 系统提示词 | `{ name: 'Neutral - Chat', content: 'Write...' }` |
| reasoning | `power_user.reasoning` | 推理模板 | `{ name: 'DeepSeek', prefix: '...', suffix: '...' }` |

### E. 版本历史

| 版本 | 提交哈希 | 日期 | 变更内容 |
|---|---|---|---|
| 0.1.2 | `ca0dd87` | — | 添加架构文档 |
| 0.1.2 | `2b53d8c` | — | 修复 API URL 字段名映射 |
| 0.1.1 | `74e779d` | — | 移除 undefined 守卫 |
| 0.1.1 | `94c30d8` | — | 恢复跨 source 切换 |
| 0.1.1 | `bd60397` | — | Plan A 不切换 source |
| 0.1.0 | `f48a2c4` | — | 修复 oai_settings 导入 |
| 0.1.0 | `73ba0ee` | — | 初始版本 |

### F. 推荐阅读

1. [SillyTavern 扩展开发文档](https://docs.sillytavern.app/for-contributors/)（官方）
2. [OpenAI Chat Completion API](https://platform.openai.com/docs/api-reference/chat/create)
3. [DeepSeek API 文档](https://api-docs.deepseek.com/)
4. [ES Module 规范](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)