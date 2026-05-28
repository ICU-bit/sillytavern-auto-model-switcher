/**
 * NSFW 模型切换器 (SillyTavern Auto Model Switcher)
 * Copyright (C) 2025 ICU-bit
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * NSFW 模型切换器 - 预设代理模块
 * 
 * 使用 JavaScript Proxy 实现"偷天换日"：
 * - 扩展加载时，用 Proxy 包装 power_user 的 instruct/context/sysprompt/reasoning
 * - NSFW 激活时，Proxy 的 get trap 返回覆盖值，原始对象不被修改
 * - NSFW 关闭时，Proxy 返回原始值
 * 
 * 这样 ST 的格式化流程读到的是我们的预设值，但 power_user 本身从未被修改。
 */

import { power_user } from '../../../../../scripts/power-user.js';
import { addLog, addDebugLog } from './logger.js';

// ===== 代理状态 =====

var proxyState = {
    active: false,
    overrides: {
        instruct: {},
        context: {},
        sysprompt: {},
        reasoning: {},
    },
    // genParams 快照（用于恢复）
    originalGenParams: null,
    // 安全超时定时器
    safetyTimer: null,
};

// genParams 键名列表
var GEN_PARAM_KEYS = [
    'temperature', 'frequency_penalty', 'presence_penalty',
    'top_p', 'top_k', 'top_a', 'min_p', 'repetition_penalty',
    'openai_max_context', 'openai_max_tokens',
];

// context 全局字段（属于 power_user 顶层，不属于 power_user.context）
var CONTEXT_GLOBAL_KEYS = ['always_force_name2', 'trim_sentences', 'single_line'];

// 幂等标记，防止重复安装 Proxy
var NSFW_PROXY_MARKER = Symbol('nsfw_proxied');

// 安全超时时间（毫秒）
var SAFETY_TIMEOUT_MS = 30000;

// ===== Proxy 创建 =====

/**
 * 为 power_user 的子对象创建 Proxy
 * @param {object} originalObj - 原始对象
 * @param {string} category - 类别名（'instruct'|'context'|'sysprompt'|'reasoning'）
 * @returns {Proxy} Proxy 包装后的对象
 */
function createSubObjectProxy(originalObj, category) {
    return new Proxy(originalObj, {
        get: function(target, prop, receiver) {
            // 如果 NSFW 激活且该属性有覆盖值，返回覆盖值
            if (proxyState.active && proxyState.overrides[category] && prop in proxyState.overrides[category]) {
                return proxyState.overrides[category][prop];
            }
            return Reflect.get(target, prop, receiver);
        },
        set: function(target, prop, value, receiver) {
            // 写入穿透到原始对象（ST 预设加载仍正常工作）
            return Reflect.set(target, prop, value, receiver);
        },
        has: function(target, prop) {
            // 支持 'prop in obj' 操作符
            if (proxyState.active && proxyState.overrides[category] && prop in proxyState.overrides[category]) {
                return true;
            }
            return Reflect.has(target, prop);
        },
        ownKeys: function(target) {
            return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor: function(target, prop) {
            return Reflect.getOwnPropertyDescriptor(target, prop);
        },
    });
}

// ===== 初始化 =====

/**
 * 安装 Proxy 到 power_user 的四个子对象
 * 应在扩展加载时调用一次
 */
export function initProxies() {
    // 幂等检查：防止重复安装（浏览器热重载）
    if (power_user.instruct[NSFW_PROXY_MARKER]) {
        addDebugLog('Proxy 已安装，跳过重复初始化');
        return;
    }

    power_user.instruct = createSubObjectProxy(power_user.instruct, 'instruct');
    power_user.context = createSubObjectProxy(power_user.context, 'context');
    power_user.sysprompt = createSubObjectProxy(power_user.sysprompt, 'sysprompt');
    power_user.reasoning = createSubObjectProxy(power_user.reasoning, 'reasoning');

    // 标记已安装
    power_user.instruct[NSFW_PROXY_MARKER] = true;

    addLog('预设代理已安装', 'info', 'debug');
}

// ===== 覆盖激活/停用 =====

/**
 * 从预设数据中提取各模块的覆盖值
 * @param {object} preset - 预设数据（扁平结构）
 * @param {object} mods - 模块开关状态
 */
function buildOverrides(preset, mods) {
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
        var instructFields = [
            'input_sequence', 'output_sequence', 'system_sequence', 'stop_sequence',
            'wrap', 'names_behavior', 'activation_regex', 'output_suffix', 'input_suffix',
            'system_suffix', 'first_output_sequence', 'last_output_sequence',
            'system_same_as_user', 'sequences_as_stop_strings', 'skip_examples',
            'macro', 'user_alignment_message', 'last_system_sequence',
            'first_input_sequence', 'last_input_sequence',
            'story_string_prefix', 'story_string_suffix',
        ];
        for (var i = 0; i < instructFields.length; i++) {
            var key = instructFields[i];
            if (preset[key] !== undefined && mods['instruct_' + key] !== false) {
                proxyState.overrides.instruct[key] = preset[key];
            }
        }
        // 特殊处理 names_behavior（数字转字符串）
        if (preset.names_behavior !== undefined && mods['instruct_names_behavior'] !== false) {
            proxyState.overrides.instruct.names_behavior = typeof preset.names_behavior === 'number'
                ? (['none', 'force', 'always'])[preset.names_behavior] || 'force'
                : preset.names_behavior;
        }
        // 特殊处理 wrap_in_quotes
        if (preset.wrap_in_quotes !== undefined && mods['instruct_wrap'] !== false) {
            proxyState.overrides.instruct.wrap = preset.wrap_in_quotes;
        }
    }

    // Context 模块
    if (mods.context !== false) {
        var contextFields = [
            'story_string', 'chat_start', 'example_separator',
            'use_stop_strings', 'names_as_stop_strings',
            'story_string_position', 'story_string_depth', 'story_string_role',
        ];
        for (var i = 0; i < contextFields.length; i++) {
            var key = contextFields[i];
            if (preset[key] !== undefined && mods['context_' + key] !== false) {
                proxyState.overrides.context[key] = preset[key];
            }
        }
    }

    // Sysprompt 模块
    if (mods.sysprompt !== false) {
        var syspromptFields = ['content', 'post_history'];
        for (var i = 0; i < syspromptFields.length; i++) {
            var key = syspromptFields[i];
            if (preset[key] !== undefined && mods['sysprompt_' + key] !== false) {
                proxyState.overrides.sysprompt[key] = preset[key];
            }
        }
    }

    // Reasoning 模块
    if (mods.reasoning !== false) {
        var reasoningFields = ['prefix', 'suffix', 'separator'];
        for (var i = 0; i < reasoningFields.length; i++) {
            var key = reasoningFields[i];
            if (preset[key] !== undefined && mods['reasoning_' + key] !== false) {
                proxyState.overrides.reasoning[key] = preset[key];
            }
        }
    }
}

