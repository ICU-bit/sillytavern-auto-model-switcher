/**
 * NSFW 模型切换器 - 模型切换模块
 * 负责安全的模型切换，包含 oai_settings 快照保存和恢复
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { oai_settings } from '../../../../../scripts/openai.js';
import { power_user } from '../../../../../scripts/power-user.js';
import { addLog } from './logger.js';
import { loadSettings } from './settings.js';

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

const SUPPORTED_SOURCES = Object.keys(SOURCE_TO_FIELD);

let settingsSnapshot = null;

function takeSnapshot() {
    if (!oai_settings) {
        addLog('无法创建快照：oai_settings 不可用', 'error');
        return null;
    }

    try {
        const snapshot = {
            chat_completion_source: oai_settings.chat_completion_source,
            model_fields: {},
            presets: {
                instruct: power_user?.instruct ? structuredClone(power_user.instruct) : null,
                context: power_user?.context ? structuredClone(power_user.context) : null,
                sysprompt: power_user?.sysprompt ? structuredClone(power_user.sysprompt) : null,
                reasoning: power_user?.reasoning ? structuredClone(power_user.reasoning) : null,
            },
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

function getCurrentModelField() {
    if (!oai_settings) return null;
    const source = oai_settings.chat_completion_source;
    return SOURCE_TO_FIELD[source] || null;
}

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

export function saveSettingsSnapshot() {
    if (settingsSnapshot) {
        return true;
    }

    settingsSnapshot = takeSnapshot();

    if (settingsSnapshot) {
        const info = getCurrentModelInfo();
        if (info) {
            addLog('已保存原模型: ' + info.model + ' (来源: ' + info.source + ')', 'info');
        }
        const presets = settingsSnapshot.presets;
        if (presets?.instruct) {
            addLog('已保存预设: instruct=' + (presets.instruct.preset || '无') + ', context=' + (presets.context?.preset || '无') + ', sysprompt=' + (presets.sysprompt?.name || '无'), 'info');
        }
        return true;
    }

    return false;
}

function restorePresets() {
    if (!settingsSnapshot?.presets) {
        return;
    }

    try {
        const p = settingsSnapshot.presets;
        if (p.instruct && power_user) {
            Object.assign(power_user.instruct, p.instruct);
        }
        if (p.context && power_user) {
            Object.assign(power_user.context, p.context);
        }
        if (p.sysprompt && power_user) {
            Object.assign(power_user.sysprompt, p.sysprompt);
        }
        if (p.reasoning && power_user) {
            Object.assign(power_user.reasoning, p.reasoning);
        }
        addLog('已应用原模型的预设配置', 'info');
    } catch (e) {
        addLog('恢复预设失败: ' + e.message, 'warning');
    }
}

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

        // 应用原模型的预设，确保目标模型使用相同的 instruct/context/sysprompt
        restorePresets();

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
        if (settingsSnapshot.chat_completion_source) {
            oai_settings.chat_completion_source = settingsSnapshot.chat_completion_source;
        }

        for (const [field, value] of Object.entries(settingsSnapshot.model_fields)) {
            oai_settings[field] = value;
        }

        if (settingsSnapshot.streaming !== undefined) {
            oai_settings.streaming = settingsSnapshot.streaming;
        }

        // 恢复原模型的预设
        restorePresets();

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

export function hasSettingsSnapshot() {
    return settingsSnapshot !== null;
}

export function clearSettingsSnapshot() {
    settingsSnapshot = null;
    addLog('快照已清除', 'info');
}

export function getSupportedSources() {
    return [...SUPPORTED_SOURCES];
}
