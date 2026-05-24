# NSFW 模型切换器 — 项目架构文档

> **项目名称**: sillytavern-auto-model-switcher
>
> **版本**: 0.1.0
>
> **描述**: SillyTavern 扩展插件，在 AI 回复完成后自动检测 NSFW 内容，并根据检测结果在下次生成时切换至预设模型。
>
> **技术栈**: JavaScript (ES Module)、jQuery、SillyTavern Extension API

---

## 1. 组件概述

插件由 **6 个组件模块**构成，按职责划分为入口控制层、核心业务层和工具层：

| 组件 | 文件名 | 类型 | 核心功能 |
|---|---|---|---|
| 入口控制器 | `index.js` | 入口/编排 | 初始化插件、注册事件、编排子模块 |
| 模型切换器 | `src/model-switcher.js` | 核心业务 | oai_settings 快照管理、模型切换与恢复 |
| NSFW 检测器 | `src/detector.js` | 核心业务 | 调用外部 API 对文本进行 NSFW 分类 |
| 状态机 | `src/state.js` | 核心业务 | 有限状态机管理切换生命周期 |
| 设置管理器 | `src/settings.js` | 工具层 | 扩展设置存取、DOM 双向绑定 |
| 日志模块 | `src/logger.js` | 工具层 | 运行日志收集、存储和 UI 渲染 |

### 文件依赖树

```
index.js                    ← 入口，依赖所有子模块
├── src/logger.js           ← 无依赖
├── src/settings.js         ← 依赖 logger（间接）、script.js、extensions.js
├── src/state.js            ← 无依赖
├── src/detector.js         ← 依赖 logger、settings、extensions.js
└── src/model-switcher.js   ← 依赖 logger、settings、script.js、openai.js、power-user.js
```

---

## 2. 组件职责

### 2.1 入口控制器（index.js）

**职责范围**: 插件的生命周期管理、事件注册与编排

- 负责 SillyTavern 标准扩展初始化（`jQuery(async () => {...})`）
- 创建状态机单例、设置面板 HTML 并注入到 `#extensions_settings`
- 注册 4 个 SillyTavern 事件监听器，编排事件响应流程
- 管理 `isReady`（初始化就绪标志）和 `detectionInProgress`（并发检测锁）

**对外服务**:
- 向 SillyTavern 提供可显示的扩展设置面板
- 在 `CHARACTER_MESSAGE_RENDERED` 时触发 NSFW 检测
- 在 `GENERATION_STARTED` 时触发模型切换/恢复

### 2.2 模型切换器（src/model-switcher.js）

**职责范围**: oai_settings 快照管理、API 配置切换与恢复

- 存储 `chat_completion_source` → 模型字段名的映射表（SOURCE_TO_FIELD）
- 存储需要保存 API URL 的字段映射（SOURCE_TO_API_URL_FIELD）
- 创建、保存和清除 `oai_settings` 的快照
- 执行跨来源的模型切换（改 source + 模型 + URL）
- 执行模型恢复（还原 source + 原始模型 + 原始 URL）
- 备份和恢复 power_user 预设配置（instruct/context/sysprompt/reasoning）

**对外服务**:
- `switchToModel()` — 切换到目标模型
- `restoreOriginalModel()` — 从快照恢复原模型
- `saveSettingsSnapshot()` — 手动保存快照
- `clearSettingsSnapshot()` — 清除快照
- `getCurrentModelInfo()` — 获取当前模型信息
- `hasSettingsSnapshot()` — 检查快照是否存在

### 2.3 NSFW 检测器（src/detector.js）

**职责范围**: 文本内容 NSFW 分类检测

- 调用 OpenAI 兼容协议的 Chat Completion API 进行判断
- 从 SillyTavern 上下文中获取 AI 消息内容
- 从消息中提取 `<content>` 标签内的正文
- 标准化 API URL（自动补全 `/chat/completions`）

