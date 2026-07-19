// SPDX-License-Identifier: AGPL-3.0-only

/**
 * NSFW 模型切换器 - 预设覆盖模块
 *
 * 机制：激活窗口内"换引用"（overlay swap）
 * - NSFW 激活时，把 power_user 的 instruct/context/sysprompt/reasoning
 *   临时替换为「原对象浅拷贝 + 覆盖值」合并出的普通对象（overlay）
 * - fetch 拦截捕获请求后 / 生成结束时，把原对象引用原样放回
 * - 原始对象本身自始至终未被修改
 *
 * ⚠️ 历史教训（v1.2.0 事故）：早期实现在扩展加载时就把这四个子对象
 * 常驻替换为 ES6 Proxy。但 ST 1.18.0+ 的 renderStoryString() /
 * formatInstructModeChat() / preset-manager 保存流程会对这些对象执行
 * structuredClone()，而 Proxy 是 exotic object，按 HTML 规范必抛
 * DataCloneError → ST 弹出 "Error rendering story string" 并中断生成。
 * 因此这里绝不能用 Proxy 包装 power_user 的子对象——overlay 必须是
 * 普通对象，structuredClone 才能正常工作。
 */

import { power_user } from '../../../../../scripts/power-user.js';
import { addLog, addDebugLog } from './logger.js';
import { loadSettings } from './settings.js';

// ===== 类型定义 =====

/** 被代理的子对象类别 */
export type ProxyCategory = 'instruct' | 'context' | 'sysprompt' | 'reasoning';

/** 通用可索引对象（power_user 子对象的实际形状） */
type IndexableObject = Record<string, unknown>;

/** 覆盖值字典 (按类别分组) */
interface OverrideMap {
    instruct: IndexableObject;
    context: IndexableObject;
    sysprompt: IndexableObject;
    reasoning: IndexableObject;
}

/** 模块开关字典（来自 settings 的 PresetModuleEnabledMap） */
type ModuleSwitches = Record<string, boolean>;

/** 预设原始数据（字段动态） */
type PresetSource = Record<string, unknown>;

/** 被换下的原对象引用（按类别） */
type OriginalRefs = Partial<Record<ProxyCategory, IndexableObject>>;

/** 内部覆盖状态 */
interface ProxyState {
    active: boolean;
    overrides: OverrideMap;
    /** 激活期间被换下的 power_user 子对象原始引用 */
    originals: OriginalRefs | null;
    /** genParams 快照（用于恢复） */
    originalGenParams: IndexableObject | null;
    /** 安全超时定时器 */
    safetyTimer: ReturnType<typeof setTimeout> | null;
}

// ===== 代理状态 =====

const proxyState: ProxyState = {
    active: false,
    overrides: {
        instruct: {},
        context: {},
        sysprompt: {},
        reasoning: {},
    },
    originals: null,
    originalGenParams: null,
    safetyTimer: null,
};

/** 需要 overlay 的四个类别 */
const OVERRIDE_CATEGORIES: ProxyCategory[] = ['instruct', 'context', 'sysprompt', 'reasoning'];

// genParams 键名列表
const GEN_PARAM_KEYS: string[] = [
    'temperature', 'frequency_penalty', 'presence_penalty',
    'top_p', 'top_k', 'top_a', 'min_p', 'repetition_penalty',
    'openai_max_context', 'openai_max_tokens',
];

// context 全局字段（属于 power_user 顶层，不属于 power_user.context）
const CONTEXT_GLOBAL_KEYS: string[] = ['always_force_name2', 'trim_sentences', 'single_line'];

// overlay 对象标记 + 原对象引用携带键
//
// 使用 Symbol.for('...') 注册全局 Symbol — 跨模块/跨浏览器热重载返回同一引用。
// Symbol 键有两大关键好处：
//
//   1. JSON.stringify() 自动跳过 Symbol 键
//      → 即使 overlay 在激活窗口内被 ST 序列化保存, 原对象引用也不会泄漏。
//   2. structuredClone() 不复制 Symbol 键
//      → ST 的 renderStoryString() 等对 overlay 做 structuredClone 时,
//        克隆结果不带 marker, 完全等同普通预设对象。
//
// (历史: v1.2.0 曾把这四个子对象常驻替换为 ES6 Proxy, 导致 ST 1.18.0+
//  structuredClone 抛 DataCloneError, 用户每次生成都报
//  "Error rendering story string"。)
const NSFW_ORIGINAL_REF: unique symbol = Symbol.for('nsfw-auto-model-switcher.original-ref');

// 安全超时时间（默认 30000 毫秒，可通过 settings.safetyTimeoutMs 配置）
const DEFAULT_SAFETY_TIMEOUT_MS = 30000;

