/**
 * SillyTavern 全局 API 类型定义
 *
 * 本插件实际使用的 ST 模块和符号子集。
 * 参考来源：
 *   - SillyTavern/public/script.js
 *   - SillyTavern/public/scripts/openai.js
 *   - SillyTavern/public/scripts/power-user.js
 *   - SillyTavern/public/scripts/extensions.js
 *
 * 路径约定：插件位于 public/scripts/extensions/third-party/<name>/
 * 因此到 ST 根模块的相对路径为：
 *   - '../../../../script.js'                   → 4 层上
 *   - '../../../../scripts/openai.js'           → 4 层上 + scripts/
 *   - '../../../../scripts/power-user.js'       → 4 层上 + scripts/
 *   - '../../../extensions.js'                  → 3 层上
 *   - '../../../../extensions.js'               → 4 层上（部分子模块从 src/ 引用）
 */

// =============================================================================
//  Module: ../../../../script.js
// =============================================================================
declare module '*/script.js' {
    /** ST 事件总线 */
    export const eventSource: EventSource;

    /** ST 事件类型枚举 */
    export const event_types: EventTypes;

    /** 触发 ST 保存设置（防抖） */
    export function saveSettingsDebounced(): void;
}

// =============================================================================
//  Module: ../../../../scripts/openai.js
// =============================================================================
declare module '*/openai.js' {
    /**
     * OpenAI 兼容 API 的运行时设置对象（structuredClone 自 default_settings）
     * 含 chat_completion_source / openai_model / claude_model / 等
     */
    export const oai_settings: OaiSettings;
}

// =============================================================================
//  Module: ../../../../scripts/power-user.js
// =============================================================================
declare module '*/power-user.js' {
    /**
     * Power User 设置对象，含 instruct/context/sysprompt/reasoning 子对象
     * 以及 temperature/top_p 等生成参数顶层字段
     */
    export const power_user: PowerUserSettings;
}

// =============================================================================
//  Module: ../../../extensions.js  /  ../../../../extensions.js
// =============================================================================
declare module '*/extensions.js' {
    /** 所有扩展的设置字典，key = 扩展名 */
    export const extension_settings: Record<string, unknown> & {
        [extensionName: string]: unknown;
    };

    /** 获取 ST 运行时上下文（chat、isMobile 等） */
    export function getContext(): SillyTavernContext;
}

// =============================================================================
//  Type definitions (used by module declarations above)
// =============================================================================

/** ST 事件总线接口 */
interface EventSource {
    on(event: string, callback: (...args: any[]) => void | Promise<void>): void;
    off(event: string, callback: (...args: any[]) => void | Promise<void>): void;
    emit(event: string, ...args: any[]): Promise<void>;
}

/**
 * ST 事件类型枚举（本插件使用的子集 + 常见事件）
 * 完整列表见 SillyTavern/public/script.js event_types 定义
 */
interface EventTypes {
    /** AI 消息渲染完毕 (messageId: number, type: 'character'|'user') */
    readonly CHARACTER_MESSAGE_RENDERED: string;
    /** 用户消息渲染完毕 */
    readonly USER_MESSAGE_RENDERED: string;
    /** 生成开始 (type: string, params: object, dryRun: boolean) */
    readonly GENERATION_STARTED: string;
    /** 生成结束 */
    readonly GENERATION_ENDED: string;
    /** 用户发送消息 (messageId: number) */
    readonly MESSAGE_SENT: string;
    /** 扩展设置加载完毕 */
    readonly EXTENSION_SETTINGS_LOADED: string;
    /** 应用启动完毕 */
    readonly APP_READY: string;
    /** 通用键索引（其他未列出的事件） */
    readonly [key: string]: string;
}

/**
 * OpenAI 兼容设置对象（本插件用到的字段）
 * 完整字段见 SillyTavern/public/scripts/openai.js default_settings
 */
interface OaiSettings {
    /** 当前选中的 API 来源（openai/claude/openrouter/custom/...） */
    chat_completion_source: string;
    /** 流式输出开关 */
    streaming?: boolean;

    // ---- 各来源对应的模型字段 ----
    openai_model?: string;
    claude_model?: string;
    openrouter_model?: string;
    custom_model?: string;
    ai21_model?: string;
    google_model?: string;
    vertexai_model?: string;
    mistralai_model?: string;
    cohere_model?: string;
    perplexity_model?: string;
    groq_model?: string;
    electronhub_model?: string;
    chutes_model?: string;
    nanogpt_model?: string;
    deepseek_model?: string;
    aimlapi_model?: string;
    xai_model?: string;
    pollinations_model?: string;
    cometapi_model?: string;
    moonshot_model?: string;
    fireworks_model?: string;
    azure_openai_model?: string;
    zai_model?: string;
    siliconflow_model?: string;

    // ---- 自定义 URL ----
    custom_url?: string;