**对外服务**:
- `detectNSFW(content)` — 检测文本是否为 NSFW
- `getLastAiMessageText()` — 获取最后一条 AI 消息
- `getMessageTextById(messageId)` — 通过 ID 获取指定消息
- `testNsfwApi()` — 测试 NSFW 检测 API 连通性

### 2.4 状态机（src/state.js）

**职责范围**: NSFW 检测-切换-恢复的生命周期管理

- 维护 4 种状态：`IDLE` → `PENDING_SWITCH` → `SWITCHED` → `PENDING_RESTORE`
- 提供状态查询和转换的纯函数接口
- 通过 `getStateDescription()` 提供中文状态名供 UI 显示

### 2.5 设置管理器（src/settings.js）

**职责范围**: SillyTavern 标准扩展设置存取

- 使用 `extension_settings` 进行持久化存储
- 默认设置定义（`DEFAULT_SETTINGS`）
- DOM ↔ 设置对象的双向同步
- 状态指示灯（红/黄/绿）的 UI 更新

### 2.6 日志模块（src/logger.js）

**职责范围**: 运行日志的收集和展示

- 内存环形缓冲区（最多保留 50 条日志）
- 渲染回调模式：日志变更自动推送 UI 更新
- HTML 日志渲染（带时间戳、类型颜色标记）
- 同时输出到浏览器 console

---

## 3. 行为逻辑

### 3.1 主事件循环

```
┌─────────────────────────────────────────────────────────────────┐
│                        主事件循环                               │
└─────────────────────────────────────────────────────────────────┘

AI 回复完成
    │
    ▼
CHARACTER_MESSAGE_RENDERED 事件触发
    │
    ├── 检查 isReady && enabled           ← 防御式检查
    ├── 跳过用户消息
    ├── 检查并发锁（detectionInProgress）
    │
    ▼
获取消息内容（getMessageTextById → getLastAiMessageText）
    │
    ▼
调用 detectNSFW(content)
    │
    ├── true  (NSFW)  ──→ state.onNsfwDetected() → PENDING_SWITCH
    │                     saveSettingsSnapshot()
    │
    ├── false (正常)   ──→ state.onCleanDetected()
    │                     ├── SWITCHED → PENDING_RESTORE
    │                     └── IDLE     → 无操作
    │
    └── null  (失败)   ──→ state.onDetectionFailed()
                          ├── SWITCHED → PENDING_RESTORE
                          └── IDLE     → 无操作

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

### 3.2 模型切换逻辑（switchToModel）

```
switchToModel(targetModel, targetSource, targetApiUrl, targetApiKey)
    │
    ├── 参数校验（targetModel 必填）
    │
    ├── saveSettingsSnapshot()
    │   └── 如果快照已存在则跳过（幂等）
    │
    ├── 确定目标来源：优先 targetSource，否则读取设置面板
    │
    ├── 查找 SOURCE_TO_FIELD 映射获取模型字段名
    │
    ├── 切换 chat_completion_source → targetSource
    │
    ├── 写入模型名：oai_settings[模型字段] = targetModel
    │
    ├── 写入 API URL（如果有）：通过 SOURCE_TO_API_URL_FIELD 映射
    │
    ├── 写入 API Key（如果有）：{source}_api_key
    │
    ├── restorePresets() — 应用原模型预设
    │
    └── saveSettingsDebounced() — 持久化 + toastr 通知
```

### 3.3 模型恢复逻辑（restoreOriginalModel）

```
restoreOriginalModel()
    │
    ├── 检查快照是否存在
    │
    ├── 从快照读取原始 source 和 field
    │
    ├── 恢复 chat_completion_source → 原始 source
    │
    ├── 恢复模型名：oai_settings[原始field] = 快照值
    │
    ├── 恢复 API URL（通过 SOURCE_TO_API_URL_FIELD 映射）
    │
    ├── 恢复 API Key（{source}_api_key 字段）
    │
    ├── 恢复 streaming 设置
    │
    ├── restorePresets() — 恢复原始预设
    │
    ├── 清除快照引用（settingsSnapshot = null）
    │
    └── saveSettingsDebounced() — 持久化 + toastr 通知