function getSafetyTimeoutMs(): number {
    try {
        const s = loadSettings();
        return s.safetyTimeoutMs || DEFAULT_SAFETY_TIMEOUT_MS;
    } catch (_e) {
        return DEFAULT_SAFETY_TIMEOUT_MS;
    }
}

/**
 * Safety timeout 触发时的外部回调 (Phase 4 Batch B Step 4)
 *
 * 当 30s 内 Proxy 未被正常停用时, safetyTimer 触发会:
 * 1. 调用此回调 (若已注册) → 让 SwitcherCoordinator 走 disable('safety_timeout')
 *    路径, 同时关 fetch + 通知 state
 * 2. 然后才调用本地 deactivateOverrides 兜底
 *
 * 调用方 (coordinator) 通过 setOnSafetyTimeout() 注册。
 * 未注册时保持旧行为 (只关 Proxy, 不联动 fetch/state)。
 */
type SafetyTimeoutCallback = () => void;
let onSafetyTimeout: SafetyTimeoutCallback | null = null;

/**
 * 注册 safety timeout 回调 (供 SwitcherCoordinator 注入)
 */
export function setOnSafetyTimeout(callback: SafetyTimeoutCallback | null): void {
    onSafetyTimeout = callback;
}

// ===== Overlay 创建 =====

/**
 * 为 power_user 的子对象创建 overlay（普通对象，非 Proxy）
 *
 * overlay = 原对象浅拷贝 + 覆盖值，并通过不可枚举的 Symbol 键携带原对象引用。
 * 浅拷贝足够：这四个子对象的字段都是标量/字符串；即使有嵌套对象，
 * ST 只在生成流程中读取，不会通过 overlay 写入原对象。
 */
function createOverlay(originalObj: IndexableObject, overrides: IndexableObject): IndexableObject {
    const overlay: IndexableObject = { ...originalObj, ...overrides };
    Object.defineProperty(overlay, NSFW_ORIGINAL_REF, {
        value: originalObj,
        enumerable: false,
        writable: false,
        configurable: true,
    });
    return overlay;
}

/** 帮助类型: 允许在对象上读取 NSFW_ORIGINAL_REF (Symbol) */
type OriginalRefCarrier = { [NSFW_ORIGINAL_REF]?: IndexableObject };

/**
 * 把四个类别的 overlay 换入 power_user（仅替换有覆盖值的类别）
 */
function swapInOverlays(): void {
    // 防重入: 若上一轮 overlay 尚未换出, 先还原, 避免双重包裹丢失原引用
    if (proxyState.originals) {
        swapOutOverlays();
    }
    const pu = power_user as unknown as Record<ProxyCategory, IndexableObject>;
    proxyState.originals = {};
    for (const cat of OVERRIDE_CATEGORIES) {
        const overrides = proxyState.overrides[cat];
        if (!overrides || Object.keys(overrides).length === 0) continue;
        const original = pu[cat];
        if (!original || typeof original !== 'object') continue;
        proxyState.originals[cat] = original;
        pu[cat] = createOverlay(original, overrides);
    }
}

/**
 * 把原对象引用换回 power_user
 *
 * 防御：若窗口期间 ST 自己替换了该子对象（如用户手动切换 instruct 预设），
 * 当前值不再是我们的 overlay，则放弃还原该类别，尊重外部的最新值。
 */
function swapOutOverlays(): void {
    if (!proxyState.originals) return;
    const pu = power_user as unknown as Record<ProxyCategory, IndexableObject>;
    for (const cat of OVERRIDE_CATEGORIES) {
        const original = proxyState.originals[cat];
        if (!original) continue;
        const current = pu[cat] as OriginalRefCarrier;
        if (current && current[NSFW_ORIGINAL_REF] === original) {
            pu[cat] = original;
        } else {
            addLog('覆盖窗口内 ' + cat + ' 被外部替换，保留外部值不还原', 'warning');
        }
    }
    proxyState.originals = null;
}

// ===== 初始化 =====

/** 历史遗留的字符串 marker (v1.1.0 及之前)，需要清理掉避免污染 ST 持久化 */
const LEGACY_STRING_MARKER = '__nsfw_proxy_installed__';

/**
 * 清理旧版本字符串 marker 残留
 *
 * v1.1.0 及之前用字符串 marker, 通过 Proxy.set 穿透写入原始对象。
 * 升级到本版本后, 残留 marker 仍会被 ST 序列化保存。
 * 此函数在 initPresetOverrides 时调用一次, 把残留 marker 从所有相关对象上删除。
 */
