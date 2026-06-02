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
import { shareOrDownload } from './mobile.js';
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
    debugLevel: 'info',
};
/** 内部 helper: 类型转换访问 extension_settings */
function getExtSettings() {
    return extension_settings;
}
/**
 * 加载当前设置（合并默认值）
 */
export function loadSettings() {
    const root = getExtSettings();
    const stored = root[EXTENSION_NAME];
    if (!stored) {
        // 首次运行，用默认值初始化
        root[EXTENSION_NAME] = { ...DEFAULT_SETTINGS };
        return { ...DEFAULT_SETTINGS };
    }
    // 合并默认值，确保新增字段也有默认值
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    return merged;
}
/**
 * 从 DOM 表单收集设置值并保存
 */
export function collectAndSaveFromDom($formContainer) {
    const root = getExtSettings();
    const current = root[EXTENSION_NAME];
    root[EXTENSION_NAME] = {
        enabled: $formContainer.find('#nsfw_switcher_enabled').prop('checked'),
        nsfwApiUrl: String($formContainer.find('#nsfw_switcher_api_url').val() ?? ''),
        nsfwApiKey: String($formContainer.find('#nsfw_switcher_api_key').val() ?? ''),
        nsfwModelName: String($formContainer.find('#nsfw_switcher_model_name').val() ?? ''),
        modelA: String($formContainer.find('#nsfw_switcher_model_a').val() ?? ''),
        modelAApiUrl: String($formContainer.find('#nsfw_switcher_model_a_api_url').val() ?? ''),
        modelAApiKey: String($formContainer.find('#nsfw_switcher_model_a_api_key').val() ?? ''),
        nsfwPresetData: current?.nsfwPresetData ?? null,
        nsfwPresets: current?.nsfwPresets ?? {},
        nsfwPresetModules: current?.nsfwPresetModules ?? {},
        activePresetName: current?.activePresetName ?? '',
        showNotification: $formContainer.find('#nsfw_switcher_show_notification').prop('checked'),
        debugMode: $formContainer.find('#nsfw_switcher_debug_mode').prop('checked'),
        debugLevel: String($formContainer.find('#nsfw_switcher_debug_level').val() || 'info'),
    };
    addDebugLog('设置已从DOM收集并保存');
    saveSettingsDebounced();
}
/**
 * 将设置值同步到 DOM 表单元素
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
 */
export function updateStatusIndicator(settings, $container) {
    const $indicator = $container.find('#nsfw_switcher_status_indicator');
    const $text = $container.find('#nsfw_switcher_status_text');
    if (!settings.enabled) {
        $indicator.attr('data-state', 'disabled');
        $text.text('已禁用');
    }
    else if (!settings.nsfwApiUrl || !settings.modelA || !settings.modelAApiUrl) {
        $indicator.attr('data-state', 'incomplete');
        $text.text('配置不完整');
    }
    else {
        $indicator.attr('data-state', 'running');
        $text.text('运行中');
    }
}
export function getAllPresetNames() {
    const root = getExtSettings();
    return Object.keys(root[EXTENSION_NAME]?.nsfwPresets || {});
}
export function getActivePreset() {
    const root = getExtSettings();
    const settings = root[EXTENSION_NAME];
    if (!settings)
        return null;
    const name = settings.activePresetName;
    if (name && settings.nsfwPresets && settings.nsfwPresets[name]) {
        return settings.nsfwPresets[name];
    }
    return null;
}
export function getActivePresetName() {
    const root = getExtSettings();
    return root[EXTENSION_NAME]?.activePresetName || '';
}
export function savePresetAs(name, data, modules) {
    if (!name || !data)
        return;
    const root = getExtSettings();
    const settings = root[EXTENSION_NAME];
    if (!settings)
        return;
    settings.nsfwPresets[name] = {
        data: data,
        modules: modules || {},
    };
    settings.activePresetName = name;
    saveSettingsDebounced();
    addLog('已保存预设: ' + name, 'success');
}
export function deletePreset(name) {
    const root = getExtSettings();
    const settings = root[EXTENSION_NAME];
    if (!settings)
        return;
    const presets = settings.nsfwPresets;
    if (!presets || !presets[name])
        return;
    delete presets[name];
    if (settings.activePresetName === name) {
        const remaining = Object.keys(presets);
        settings.activePresetName = remaining.length > 0 ? remaining[0] : '';
    }
    saveSettingsDebounced();
    addLog('已删除预设: ' + name, 'info');
}
export function renamePreset(oldName, newName) {
    if (!oldName || !newName || oldName === newName)
        return;
    const root = getExtSettings();
    const settings = root[EXTENSION_NAME];
    if (!settings)
        return;
    const presets = settings.nsfwPresets;
    if (!presets[oldName] || presets[newName])
        return;
    presets[newName] = presets[oldName];
    delete presets[oldName];
    if (settings.activePresetName === oldName) {
        settings.activePresetName = newName;
    }
    saveSettingsDebounced();
    addLog('已重命名预设: ' + oldName + ' → ' + newName, 'success');
}
export function exportPreset(name) {
    const root = getExtSettings();
    const presets = root[EXTENSION_NAME]?.nsfwPresets;
    if (!presets || !presets[name])
        return;
    const exportData = {
        nsfwSwitcherPreset: true,
        version: 1,
        name: name,
        data: presets[name].data,
        modules: presets[name].modules,
    };
    const filename = 'nsfw-preset-' + name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_') + '.json';
    void shareOrDownload(JSON.stringify(exportData, null, 2), filename, 'application/json');
    addLog('已导出预设: ' + name, 'success');
}
//# sourceMappingURL=settings.js.map