```

### 3.4 快照结构

```javascript
{
    chat_completion_source: 'custom',           // 原始 API 来源
    model_fields: {
        openai_model: 'gpt-4',
        claude_model: 'claude-sonnet-4-5',
        deepseek_model: 'deepseek-chat',
        custom_model: 'doubao-pro',
        // ...所有来源的模型名
    },
    api_url: 'https://api.example.com/v1',     // 原始来源的 API URL
    streaming: true,                            // 流式开关
    presets: {                                  // power_user 预设
        instruct: { enabled: true, preset: 'Alpaca', ... },
        context: { preset: 'Default', ... },
        sysprompt: { enabled: true, name: 'Neutral - Chat', ... },
        reasoning: { name: 'Blank', ... },
    },
}
```

快照为**单例模式**：首次检测到 NSFW 时创建（在 `CHARACTER_MESSAGE_RENDERED` 阶段），后续切换/恢复/手动操作均复用，直到恢复后清除。

### 3.5 状态机状态流转图

```
                 检测到 NSFW (空闲时)
    ┌───────────────────────────────────────────────────┐
    │                                                   │
    ▼                                                   │
┌──────────┐    onNsfwDetected()    ┌──────────────────┐│
│   IDLE   │ ──────────────────────→│ PENDING_SWITCH   ││
│ (初始)   │                        │ (待切换)         ││
└──────────┘                        └────────┬─────────┘│
      ▲                                      │          │
      │                           GENERATION_STARTED    │
      │                                      │          │
      │                              onGenerationStarted│
      │                                      │          │
      │                                      ▼          │
      │                              ┌──────────────────┘
      │                              ▼
      │                        ┌──────────────┐
      │  onCleanDetected()     │   SWITCHED   │
      ├────────────────────────│  (已切换)     │
      │  (SWITCHED 时)         └──────┬───────┘
      │                               │
      │  onDetectionFailed()          │  onCleanDetected()
      │  (SWITCHED 时)                │  (SWITCHED 时)
      │                               │
      │                               ▼
      │                        ┌──────────────────┐
      │                        │ PENDING_RESTORE  │
      │                        │ (待恢复)          │
      │                        └────────┬─────────┘
      │                                 │
      │                      GENERATION_STARTED
      │                                 │
      │                         onGenerationStarted
      └─────────────────────────────────┘
            (恢复到 IDLE)

手动恢复按钮：任何状态 → onManualRestore() → IDLE
```

### 3.6 初始化流程

```
jQuery(async () => {
    1. 初始化扩展设置（合并默认值）
    2. setupLogRendering() — 绑定日志渲染回调
    3. initSettingsPanel() — 注入设置面板 HTML
    4. bindSettingsListeners() — 绑定 UI 交互事件
    5. registerEventListeners() — 注册 SillyTavern 事件
    6. isReady = true → 开始监听事件
})
```

### 3.7 NSFW 检测 API 调用流程

```
detectNSFW(content)
    │
    ├── 读取设置（nsfwApiUrl、nsfwApiKey、nsfwModelName、debugMode）
    │
    ├── 校验：nsfwApiUrl 必填
    │
    ├── 构造 prompt：
    │   "判断以下内容是否为 NSFW（成人/色情内容）。
    │    请只回复数字 1（是）或 0（否），不要输出任何其他内容：\n\n" + content
    │
    ├── 30s 超时（AbortController）
    │
    ├── normalizeApiUrl() — 自动补全 /chat/completions
    │
    ├── POST request (temperature=0.0, max_tokens=5)
    │
    ├── 解析 response.json().choices[0].message.content
    │
    ├── 结果映射：
    │   1 / true / 是 / yes → true (NSFW)
    │   0 / false / 否 / no → false (正常)
    │   其他 → null (检测失败)
    │
    └── 异常处理：timeout → '检测请求超时', fetch error → 详细错误信息