function purgeLegacyMarker(): void {
    const targets = [power_user.instruct, power_user.context, power_user.sysprompt, power_user.reasoning];
    let purged = 0;
    for (const t of targets) {
        if (t && typeof t === 'object' && LEGACY_STRING_MARKER in t) {
            delete (t as IndexableObject)[LEGACY_STRING_MARKER];
            purged++;
        }
    }
    if (purged > 0) {
        addLog('已清理 ' + purged + ' 处历史 marker 残留', 'info');
    }
}

/**
 * 初始化预设覆盖模块（扩展加载时调用一次）
 *
 * 不再常驻安装任何东西（v1.2.0 的常驻 Proxy 已废除）。
 * 仅做两件防御性清理：
 * 1. 清理 v1.1.0 字符串 marker 残留
 * 2. 恢复上次异常退出（热重载/崩溃）留下的 overlay 残留
 */
export function initPresetOverrides(): void {
    purgeLegacyMarker();

    // 热重载残留恢复: 若 power_user 子对象仍是上次会话的 overlay, 换回原对象
    const pu = power_user as unknown as Record<ProxyCategory, IndexableObject>;
    let restored = 0;
    for (const cat of OVERRIDE_CATEGORIES) {
        const current = pu[cat] as OriginalRefCarrier | undefined;
        if (current && typeof current === 'object' && current[NSFW_ORIGINAL_REF]) {
            pu[cat] = current[NSFW_ORIGINAL_REF] as IndexableObject;
            restored++;
        }
    }
    if (restored > 0) {
        addLog('已恢复 ' + restored + ' 处 overlay 残留 (上次未正常停用)', 'warning');
    }

    addLog('预设覆盖模块已初始化', 'info', 'debug');
}

// ===== 覆盖激活/停用 =====

/**
 * 从预设数据中提取各模块的覆盖值
 */
function buildOverrides(preset: PresetSource, mods: ModuleSwitches): void {
    // 清空现有覆盖
    proxyState.overrides = {
        instruct: {},
        context: {},
        sysprompt: {},
        reasoning: {},
    };

    if (!preset) return;

    // Instruct 模块
    if (mods.instruct !== false) {
        const instructFields = [
            'input_sequence', 'output_sequence', 'system_sequence', 'stop_sequence',
            'wrap', 'names_behavior', 'activation_regex', 'output_suffix', 'input_suffix',
            'system_suffix', 'first_output_sequence', 'last_output_sequence',
            'system_same_as_user', 'sequences_as_stop_strings', 'skip_examples',
            'macro', 'user_alignment_message', 'last_system_sequence',
            'first_input_sequence', 'last_input_sequence',
            'story_string_prefix', 'story_string_suffix',
        ];
        for (let i = 0; i < instructFields.length; i++) {
            const key = instructFields[i];
            if (preset[key] !== undefined && mods['instruct_' + key] !== false) {
                proxyState.overrides.instruct[key] = preset[key];
            }
        }
        // 特殊处理 names_behavior（数字转字符串）
        if (preset.names_behavior !== undefined && mods['instruct_names_behavior'] !== false) {
            const nb = preset.names_behavior;
            proxyState.overrides.instruct.names_behavior = typeof nb === 'number'
                ? (['none', 'force', 'always'])[nb] || 'force'
                : nb;
        }
        // 特殊处理 wrap_in_quotes
        if (preset.wrap_in_quotes !== undefined && mods['instruct_wrap'] !== false) {
            proxyState.overrides.instruct.wrap = preset.wrap_in_quotes;
        }
    }

    // Context 模块
    if (mods.context !== false) {
        const contextFields = [
            'story_string', 'chat_start', 'example_separator',
            'use_stop_strings', 'names_as_stop_strings',
            'story_string_position', 'story_string_depth', 'story_string_role',
        ];
        for (let i = 0; i < contextFields.length; i++) {
            const key = contextFields[i];
            if (preset[key] !== undefined && mods['context_' + key] !== false) {
                proxyState.overrides.context[key] = preset[key];
            }
        }
    }

    // Sysprompt 模块
    if (mods.sysprompt !== false) {
        const syspromptFields = ['content', 'post_history'];
        for (let i = 0; i < syspromptFields.length; i++) {
            const key = syspromptFields[i];
            if (preset[key] !== undefined && mods['sysprompt_' + key] !== false) {
                proxyState.overrides.sysprompt[key] = preset[key];
            }
        }
    }

    // Reasoning 模块
    if (mods.reasoning !== false) {
        const reasoningFields = ['prefix', 'suffix', 'separator'];
        for (let i = 0; i < reasoningFields.length; i++) {
            const key = reasoningFields[i];
            if (preset[key] !== undefined && mods['reasoning_' + key] !== false) {
                proxyState.overrides.reasoning[key] = preset[key];
            }
        }
    }
}

