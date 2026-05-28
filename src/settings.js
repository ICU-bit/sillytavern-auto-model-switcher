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
 * NSFW 模型切换器 - 设置模块
 * 使用 SillyTavern 标准扩展设置 API
 */

import { extension_settings } from '../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../script.js';
import { addLog, addDebugLog } from './logger.js';

export const EXTENSION_NAME = 'nsfw-model-switcher';

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS = {
    enabled: true,
    nsfwApiUrl: '',
    nsfwApiKey: '',
    nsfwModelName: '',
    modelA: '',
    modelAApiUrl: '',
    modelAApiKey: '',
    nsfwPresetData: null,
    nsfwPresets: {},
    activePresetName: '',
    showNotification: true,
    debugMode: false,
    debugLevel: 'info',  // 'debug' | 'info' | 'warn' | 'error'
};

/**
 * 加载当前设置（合并默认值）
 * @returns {object}
 */
export function loadSettings() {
    const stored = extension_settings[EXTENSION_NAME];
    if (!stored) {
        // 首次运行，用默认值初始化
        extension_settings[EXTENSION_NAME] = { ...DEFAULT_SETTINGS };
        return { ...DEFAULT_SETTINGS };
    }
    // 合并默认值，确保新增字段也有默认值
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    return merged;
}

/**
 * 从 DOM 表单收集设置值并保存
 * @param {JQuery} $formContainer - 包含设置表单元素的选择器
 */
export function collectAndSaveFromDom($formContainer) {
    extension_settings[EXTENSION_NAME] = {
        enabled: $formContainer.find('#nsfw_switcher_enabled').prop('checked'),
        nsfwApiUrl: $formContainer.find('#nsfw_switcher_api_url').val(),
        nsfwApiKey: $formContainer.find('#nsfw_switcher_api_key').val(),
        nsfwModelName: $formContainer.find('#nsfw_switcher_model_name').val(),
        modelA: $formContainer.find('#nsfw_switcher_model_a').val(),
        modelAApiUrl: $formContainer.find('#nsfw_switcher_model_a_api_url').val(),
        modelAApiKey: $formContainer.find('#nsfw_switcher_model_a_api_key').val(),
        nsfwPresetData: extension_settings[EXTENSION_NAME]?.nsfwPresetData || null,
        nsfwPresets: extension_settings[EXTENSION_NAME]?.nsfwPresets || {},
        nsfwPresetModules: extension_settings[EXTENSION_NAME]?.nsfwPresetModules || {},
        activePresetName: extension_settings[EXTENSION_NAME]?.activePresetName || '',
        showNotification: $formContainer.find('#nsfw_switcher_show_notification').prop('checked'),
        debugMode: $formContainer.find('#nsfw_switcher_debug_mode').prop('checked'),
        debugLevel: $formContainer.find('#nsfw_switcher_debug_level').val() || 'info',
    };
    addDebugLog('设置已从DOM收集并保存');
    saveSettingsDebounced();
}

/**
 * 将设置值同步到 DOM 表单元素
 * @param {object} settings - 设置对象
 * @param {JQuery} $formContainer - 包含设置表单元素的选择器
 */
export function applySettingsToDom(settings, $formContainer) {
    $formContainer.find('#nsfw_switcher_enabled').prop('checked', settings.enabled);
    $formContainer.find('#nsfw_switcher_api_url').val(settings.nsfwApiUrl);
    $formContainer.find('#nsfw_switcher_api_key').val(settings.nsfwApiKey);
    $formContainer.find('#nsfw_switcher_model_name').val(settings.nsfwModelName);
    $formContainer.find('#nsfw_switcher_model_a').val(settings.modelA);
    $formContainer.find('#nsfw_switcher_model_a_api_url').val(settings.modelAApiUrl);
    $formContainer.find('#nsfw_switcher_model_a_api_key').val(settings.modelAApiKey);
    // nsfwPresetData 通过按钮交互设置，不通过 DOM 表单同步
    $formContainer.find('#nsfw_switcher_show_notification').prop('checked', settings.showNotification);
    $formContainer.find('#nsfw_switcher_debug_mode').prop('checked', settings.debugMode);
    $formContainer.find('#nsfw_switcher_debug_level').val(settings.debugLevel || 'info');
    addDebugLog('设置已应用到DOM');
}

/**
 * 更新状态指示灯
 * @param {object} settings
 * @param {JQuery} $container
 */
export function updateStatusIndicator(settings, $container) {
    const $indicator = $container.find('#nsfw_switcher_status_indicator');
    const $text = $container.find('#nsfw_switcher_status_text');

    if (!settings.enabled) {
        $indicator.attr('data-state', 'disabled');
        $text.text('已禁用');
    } else if (!settings.nsfwApiUrl || !settings.modelA || !settings.modelAApiUrl) {
        $indicator.attr('data-state', 'incomplete');
        $text.text('配置不完整');
    } else {
        $indicator.attr('data-state', 'running');
        $text.text('运行中');
    }
}

export function getAllPresetNames() {
    return Object.keys(extension_settings[EXTENSION_NAME].nsfwPresets || {});
}

export function getActivePreset() {
    var settings = extension_settings[EXTENSION_NAME];
    var name = settings.activePresetName;
    if (name && settings.nsfwPresets && settings.nsfwPresets[name]) {
        return settings.nsfwPresets[name];
    }
    return null;
}

export function getActivePresetName() {
    return extension_settings[EXTENSION_NAME].activePresetName || '';
}

export function savePresetAs(name, data, modules) {
    if (!name || !data) return;
    extension_settings[EXTENSION_NAME].nsfwPresets[name] = {
        data: data,
        modules: modules || {},
    };
    extension_settings[EXTENSION_NAME].activePresetName = name;
    saveSettingsDebounced();
    addLog('已保存预设: ' + name, 'success');
}

export function deletePreset(name) {
    var presets = extension_settings[EXTENSION_NAME].nsfwPresets;
    if (!presets || !presets[name]) return;
    delete presets[name];
    if (extension_settings[EXTENSION_NAME].activePresetName === name) {
        var remaining = Object.keys(presets);
        extension_settings[EXTENSION_NAME].activePresetName = remaining.length > 0 ? remaining[0] : '';
    }
    saveSettingsDebounced();
    addLog('已删除预设: ' + name, 'info');
}

export function renamePreset(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    var presets = extension_settings[EXTENSION_NAME].nsfwPresets;
    if (!presets[oldName] || presets[newName]) return;
    presets[newName] = presets[oldName];
    delete presets[oldName];
    if (extension_settings[EXTENSION_NAME].activePresetName === oldName) {
        extension_settings[EXTENSION_NAME].activePresetName = newName;
    }
    saveSettingsDebounced();
    addLog('已重命名预设: ' + oldName + ' → ' + newName, 'success');
}

export function exportPreset(name) {
    var presets = extension_settings[EXTENSION_NAME].nsfwPresets;
    if (!presets || !presets[name]) return;
    var exportData = {
        nsfwSwitcherPreset: true,
        version: 1,
        name: name,
        data: presets[name].data,
        modules: presets[name].modules,
    };
    var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'nsfw-preset-' + name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog('已导出预设: ' + name, 'success');
}