    // ---- API Key 字段（动态拼接 `${source}_api_key`） ----
    [key: `${string}_api_key`]: string | undefined;

    // ---- 容许其他未声明字段（保持 forwards 兼容） ----
    [key: string]: unknown;
}

/**
 * Power User 设置对象（本插件用到的字段 + 子对象）
 */
interface PowerUserSettings {
    /** Instruct 模板配置（本插件用 Proxy 包装） */
    instruct: InstructSettings;
    /** Context 模板配置（本插件用 Proxy 包装） */
    context: ContextSettings;
    /** System Prompt 配置（本插件用 Proxy 包装） */
    sysprompt: SyspromptSettings;
    /** Reasoning 格式配置（本插件用 Proxy 包装） */
    reasoning: ReasoningSettings;

    // ---- 顶层生成参数（本插件直接写入并快照恢复） ----
    temperature?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    top_p?: number;
    top_k?: number;
    top_a?: number;
    min_p?: number;
    repetition_penalty?: number;
    openai_max_context?: number;
    openai_max_tokens?: number;
    stream_openai?: boolean;

    // ---- Context 全局字段（直接写入 power_user 顶层） ----
    always_force_name2?: boolean;
    trim_sentences?: boolean;
    single_line?: boolean;

    // ---- 容许其他未声明字段 ----
    [key: string]: unknown;
}

/** Instruct 模板的字段（本插件使用的子集） */
interface InstructSettings {
    preset?: string;
    input_sequence?: string;
    output_sequence?: string;
    system_sequence?: string;
    stop_sequence?: string;
    wrap?: boolean;
    names_behavior?: string | number;
    activation_regex?: string;
    output_suffix?: string;
    input_suffix?: string;
    system_suffix?: string;
    first_output_sequence?: string;
    last_output_sequence?: string;
    system_same_as_user?: boolean;
    sequences_as_stop_strings?: boolean;
    skip_examples?: boolean;
    macro?: boolean;
    user_alignment_message?: string;
    last_system_sequence?: string;
    first_input_sequence?: string;
    last_input_sequence?: string;
    story_string_prefix?: string;
    story_string_suffix?: string;
    [key: string]: unknown;
}

/** Context 模板的字段（本插件使用的子集） */
interface ContextSettings {
    preset?: string;
    story_string?: string;
    chat_start?: string;
    example_separator?: string;
    use_stop_strings?: boolean;
    names_as_stop_strings?: boolean;
    story_string_position?: number;
    story_string_depth?: number;
    story_string_role?: string;
    [key: string]: unknown;
}

/** System Prompt 的字段（本插件使用的子集） */
interface SyspromptSettings {
    name?: string;
    content?: string;
    post_history?: string;
    [key: string]: unknown;
}

/** Reasoning 格式的字段（本插件使用的子集） */
interface ReasoningSettings {
    prefix?: string;
    suffix?: string;
    separator?: string;
    [key: string]: unknown;
}

/**
 * ST 运行时上下文（getContext() 返回）
 * 完整字段见 SillyTavern/public/scripts/st-context.js
 */
interface SillyTavernContext {
    /** 当前聊天记录 */
    chat: ChatMessage[];
    /** 当前角色 ID */
    characterId?: string | number;
    /** 是否移动端 UI */
    isMobile?: boolean;
    /** 容许访问其他未声明字段 */
    [key: string]: unknown;
}

/** 单条聊天消息 */
interface ChatMessage {
    /** 是否用户消息 */
    is_user: boolean;
    /** 是否系统消息 */
    is_system?: boolean;
    /** 消息文本（可能含 <content>...</content> 包装） */
    mes: string;
    /** 发送者名 */
    name?: string;
    /** 发送时间戳 */
    send_date?: string;
    [key: string]: unknown;
}

// =============================================================================
//  Browser globals: toastr, $, jQuery, structuredClone
// =============================================================================

/** toastr 通知库（ST 全局加载） */
declare const toastr: ToastrStatic;

interface ToastrStatic {
    info(message: string, title?: string, options?: ToastrOptions): JQuery | undefined;
    success(message: string, title?: string, options?: ToastrOptions): JQuery | undefined;
    warning(message: string, title?: string, options?: ToastrOptions): JQuery | undefined;
    error(message: string, title?: string, options?: ToastrOptions): JQuery | undefined;
    clear(toast?: JQuery): void;
    remove(): void;
    options: ToastrOptions;
}

interface ToastrOptions {
    timeOut?: number;
    extendedTimeOut?: number;
    closeButton?: boolean;
    closeHtml?: string;
    progressBar?: boolean;
    preventDuplicates?: boolean;
    showDuration?: number;
    hideDuration?: number;
    positionClass?: string;
    onclick?: (() => void) | null;
    [key: string]: unknown;
}

/** 本插件提供的浏览器控制台诊断入口 */
interface Window {
    __nsfwDebug?: () => void;
}
