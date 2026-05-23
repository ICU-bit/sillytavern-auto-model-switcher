/**
 * NSFW 模型切换器 - 模型切换模块
 * 负责安全的模型切换，包含 oai_settings 快照保存和恢复
 */

import { saveSettingsDebounced, oai_settings } from '../../../../../script.js';
import { addLog } from './logger.js';
import { loadSettings } from './settings.js';

/**
 * 模型来源到 oai_settings 字段名的映射
 */
const SOURCE_TO_FIELD = {
    'openai': 'openai_model',
    'claude': 'claude_model',
    'openrouter': 'openrouter_model',
    'custom': 'custom_model',
    'ai21': 'ai21_model',
    'makersuite': 'google_model',
    'vertexai': 'vertexai_model',
    'mistralai': 'mistralai_model',
    'cohere': 'cohere_model',
    'perplexity': 'perplexity_model',
    'groq': 'groq_model',
    'electronhub': 'electronhub_model',
    'chutes': 'chutes_model',
    'nanogpt': 'nanogpt_model',
    'deepseek': 'deepseek_model',
    'aimlapi': 'aimlapi_model',
    'xai': 'xai_model',
    'pollinations': 'pollinations_model',
    'cometapi': 'cometapi_model',
    'moonshot': 'moonshot_model',
    'fireworks': 'fireworks_model',
    'azure_openai': 'azure_openai_model',
    'zai': 'zai_model',
    'siliconflow': 'siliconflow_model',
};

/**
 * 当前可用的模型来源列表（从 SOURCE_TO_FIELD 动态提取）
 */
const SUPPORTED_SOURCES = Object.keys(SOURCE_TO_FIELD);

/** 快照：切换前保存的原始 oai_settings */
let settingsSnapshot = null;

/**
 * 深拷贝 oai_settings 的模型相关部分
 * @returns {object|null}
 */
function takeSnapshot() {
    if (!oai_settings) {
        addLog('无法创建快照：oai_settings 不可用', 'error');
        return null;
    }

    try {
        const snapshot = {
            chat_completion_source: oai_settings.chat_completion_source,
            model_fields: {},
        };

        // 保存所有模型字段
        for (const [source, field] of Object.entries(SOURCE_TO_FIELD)) {
            if (oai_settings[field] !== undefined) {
                snapshot.model_fields[field] = oai_settings[field];
            }
        }

        // 额外保存一些关键设置
        snapshot.streaming = oai_settings.streaming;

        return snapshot;
    } catch (e) {
        addLog('创建快照失败: ' + e.message, 'error');
        return null;
    }
}

/**
 * 当前模型来源对应的模型字段名
 * @returns {string|null}
 */
function getCurrentModelField() {
    if (!oai_settings) return null;
    const source = oai_settings.chat_completion_source;
    return SOURCE_TO_FIELD[source] || null;
}

/**
 * 获取当前使用的模型信息
 * @returns {{ model: string, source: string }|null}
 */
export function getCurrentModelInfo() {
    if (!oai_settings) return null;

    const source = oai_settings.chat_completion_source;
    const field = SOURCE_TO_FIELD[source];

    if (field && oai_settings[field]) {
        return {
            model: oai_settings[field],
            source: source,
        };
    }
    return null;
}

/**
 * 保存当前 oai_settings 快照（仅首次调用生效）
 * @returns {boolean} 是否成功保存
 */
export function saveSettingsSnapshot() {
    if (settingsSnapshot) {
        return true; // 已保存，无需重复
    }

    settingsSnapshot = takeSnapshot();

    if (settingsSnapshot) {
        const info = getCurrentModelInfo();
        if (info) {
            addLog('已保存原模型: ' + info.model + ' (来源: ' + info.source + ')', 'info');
        }
        return true;
    }

    return false;
}

/**
 * 切换模型到目标
 * @param {string} targetModel - 目标模型名称
 * @param {string} [targetSource] - 目标 API 来源
 * @param {string} [targetApiUrl] - 目标 API 地址
 * @param {string} [targetApiKey] - 目标 API 密钥
 * @returns {Promise<boolean>}
 */