```

---

## 4. 组件交互

### 4.1 依赖关系图

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
│  │  script.js (eventSource, event_types,                  │   │
│  │            saveSettingsDebounced)                      │   │
│  │  extensions.js (extension_settings, getContext)        │   │
│  │  openai.js (oai_settings)                              │   │
│  │  power-user.js (power_user)                            │   │
│  └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘

                ┌─────────────┐
                │   logger    │ ← index.js 和所有 src/* 依赖
                └─────────────┘
```

### 4.2 通信方式

| 交互 | 方式 | 数据流向 |
|---|---|---|
| index.js → detector | 函数调用 | `detectNSFW(content)` → `boolean|null` |
| index.js → model-switcher | 函数调用 | `switchToModel()/restoreOriginalModel()` → `boolean` |
| index.js → state | 方法调用 | `state.onNsfwDetected()/onGenerationStarted()` → action name |
| index.js → settings | 导入 + DOM | `loadSettings()` → 对象；DOM 变更 → 持久化 |
| 所有组件 → logger | 函数调用 | `addLog(msg, type)` → 渲染回调更新 UI |
| SillyTavern → index.js | EventEmitter | `CHARACTER_MESSAGE_RENDERED` / `GENERATION_STARTED` |
| model-switcher → oai_settings | 直接写入 | `oai_settings[field] = value` |
| model-switcher → power_user | 直接写入 | `Object.assign(power_user.instruct, ...)` |

### 4.3 数据传递

```
CHARACTER_MESSAGE_RENDERED
  └─ messageId(int), type(string)
     └─ detector.getMessageTextById(messageId) → string
        └─ detector.detectNSFW(content) → boolean | null
           └─ state.onNsfwDetected() / onCleanDetected()
              └─ model-switcher.saveSettingsSnapshot()

GENERATION_STARTED
  └─ type(string), params(object), dryRun(boolean)
     └─ state.onGenerationStarted() → 'switch' | 'restore' | 'none'
        └─ model-switcher.switchToModel(...)
        └─ model-switcher.restoreOriginalModel()
```

---

## 5. 接口定义

### 5.1 入口控制器（index.js）

| 导出 | 类型 | 说明 |
|---|---|---|
| 无 | — | 自执行模块，不对外导出任何接口 |

内部函数：

| 函数签名 | 说明 |
|---|---|
| `createSettingsHtml()` → `string` | 生成设置面板 HTML 模板 |
| `initSettingsPanel()` → `jQuery \| null` | 注入面板到 `#extensions_settings` |
| `bindSettingsListeners($panel)` | 绑定 DOM 事件 |
| `onMessageRendered(messageId, type)` | CHARACTER_MESSAGE_RENDERED 回调 |
| `onGenerationStarted(type, params, dryRun)` | GENERATION_STARTED 回调 |
| `onMessageSent(messageId)` | 调试用日志记录 |
| `onSettingsLoaded()` | EXTENSION_SETTINGS_LOADED 回调 |
| `registerEventListeners()` | 注册所有事件 |
| `setupLogRendering()` | 绑定日志渲染回调 |

### 5.2 模型切换器（src/model-switcher.js）

| 导出函数 | 参数 | 返回值 | 说明 |
|---|---|---|---|
| `switchToModel(targetModel, targetSource, targetApiUrl, targetApiKey)` | targetModel: string, targetSource?: string, targetApiUrl?: string, targetApiKey?: string | `Promise<boolean>` | 切换到目标模型。先保存快照，然后切换 source、模型名、URL 和密钥。 |
| `restoreOriginalModel()` | 无 | `Promise<boolean>` | 从快照恢复原始模型。还原 source、模型名、URL、密钥和预设。 |
| `saveSettingsSnapshot()` | 无 | `boolean` | 手动保存当前 oai_settings 的快照。幂等操作。 |
| `clearSettingsSnapshot()` | 无 | `void` | 清除快照引用。 |
| `hasSettingsSnapshot()` | 无 | `boolean` | 检查是否存在有效快照。 |
| `getCurrentModelInfo()` | 无 | `{model, source} \| null` | 获取当前 chat_completion_source 下的模型信息。 |
| `getSupportedSources()` | 无 | `string[]` | 获取所有支持的 API 来源列表。 |

