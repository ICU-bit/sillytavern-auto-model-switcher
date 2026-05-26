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
    showNotification: true,
    debugMode: false,
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
    return { ...DEFAULT_SETTINGS, ...stored };
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
        showNotification: $formContainer.find('#nsfw_switcher_show_notification').prop('checked'),
        debugMode: $formContainer.find('#nsfw_switcher_debug_mode').prop('checked'),
    };
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
        $indicator.css('background', '#e74c3c');
        $text.text('已禁用');
    } else if (!settings.nsfwApiUrl || !settings.modelA || !settings.modelAApiUrl) {
        $indicator.css('background', '#f39c12');
        $text.text('配置不完整');
    } else {
        $indicator.css('background', '#27ae60');
        $text.text('运行中');
    }
}