export async function switchToModel(targetModel, targetSource, targetApiUrl, targetApiKey) {
    if (!targetModel) {
        addLog('未指定切换模型', 'warning');
        return false;
    }

    if (!oai_settings) {
        addLog('无法切换：oai_settings 不可用', 'error');
        return false;
    }

    try {
        // 先保存快照（首次切换才生效）
        saveSettingsSnapshot();

        const settings = loadSettings();
        const source = targetSource || settings.modelASource || 'openai';
        const targetField = SOURCE_TO_FIELD[source];

        if (!targetField) {
            addLog('不支持的模型来源: ' + source, 'error');
            return false;
        }

        addLog('切换模型到: ' + targetModel + ' (来源: ' + source + ')', 'success');

        // 切换来源（如果需要）
        if (source !== oai_settings.chat_completion_source) {
            oai_settings.chat_completion_source = source;
            addLog('切换 API 来源到: ' + source, 'info');
        }

        // 切换模型
        oai_settings[targetField] = targetModel;

        // 如果有特定的 API URL/Key，设置它们
        // 注意：不同来源的 API 配置字段不同，这里只处理常见情况
        if (targetApiUrl) {
            const urlField = source + '_api_url';
            if (oai_settings[urlField] !== undefined) {
                oai_settings[urlField] = targetApiUrl;
                addLog('切换 API 地址', 'info');
            }
        }

        if (targetApiKey) {
            const keyField = source + '_api_key';
            if (oai_settings[keyField] !== undefined) {
                oai_settings[keyField] = targetApiKey;
                addLog('切换 API 密钥', 'info');
            }
        }

        // 保存设置
        if (saveSettingsDebounced) {
            saveSettingsDebounced();
        }

        const settings_ = loadSettings();
        if (settings_.showNotification && typeof toastr !== 'undefined') {
            toastr.info('[NSFW 模型切换器] 已切换到: ' + targetModel);
        }

        return true;
    } catch (e) {
        addLog('切换模型失败: ' + e.message, 'error');
        return false;
    }
}

/**
 * 恢复到原始模型（使用快照）
 * @returns {Promise<boolean>}
 */
export async function restoreOriginalModel() {
    if (!settingsSnapshot) {
        addLog('无可恢复的快照（未保存过原始模型）', 'info');
        return false;
    }

    if (!oai_settings) {
        addLog('无法恢复：oai_settings 不可用', 'error');
        return false;
    }

    try {
        // 从快照恢复来源
        if (settingsSnapshot.chat_completion_source) {
            oai_settings.chat_completion_source = settingsSnapshot.chat_completion_source;
        }

        // 从快照恢复所有模型字段
        for (const [field, value] of Object.entries(settingsSnapshot.model_fields)) {
            oai_settings[field] = value;
        }

        // 恢复 streaming 设置
        if (settingsSnapshot.streaming !== undefined) {
            oai_settings.streaming = settingsSnapshot.streaming;
        }

        // 获取恢复的模型信息用于日志
        const source = settingsSnapshot.chat_completion_source;
        const field = SOURCE_TO_FIELD[source];
        const restoredModel = field ? oai_settings[field] : '未知';

        addLog('已恢复原模型: ' + (restoredModel || '默认模型'), 'success');

        // 保存设置
        if (saveSettingsDebounced) {
            saveSettingsDebounced();
        }

        // 清除快照（恢复完成后快照不再有效）
        const snapshotModel = restoredModel;
        settingsSnapshot = null;

        const settings = loadSettings();
        if (settings.showNotification && typeof toastr !== 'undefined') {
            toastr.info('[NSFW 模型切换器] 已恢复原模型: ' + (snapshotModel || '默认模型'));
        }

        return true;
    } catch (e) {
        addLog('恢复模型失败: ' + e.message, 'error');
        return false;
    }
}

/**
 * 检查当前是否已保存快照
 * @returns {boolean}
 */
export function hasSettingsSnapshot() {
    return settingsSnapshot !== null;
}

/**
 * 清除快照（用于手动重置）
 */
export function clearSettingsSnapshot() {
    settingsSnapshot = null;
    addLog('快照已清除', 'info');
}

/**
 * 获取支持的来源列表
 * @returns {string[]}
 */
export function getSupportedSources() {
    return [...SUPPORTED_SOURCES];
}