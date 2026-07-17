// SPDX-License-Identifier: AGPL-3.0-only

/**
 * NSFW 模型切换器 - UI 事件绑定
 *
 * 负责设置面板的所有 DOM 事件监听器注册。
 * 通过 UIBindingsDeps 接口注入状态机/协调器，解耦 index.ts。
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { addLog } from './logger.js';
import { escapeHtml, setRenderCallback, renderLogEntryHtml, renderLogsHtml, getLogs, clearLogs, type LogEntry, type LogLevelName } from './logger.js';
import {
    loadSettings,
    getSettingsRoot,
    collectAndSaveFromDom,
    updateStatusIndicator,
    getAllPresetNames,
    getActivePreset,
    getActivePresetName,
    savePresetAs,
    deletePreset,
    renamePreset,
    exportPreset,
    type PresetData,
    type PresetModuleEnabledMap,
} from './settings.js';
import { renderPresetModulesHtml, buildDefaultEnabledModules } from './preset-modules.js';
import { isInterceptEnabled } from './direct-api.js';
import { testNsfwApi } from './detector.js';
import type { ModelStateMachine } from './state.js';
import type { SwitcherCoordinator } from './coordinator.js';
import { showPrompt, showConfirm } from './mobile.js';

// ===== 类型 =====

/** UI 绑定所需的运行时依赖 */
export interface UIBindingsDeps {
    state: ModelStateMachine;
    coordinator: SwitcherCoordinator;
}

// ===== 日志渲染设置 =====

function shouldShowLog(log: LogEntry, minLevel: LogLevelName): boolean {
    const priority: Record<LogLevelName, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    return (priority[log.level] ?? 0) >= (priority[minLevel] ?? 0);
}

export function setupLogRendering(): void {
    setRenderCallback(function (logs, newLog) {
        const $c = $('#nsfw_switcher_logs');
        if (!$c.length) return;
        const root = getSettingsRoot();
        const minLevel: LogLevelName = (root && root.debugLevel) || 'info';
        if (newLog && shouldShowLog(newLog, minLevel)) {
            $c.find('.nsfw-log-empty').remove();
            $c.prepend(renderLogEntryHtml(newLog));
            const maxEntries = (root && root.logMaxEntries) || 200;
            while ($c.children().length > maxEntries) $c.children().last().remove();
        } else {
            $c.html(renderLogsHtml(logs, minLevel));
        }
    });
}

// ===== 设置面板事件绑定 =====