/**
 * 激活 NSFW 预设覆盖
 * @param {object} presetData - 预设数据
 * @param {object} mods - 模块开关状态
 */
export function activateOverrides(presetData, mods) {
    // 构建覆盖数据（不修改原始对象）
    buildOverrides(presetData, mods || {});

    // 保存 genParams 快照
    proxyState.originalGenParams = {};
    for (var i = 0; i < GEN_PARAM_KEYS.length; i++) {
        var key = GEN_PARAM_KEYS[i];
        if (power_user[key] !== undefined) {
            proxyState.originalGenParams[key] = power_user[key];
        }
    }
    // 保存 context 全局字段快照
    for (var i = 0; i < CONTEXT_GLOBAL_KEYS.length; i++) {
        var key = CONTEXT_GLOBAL_KEYS[i];
        if (power_user[key] !== undefined) {
            proxyState.originalGenParams[key] = power_user[key];
        }
    }

    // 写入 genParams 到 power_user（ST 格式化需要）
    var genParams = extractGenParams(presetData);
    if (genParams) {
        Object.keys(genParams).forEach(function(key) {
            if (key !== 'stream_openai') power_user[key] = genParams[key];
        });
    }

    // 写入 context 全局字段到 power_user
    for (var i = 0; i < CONTEXT_GLOBAL_KEYS.length; i++) {
        var key = CONTEXT_GLOBAL_KEYS[i];
        if (presetData[key] !== undefined && mods['context_' + key] !== false) {
            power_user[key] = presetData[key];
        }
    }

    // 激活 Proxy
    proxyState.active = true;

    // 启动安全超时看门狗
    startSafetyTimer();

    addDebugLog('预设覆盖已激活');
}

/**
 * 停用 NSFW 预设覆盖
 * 幂等：多次调用安全
 */
export function deactivateOverrides() {
    // 如果未激活，直接返回
    if (!proxyState.active && !proxyState.originalGenParams) {
        return;
    }

    // 停用 Proxy
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
        Object.keys(proxyState.originalGenParams).forEach(function(key) {
            power_user[key] = proxyState.originalGenParams[key];
        });
        proxyState.originalGenParams = null;
    }

    // 清除安全超时
    clearSafetyTimer();

    addDebugLog('预设覆盖已停用');
}

/**
 * 检查覆盖是否激活
 * @returns {boolean}
 */
export function isOverridesActive() {
    return proxyState.active;
}

// ===== 安全机制 =====

/**
 * 启动安全超时看门狗
 * 如果超过 SAFETY_TIMEOUT_MS 仍未停用，自动停用
 */
function startSafetyTimer() {
    clearSafetyTimer();
    proxyState.safetyTimer = setTimeout(function() {
        if (proxyState.active) {
            addLog('安全超时：预设覆盖超过 ' + (SAFETY_TIMEOUT_MS / 1000) + ' 秒未停用，自动恢复', 'warning');
            deactivateOverrides();
        }
    }, SAFETY_TIMEOUT_MS);
}

/**
 * 清除安全超时定时器
 */
function clearSafetyTimer() {
    if (proxyState.safetyTimer) {
        clearTimeout(proxyState.safetyTimer);
        proxyState.safetyTimer = null;
    }
}

// ===== 辅助函数 =====

/**
 * 从预设中提取生成参数
 * @param {object} preset - 预设数据
 * @returns {object|null}
 */
function extractGenParams(preset) {
    if (!preset) return null;
    var params = {};
    var genKeys = GEN_PARAM_KEYS.concat(['stream_openai']);
    for (var i = 0; i < genKeys.length; i++) {
        var key = genKeys[i];
        if (preset[key] !== undefined) params[key] = preset[key];
    }
    return Object.keys(params).length ? params : null;
}