**使用示例**:

```javascript
// 检测到 NSFW 后保存快照
saveSettingsSnapshot();

// 切换到 DeepSeek V4 Flash
await switchToModel(
    'deepseek-v4-flash',
    'deepseek',
    '',          // 使用 deepseek 默认 API URL
    ''           // 使用 deepseek 已有的 API Key
);

// 恢复原模型
await restoreOriginalModel();
```

### 5.3 NSFW 检测器（src/detector.js）

| 导出函数 | 参数 | 返回值 | 说明 |
|---|---|---|---|
| `detectNSFW(content)` | content: string | `Promise<boolean \| null>` | 调用检测 API。true=NSFW, false=正常, null=检测失败 |
| `getLastAiMessageText()` | 无 | `string \| null` | 从 context.chat 中倒序查找最后一条非用户消息 |
| `getMessageTextById(messageId)` | messageId: number | `string \| null` | 通过 messageId 获取消息正文（自动 extractContent） |
| `testNsfwApi()` | 无 | `Promise<boolean \| null>` | 用测试内容检测 API 连通性，结果显示 toastr 通知 |

**检测结果映射表**:

| API 返回值 | 解析结果 | 含义 |
|---|---|---|
| `'1'` / `'true'` / `'是'` / `'yes'` | `true` | NSFW 内容 |
| `'0'` / `'false'` / `'否'` / `'no'` | `false` | 正常内容 |
| `''` / 其他 / 异常 | `null` | 检测失败 |

### 5.4 状态机（src/state.js）

| 导出 | 类型 | 说明 |
|---|---|---|
| `State` | `Object.freeze({IDLE, PENDING_SWITCH, SWITCHED, PENDING_RESTORE})` | 状态常量枚举 |
| `ModelStateMachine` | class | 状态机类 |
| `createStateMachine()` | `() → ModelStateMachine` | 工厂函数 |

**ModelStateMachine 接口**:

| 方法/属性 | 返回值 | 说明 |
|---|---|---|
| `state` (getter) | `string` | 当前状态值 |
| `isSwitchedOrPending` (getter) | `boolean` | 是否已切换或待恢复 |
| `isUsingSwitchedModel` (getter) | `boolean` | 是否正在使用 NSFW 模型 |
| `hasPendingAction` (getter) | `boolean` | 是否有待处理动作 |
| `shouldSwitch` (getter) | `boolean` | 是否需要切换 |
| `shouldRestore` (getter) | `boolean` | 是否需要恢复 |
| `hasOriginalSnapshot` (getter) | `boolean` | 快照是否已保存 |
| `markOriginalSaved()` | `void` | 标记快照已保存 |
| `onNsfwDetected()` | `boolean` | IDLE → PENDING_SWITCH |
| `onCleanDetected()` | `boolean` | SWITCHED/PENDING_RESTORE → PENDING_RESTORE |
| `onDetectionFailed()` | `boolean` | SWITCHED → PENDING_RESTORE |
| `onGenerationStarted()` | `'switch' \| 'restore' \| 'none'` | 返回需要执行的动作 |
| `onManualRestore()` | `void` | 任何状态 → IDLE |
| `reset()` | `void` | 强制重置到 IDLE |
| `getStateDescription()` | `string` | 中文状态描述 |

### 5.5 设置管理器（src/settings.js）