/**
 * 激活 NSFW 预设覆盖
 */
export function activateOverrides(presetData: PresetSource, mods?: ModuleSwitches): void {
    // 构建覆盖数据（不修改原始对象）
    buildOverrides(presetData, mods || {});

    // 保存 genParams 快照
    proxyState.originalGenParams = {};
    for (let i = 0; i < GEN_PARAM_KEYS.length; i++) {
        const key = GEN_PARAM_KEYS[i];
        if (power_user[key] !== undefined) {
            proxyState.originalGenParams[key] = power_user[key];
        }
    }
    // 保存 context 全局字段快照
    for (let i = 0; i < CONTEXT_GLOBAL_KEYS.length; i++) {
        const key = CONTEXT_GLOBAL_KEYS[i];
        if (power_user[key] !== undefined) {
            proxyState.originalGenParams[key] = power_user[key];
        }
    }

    // 写入 genParams 到 power_user（ST 格式化需要）
    const genParams = extractGenParams(presetData);
    if (genParams) {
        Object.keys(genParams).forEach(function (key) {
            if (key !== 'stream_openai') power_user[key] = genParams[key];
        });
    }

    // 写入 context 全局字段到 power_user
    const modsResolved = mods || {};
    for (let i = 0; i < CONTEXT_GLOBAL_KEYS.length; i++) {
        const key = CONTEXT_GLOBAL_KEYS[i];
        if (presetData[key] !== undefined && modsResolved['context_' + key] !== false) {
            power_user[key] = presetData[key];
        }
    }

    // 换入 overlay（普通对象，structuredClone 安全）并标记激活
    swapInOverlays();
    proxyState.active = true;

    // 启动安全超时看门狗
    startSafetyTimer();

    addDebugLog('预设覆盖已激活');
}

/**
 * 停用 NSFW 预设覆盖
 * 幂等：多次调用安全
 */
export function deactivateOverrides(): void {
    // 如果未激活，直接返回
    if (!proxyState.active && !proxyState.originalGenParams && !proxyState.originals) {
        return;
    }

    // 换回原对象引用
    swapOutOverlays();
    proxyState.active = false;

    // 清空覆盖数据
    proxyState.overrides = {
        instruct: {},
        context: {},
        sysprompt: {},
        reasoning: {},
    };

    // 恢复 genParams
    if (proxyState.originalGenParams) {
        const snapshot = proxyState.originalGenParams;
        Object.keys(snapshot).forEach(function (key) {
            power_user[key] = snapshot[key];
        });
        proxyState.originalGenParams = null;
    }

    // 清除安全超时
    clearSafetyTimer();

    addDebugLog('预设覆盖已停用');
}

/**
 * 检查覆盖是否激活
 */
export function isOverridesActive(): boolean {
    return proxyState.active;
}

// ===== 安全机制 =====

/**
 * 启动安全超时看门狗
 * 如果超过 SAFETY_TIMEOUT_MS 仍未停用，自动停用
 */
function startSafetyTimer(): void {
    clearSafetyTimer();
    proxyState.safetyTimer = setTimeout(function () {
        if (proxyState.active) {
            addLog('安全超时：预设覆盖超过 ' + (getSafetyTimeoutMs() / 1000) + ' 秒未停用，自动恢复', 'warning');
            // Phase 4 Batch B Step 4: 优先通知 coordinator (会同时关 fetch + state)
            // 若未注册回调, 走旧行为 (只关 Proxy)
            if (onSafetyTimeout) {
                try {
                    onSafetyTimeout();
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    addLog('safety timeout 回调抛错: ' + msg, 'error');
                    // 即使回调失败也要兜底关 Proxy
                    deactivateOverrides();
                }
            } else {
                deactivateOverrides();
            }
        }
    }, getSafetyTimeoutMs());
}

/**
 * 清除安全超时定时器
 */
function clearSafetyTimer(): void {
    if (proxyState.safetyTimer) {
        clearTimeout(proxyState.safetyTimer);
        proxyState.safetyTimer = null;
    }
}

// ===== 辅助函数 =====

/**
 * 从预设中提取生成参数
 */
export function extractGenParams(preset: PresetSource): IndexableObject | null {
    if (!preset) return null;
    const params: IndexableObject = {};
    const genKeys = GEN_PARAM_KEYS.concat(['stream_openai']);
    for (let i = 0; i < genKeys.length; i++) {
        const key = genKeys[i];
        if (preset[key] !== undefined) params[key] = preset[key];
    }
    return Object.keys(params).length ? params : null;
}