export function bindSettingsListeners($panel: JQuery<HTMLElement>, deps: UIBindingsDeps): void {
    // 折叠/展开预设区域
    $panel.on('click', '[data-toggle="preset"]', function (this: HTMLElement, e: JQuery.ClickEvent) {
        if ($(e.target).closest('.menu_button').length) return;
        const $content = $panel.find('.nsfw-preset-content');
        const $icon = $(this).find('.nsfw-collapse-icon');
        $content.slideToggle(200);
        $icon.toggleClass('nsfw-expanded');
    });

    // 折叠/展开日志区域
    $panel.on('click', '[data-toggle="logs"]', function (this: HTMLElement, e: JQuery.ClickEvent) {
        if ($(e.target).closest('.menu_button, .nsfw-log-btn, .nsfw-select').length) return;
        const $content = $panel.find('.nsfw-log-content');
        const $icon = $(this).find('.nsfw-collapse-icon');
        $content.slideToggle(200);
        $icon.toggleClass('nsfw-expanded');
    });

    $panel.on('input change',
        '#nsfw_switcher_enabled, #nsfw_switcher_api_url, #nsfw_switcher_api_key, ' +
        '#nsfw_switcher_model_name, #nsfw_switcher_model_a, #nsfw_switcher_model_a_api_url, ' +
        '#nsfw_switcher_model_a_api_key, ' +
        '#nsfw_switcher_show_notification, #nsfw_switcher_debug_mode, #nsfw_switcher_debug_level, ' +
        '#nsfw_switcher_log_entries, #nsfw_switcher_api_timeout, ' +
        '#nsfw_switcher_api_retries, #nsfw_switcher_safety_timeout',
        function () {
            collectAndSaveFromDom($panel);
            const s = loadSettings();
            if (!s.enabled && deps.coordinator.isActive()) {
                deps.coordinator.disable('plugin_off');
            }
            updateIndicator();
        }
    );

    $panel.on('click', '#nsfw_switcher_test_btn', async function () {
        await testNsfwApi();
    });

    $panel.on('click', '#nsfw_switcher_restore_btn', async function () {
        deps.state.onManualRestore();
        deps.coordinator.disable('manual');
        addLog('手动恢复: 将使用原始模型生成', 'success');
        if (typeof toastr !== 'undefined') toastr.success('[NSFW 模型切换器] 已恢复原始模型');
        updateIndicator();
    });

    $panel.on('click', '#nsfw_switcher_clear_logs_btn', function () {
        clearLogs();
        addLog('日志已清空', 'info');
    });

    // --- Preset Management ---
    function refreshPresetDropdown($panel: JQuery<HTMLElement>): void {
        const $sel = $panel.find('#nsfw_preset_selector');
        const root = getSettingsRoot();
        const currentVal = root?.activePresetName || '';
        $sel.empty().append('<option value="">-- 无预设 --</option>');
        const names = getAllPresetNames();
        for (let i = 0; i < names.length; i++) {
            $sel.append('<option value="' + escapeHtml(names[i]) + '">' + escapeHtml(names[i]) + '</option>');
        }
        $sel.val(currentVal);
        const active = getActivePreset();
        if (active) {
            $panel.find('#nsfw_switcher_preset_status').html(renderPresetModulesHtml(active.data, active.modules));
        } else {
            $panel.find('#nsfw_switcher_preset_status').text('未导入预设');
        }
    }

    $panel.on('change', '#nsfw_preset_selector', function (this: HTMLElement) {
        const name = String($(this).val() ?? '');
        getSettingsRoot().activePresetName = name;
        saveSettingsDebounced();
        refreshPresetDropdown($panel);
        addLog('切换预设: ' + (name || '(无)'), 'info');
    });

    // 检查是否已存在文件输入元素（防止热重载时重复创建）
    let $presetFileInput = $('#nsfw_preset_file_input_dynamic');
    if (!$presetFileInput.length) {
        $presetFileInput = $('<input type="file" id="nsfw_preset_file_input_dynamic" accept=".json" class="nsfw-hidden">');
        $('body').append($presetFileInput);
    }
    $panel.on('click', '#nsfw_preset_import_btn', function () { $presetFileInput.trigger('click'); });
    $presetFileInput.on('change', function (e: JQuery.ChangeEvent) {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev: ProgressEvent<FileReader>) {
            try {
                const result = ev.target?.result;
                if (typeof result !== 'string') return;
                const rawData = JSON.parse(result, (key, value) => {
                    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                        return undefined;
                    }
                    return value;
                }) as PresetData & {
                    nsfwSwitcherPreset?: boolean;
                    name?: string;
                    display_name?: string;
                    data?: PresetData;
                    modules?: PresetModuleEnabledMap;
                };
                let presetData: PresetData;
                let presetName: string;
                let presetModules: PresetModuleEnabledMap;
                if (rawData.nsfwSwitcherPreset) {
                    presetName = String(rawData.name || '');
                    presetData = rawData.data || {};
                    presetModules = rawData.modules || {};
                } else {
                    presetName = String(rawData.name || rawData.display_name || file.name.replace(/\.json$/i, ''));
                    presetData = rawData;
                    presetModules = buildDefaultEnabledModules(rawData);
                }
                const root = getSettingsRoot();
                if (root.nsfwPresets[presetName]) {
                    let suffix = 1;
                    const baseName = presetName;
                    while (root.nsfwPresets[presetName]) {
                        presetName = baseName + ' (' + suffix + ')';
                        suffix++;
                    }
                }
                savePresetAs(presetName, presetData, presetModules);
                refreshPresetDropdown($panel);
                if (typeof toastr !== 'undefined') toastr.success('[NSFW 模型切换器] 已导入预设: ' + presetName);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                addLog('预设导入失败: ' + msg, 'error');
                if (typeof toastr !== 'undefined') toastr.error('预设文件解析失败');
            }
        };
        reader.readAsText(file);
        $presetFileInput.val('');
    });

    $panel.on('click', '#nsfw_preset_export_btn', function () {
        const name = getActivePresetName();
        if (!name) { if (typeof toastr !== 'undefined') toastr.warning('请先选择一个预设'); return; }
        exportPreset(name);
    });

    $panel.on('click', '#nsfw_preset_delete_btn', async function () {
        const name = getActivePresetName();
        if (!name) { if (typeof toastr !== 'undefined') toastr.warning('请先选择一个预设'); return; }
        if (!confirm('确定删除预设 "' + name + '"？')) return;
        deletePreset(name);
        refreshPresetDropdown($panel);
        if (typeof toastr !== 'undefined') toastr.info('[NSFW 模型切换器] 已删除预设: ' + name);
    });

    $panel.on('click', '#nsfw_preset_save_btn', function () {
        const name = getActivePresetName();
        if (!name) { if (typeof toastr !== 'undefined') toastr.warning('请先选择一个预设，或使用"另存为"'); return; }
        const active = getActivePreset();
        if (!active) return;
        const root = getSettingsRoot();
        const mods = root.nsfwPresetModules || active.modules;
        savePresetAs(name, active.data, mods);
        if (typeof toastr !== 'undefined') toastr.success('[NSFW 模型切换器] 已保存预设: ' + name);
    });

    $panel.on('click', '#nsfw_preset_rename_btn', async function () {
        const oldName = getActivePresetName();
        if (!oldName) { if (typeof toastr !== 'undefined') toastr.warning('请先选择一个预设'); return; }
        const newName = prompt('输入新名称:', oldName);
        if (!newName || newName === oldName) return;
        if (getSettingsRoot().nsfwPresets[newName]) {
            if (typeof toastr !== 'undefined') toastr.error('预设名称 "' + newName + '" 已存在');
            return;
        }
        renamePreset(oldName, newName);
        refreshPresetDropdown($panel);
        if (typeof toastr !== 'undefined') toastr.success('[NSFW 模型切换器] 已重命名: ' + oldName + ' → ' + newName);
    });

    $panel.on('click', '#nsfw_preset_new_btn', async function () {
        const name = prompt('输入预设名称:');
        if (!name) return;
        if (getSettingsRoot().nsfwPresets[name]) {
            if (typeof toastr !== 'undefined') toastr.error('预设名称 "' + name + '" 已存在');
            return;
        }
        const active = getActivePreset();
        const data: PresetData = active ? active.data : {};
        const modules: PresetModuleEnabledMap = active ? active.modules : {};
        savePresetAs(name, data, modules);
        refreshPresetDropdown($panel);
        if (typeof toastr !== 'undefined') toastr.success('[NSFW 模型切换器] 已创建预设: ' + name);
    });

    refreshPresetDropdown($panel);

    // 预设模块开关（事件委托）
    $panel.on('change', '.nsfw-module-chk', function (this: HTMLElement) {
        const mid = String($(this).data('module'));
        const checked = Boolean($(this).prop('checked'));
        const root = getSettingsRoot();
        const mods: PresetModuleEnabledMap = root.nsfwPresetModules || {};
        mods[mid] = checked;
        $panel.find('.nsfw-field-chk[data-field^="' + mid + '_"]').each(function (this: HTMLElement) {
            $(this).prop('checked', checked);
            mods[String($(this).data('field'))] = checked;
        });
        if (mid === 'prompts') {
            $panel.find('.nsfw-field-chk[data-field^="prompt_"]').each(function (this: HTMLElement) {
                $(this).prop('checked', checked);
                mods[String($(this).data('field'))] = checked;
            });
        }
        root.nsfwPresetModules = mods;
        saveSettingsDebounced();
    });

    $panel.on('change', '.nsfw-field-chk', function (this: HTMLElement) {
        const fid = String($(this).data('field'));
        const checked = Boolean($(this).prop('checked'));
        const root = getSettingsRoot();
        const mods: PresetModuleEnabledMap = root.nsfwPresetModules || {};
        mods[fid] = checked;
        root.nsfwPresetModules = mods;
        saveSettingsDebounced();
    });

    $panel.on('change', '#nsfw_switcher_log_level_filter', function (this: HTMLElement) {
        const minLevel = String($(this).val() || 'debug') as LogLevelName;
        const logs = getLogs();
        const $c = $panel.find('#nsfw_switcher_logs');
        if ($c.length) $c.html(renderLogsHtml(logs, minLevel));
    });

    // 点击字段行展开编辑器
    $panel.on('click', '.nsfw-field-row', function (this: HTMLElement, e: JQuery.ClickEvent) {
        if ($(e.target).is('input')) return;
        const $row = $(this);
        const $existing = $row.next('.nsfw-editor');
        if ($existing.length) { $existing.slideToggle(100); return; }
        const fid = String($row.data('field') || '');
        const key = String($row.data('key') || '');

        const activePreset = getActivePreset();
        const presetData: PresetData | null = activePreset
            ? activePreset.data
            : getSettingsRoot().nsfwPresetData;
        if (!presetData) return;

        let val: unknown = key ? presetData[key] : '';
        if (fid && fid.indexOf('prompt_') === 0) {
            const idx = parseInt(fid.split('_')[1], 10);
            const prompts = presetData.prompts as Array<{ content?: string }> | undefined;
            if (!isNaN(idx) && prompts && prompts[idx]) val = prompts[idx].content || '';
        }
        const $editor = $('<div class="nsfw-editor" style="display:none;">' +
            '<textarea>' + escapeHtml(String(val)) + '</textarea>' +
            '<button class="nsfw-editor-save">保存</button>' +
            '</div>');
        $row.after($editor);
        $editor.slideDown(100);
        $editor.find('.nsfw-editor-save').on('click', function () {
            const newValRaw = $editor.find('textarea').val();
            const newVal = typeof newValRaw === 'string' ? newValRaw : '';
            if (fid && fid.indexOf('prompt_') === 0) {
                const idx = parseInt(fid.split('_')[1], 10);
                const prompts = presetData.prompts as Array<{ content?: string }> | undefined;
                if (!isNaN(idx) && prompts && prompts[idx]) prompts[idx].content = newVal;
            } else if (key && presetData[key] !== undefined) {
                const num = Number(newVal);
                presetData[key] = (newVal !== '' && !isNaN(num)) ? num : (newVal === 'true' ? true : (newVal === 'false' ? false : newVal));
            }
            if (activePreset) {
                const activeName = getActivePresetName();
                savePresetAs(activeName, presetData, activePreset.modules);
            } else {
                getSettingsRoot().nsfwPresetData = presetData;
                saveSettingsDebounced();
            }
            const display = newVal.length > 50 ? newVal.substring(0, 50) + '...' : newVal;
            $row.find('span:last').text(display);
            addLog('已更新: ' + (key || fid), 'info');
            if (typeof toastr !== 'undefined') toastr.success('[NSFW 模型切换器] 已更新');
            $editor.slideUp(100);
        });
    });

    const updateIndicator = function (): void {
        const s = loadSettings();
        updateStatusIndicator(s, $panel);
        $panel.find('#nsfw_switcher_state_text').text('状态机: ' + deps.state.getStateDescription() + (isInterceptEnabled() ? ' [拦截中]' : ''));
    };

    const initialSettings = loadSettings();
    if (initialSettings.nsfwPresetData) {
        $panel.find('#nsfw_switcher_preset_status').html(renderPresetModulesHtml(initialSettings.nsfwPresetData, initialSettings.nsfwPresetModules));
    }

    updateIndicator();
}