| 导出 | 类型/参数 | 返回值 | 说明 |
|---|---|---|---|
| `EXTENSION_NAME` | `'nsfw-model-switcher'` | — | 扩展名称常量 |
| `DEFAULT_SETTINGS` | `{enabled, nsfwApiUrl, nsfwApiKey, nsfwModelName, modelA, modelAApiUrl, modelAApiKey, modelASource, showNotification, debugMode}` | — | 默认设置值 |
| `loadSettings()` | 无 | `object` | 加载设置，合并默认值 |
| `saveSettings()` | 无 | `void` | 触发防抖保存 |
| `collectAndSaveFromDom($formContainer)` | $formContainer: jQuery | `void` | 从 DOM 收集并保存 |
| `applySettingsToDom(settings, $formContainer)` | settings: object, $formContainer: jQuery | `void` | 设置 → DOM |
| `updateStatusIndicator(settings, $container)` | settings: object, $container: jQuery | `void` | 更新状态灯（绿/黄/红） |

**默认设置结构**:

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

### 5.6 日志模块（src/logger.js）

| 导出函数 | 参数 | 返回值 | 说明 |
|---|---|---|---|
| `setRenderCallback(callback)` | callback: `(logs) => void` | `void` | 注册日志更新回调 |
| `addLog(message, type)` | message: string, type: `'info'\|'success'\|'warning'\|'error'` | `void` | 添加日志（自动时间戳 + console 输出） |
| `clearLogs()` | 无 | `void` | 清空全部日志 |
| `getLogs()` | 无 | `Array<{timestamp, message, type}>` | 获取日志副本 |
| `renderLogsHtml(logsArray)` | logsArray: Array | `string` | 生成日志 HTML |

---

## 6. 异常处理

### 6.1 错误分类与处理策略

| 错误场景 | 检测阶段 | 处理方式 | 用户可见反馈 |
|---|---|---|---|
| 插件无法加载 | 初始化 | 无（SillyTavern 内部处理） | 扩展面板不显示 |
| 设置面板元素未找到 | 初始化 | `addLog('error')`，返回 null | 日志：元素未找到 |
| oai_settings 不可用 | 快照/切换/恢复 | `addLog('error')`，中止操作 | 日志：oai_settings 不可用 |
| 未配置检测 API | 检测 | `addLog('warning')`，返回 null | 日志：未配置 |
| 检测 API 请求失败 | 检测 | `throw Error('API 请求失败: ' + status)` | 日志：HTTP 错误码 |
| 检测请求超时 | 检测 | AbortController 30s | 日志：检测请求超时 |
| API 返回空内容 | 检测 | `addLog('warning')`，返回 null | 日志：无法解析检测结果 |
| 未指定切换模型 | 切换 | `addLog('warning')`，返回 false | 日志：未指定切换模型 |
| 不支持的来源 | 切换 | `addLog('error')`，返回 false | 日志：不支持的来源 |
| 快照创建失败 | 快照 | `console.error`，返回 null | 日志：创建快照失败 |
| 无可恢复快照 | 恢复 | `addLog('info')`，返回 false | 日志：无可恢复的快照 |
| 切换/恢复异常 | 切换/恢复 | try-catch 捕获 | 日志：切换/恢复失败 + 错误信息 |
| restorePresets 异常 | 切换/恢复 | try-catch 捕获 | 日志：恢复预设失败 |

### 6.2 边界条件

| 边界情况 | 处理方式 |
|---|---|
| 快速连续多次检测 | `detectionInProgress` 锁，跳过后续 |
| 插件未就绪时触发事件 | `isReady` 守卫，直接 return |
| 用户消息触发检测 | `type === 'user'` 守卫 |
| 快照已存在时重复保存 | `if (settingsSnapshot) return true` 幂等 |
| 手动恢复时无快照 | 返回 false，不清除状态 |
| dryRun 生成 | `if (dryRun) return` 跳过 |
| API URL 末尾缺少 `/chat/completions` | `normalizeApiUrl()` 自动补全 |
| 设置键不存在 | `DEFAULT_SETTINGS` 合并保证兼容性 |
| 日志超过 50 条 | 环形缓冲区，保留最新 50 条 |

