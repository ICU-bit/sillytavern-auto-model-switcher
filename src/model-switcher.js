/**
 * NSFW 模型切换器 - 模型切换模块
 * 负责安全的模型切换，包含 oai_settings 快照保存和恢复
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { addLog } from './logger.js';
import { loadSettings } from './settings.js';

function getOaiSettings() {
    try {
        const context = getContext();
        if (context?.oai_settings) return context.oai_settings;
    } catch (_) {}
    if (typeof window.oai_settings !== 'undefined') return window.oai_settings;
    return null;
}

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
    const oai_settings = getOaiSettings();
    if (!oai_settings) {
        addLog('无法创建快照：oai_settings 不可用', 'error');
        return null;
    }

    try {
        const snapshot = {
            chat_completion_source: oai_settings.chat_completion_source,
            model_fields: {},
        };

        for (const [source, field] of Object.entries(SOURCE_TO_FIELD)) {
            if (oai_settings[field] !== undefined) {
                snapshot.model_fields[field] = oai_settings[field];
            }
        }

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
    const oai_settings = getOaiSettings();
    if (!oai_settings) return null;
    const source = oai_settings.chat_completion_source;
    return SOURCE_TO_FIELD[source] || null;
}

/**
 * 获取当前使用的模型信息
 * @returns {{ model: string, source: string }|null}
 */
export function getCurrentModelInfo() {
    const oai_settings = getOaiSettings();
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

    const oai_settings = getOaiSettings();
    if (!oai_settings) {
        addLog('无法切换：oai_settings 不可用', 'error');
        return false;
    }

    try {
        saveSettingsSnapshot();

        const settings = loadSettings();
        const source = targetSource || settings.modelASource || 'openai';
        const targetField = SOURCE_TO_FIELD[source];

        if (!targetField) {
            addLog('不支持的模型来源: ' + source, 'error');
            return false;
        }

        addLog('切换模型到: ' + targetModel + ' (来源: ' + source + ')', 'success');

        if (source !== oai_settings.chat_completion_source) {
            oai_settings.chat_completion_source = source;
            addLog('切换 API 来源到: ' + source, 'info');
        }

        oai_settings[targetField] = targetModel;

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

    const oai_settings = getOaiSettings();
    if (!oai_settings) {
        addLog('无法恢复：oai_settings 不可用', 'error');
        return false;
    }

    try {
        if (settingsSnapshot.chat_completion_source) {
            oai_settings.chat_completion_source = settingsSnapshot.chat_completion_source;
        }

        for (const [field, value] of Object.entries(settingsSnapshot.model_fields)) {
            oai_settings[field] = value;
        }

        if (settingsSnapshot.streaming !== undefined) {
            oai_settings.streaming = settingsSnapshot.streaming;
        }

        const source = settingsSnapshot.chat_completion_source;
        const field = SOURCE_TO_FIELD[source];
        const restoredModel = field ? oai_settings[field] : '未知';

        addLog('已恢复原模型: ' + (restoredModel || '默认模型'), 'success');

        if (saveSettingsDebounced) {
            saveSettingsDebounced();
        }

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