### 6.3 故障恢复

- **插件无状态丢失**: 所有用户配置持久化在 `extension_settings` 中，重启后恢复
- **快照丢失**: 快照为内存对象，重启后丢失。手动恢复按钮会提示"无可恢复的快照"
- **模型切换失败**: `switchToModel()` 返回 false，不影响当前对话
- **检测 API 超时**: 30s 超时熔断，返回 null，不阻断流程

---

## 7. 性能考量

### 7.1 异步与并发控制

- **NSFW 检测异步执行**: `detectNSFW()` 是 async 函数，不阻塞 UI
- **并发检测锁**: `detectionInProgress` 标志位，防止连续快速回复导致多重检测
- **防抖保存**: 使用 SillyTavern 的 `saveSettingsDebounced()`（默认 500ms 防抖），避免频繁写入
- **AbortController**: 30s 超时自动取消 fetch，避免请求堆积

### 7.2 资源占用

| 资源 | 占用 | 说明 |
|---|---|---|
| 内存 | ~KB 级 | 日志缓冲区最多 50 条，快照一个对象 |
| 网络 | 检测每次 ~3-10s | 取决于检测模型响应速度 |
| DOM | 设置面板 ~1KB HTML | 静态注入，不频繁重排 |
| CPU | 几乎不计 | 检测通过网络完成，本地无计算 |

### 7.3 优化措施

- **单例快照**: 只创建一次快照，避免重复深度克隆 `oai_settings`
- **惰性加载**: 设置面板在 `jQuery(async ...)` 中延迟注入，不阻塞页面首屏
- **短路返回**: `!isReady`、`!settings.enabled`、`detectionInProgress` 多层守卫减少无效调用
- **日志截断**: 环形缓冲区限制 50 条，防止内存泄漏
- **最小 API 调用**: `temperature=0.0` 确保确定性输出，`max_tokens=5` 减少 token 消耗
- **快照结构化克隆**: 使用 `structuredClone` 深拷贝预设，避免引用污染

### 7.4 网络请求优化

- **检测 API 超时**: 30s 超时，避免长时间等待
- **最小请求体**: 只传递必要字段（model、messages、temperature、max_tokens）
- **API 地址预标准化**: `normalizeApiUrl()` 统一格式，避免无效请求

---

## 附录

### A. SillyTavern 事件参考

| 事件类型 | 触发时机 | 参数 |
|---|---|---|
| `CHARACTER_MESSAGE_RENDERED` | AI 消息渲染完成后 | `(messageId, type)` |
| `GENERATION_STARTED` | 用户发送消息开始生成时 | `(type, params, dryRun)` |
| `MESSAGE_SENT` | 用户消息发送后 | `(messageId)` |
| `EXTENSION_SETTINGS_LOADED` | 扩展设置加载完成后 | 无 |

### B. 字段名映射表

| chat_completion_source | 模型字段 | API URL 字段 |
|---|---|---|
| `openai` | `openai_model` | 无（服务端默认） |
| `claude` | `claude_model` | 无（服务端默认） |
| `openrouter` | `openrouter_model` | 无（服务端默认） |
| `custom` | `custom_model` | `custom_url` |
| `deepseek` | `deepseek_model` | 无（服务端默认） |
| `siliconflow` | `siliconflow_model` | 无（服务端默认） |
| ... | `{source}_model` | 无（服务端默认） |

### C. 版本历史

| 版本 | 日期 | 变更内容 |
|---|---|---|
| 0.1.0 | — | 初始版本：基本 NSFW 检测与模型切换 |
| 0.1.1 | — | 修复 oai_settings 导入来源为 openai.js |
| 0.1.2 | — | 新增预设保存/恢复、API URL 字段映射修复 |

### D. 待开发功能（B 方案）

详见 [TODO.md](./TODO.md) — 插件独立调用 API，完全脱离 oai_settings 依赖。