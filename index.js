console.log('NSFW_MODULE_LOADED');

import { eventSource, event_types } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { power_user } from '../../../../scripts/power-user.js';
import { addLog, addDebugLog, clearLogs, setRenderCallback, renderLogsHtml, getLogs, copyLogsToClipboard, exportLogsAsJson, initLogs } from './src/logger.js';
import { EXTENSION_NAME, DEFAULT_SETTINGS, loadSettings, collectAndSaveFromDom, applySettingsToDom, updateStatusIndicator, getAllPresetNames, getActivePreset, getActivePresetName, savePresetAs, deletePreset, renamePreset, exportPreset } from './src/settings.js';
import { createStateMachine } from './src/state.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { detectNSFW, getLastAiMessageText, getMessageTextById, testNsfwApi } from './src/detector.js';
import { restoreOriginalModel, saveSettingsSnapshot, clearSettingsSnapshot } from './src/model-switcher.js';
import { initFetchInterceptor, setInterceptEnabled, isInterceptEnabled, setOnRequestRedirected, setPresetOverrides } from './src/direct-api.js';
import { initProxies, activateOverrides, deactivateOverrides, isOverridesActive } from './src/preset-proxy.js';

console.log('ALL_IMPORTS_OK');
addLog('所有模块导入成功', 'info', 'debug');

var state, isReady, currentDetectionId, detectionAbortController;

var PRESET_MODULES = [
    { id: 'genParams', name: '生成参数', fields: ['temperature', 'top_p', 'top_k', 'top_a', 'min_p', 'repetition_penalty', 'frequency_penalty', 'presence_penalty', 'openai_max_context', 'openai_max_tokens'], test: function(p) { return ['temperature', 'top_p', 'top_k', 'repetition_penalty'].some(function(k) { return p[k] !== undefined; }); } },
    { id: 'instruct', name: 'Instruct 模板', fields: ['input_sequence', 'output_sequence', 'system_sequence', 'stop_sequence', 'wrap', 'names_behavior', 'activation_regex', 'output_suffix', 'input_suffix', 'system_suffix', 'first_output_sequence', 'last_output_sequence', 'system_same_as_user', 'sequences_as_stop_strings', 'skip_examples', 'macro', 'user_alignment_message', 'last_system_sequence', 'first_input_sequence', 'last_input_sequence', 'story_string_prefix', 'story_string_suffix'], test: function(p) { return p.input_sequence !== undefined; } },
    { id: 'context', name: 'Context 模板', fields: ['story_string', 'chat_start', 'example_separator', 'use_stop_strings', 'names_as_stop_strings', 'story_string_position', 'story_string_depth', 'story_string_role', 'always_force_name2', 'trim_sentences', 'single_line'], test: function(p) { return p.story_string !== undefined; } },
    { id: 'sysprompt', name: 'System Prompt', fields: ['content', 'post_history'], test: function(p) { return p.content !== undefined && p.name !== undefined; } },
    { id: 'reasoning', name: 'Reasoning 格式', fields: ['prefix', 'suffix', 'separator'], test: function(p) { return p.prefix !== undefined && p.suffix !== undefined; } },
    { id: 'prompts', name: '自定义提示词', fields: [], test: function(p) { return Array.isArray(p.prompts) && p.prompts.length > 0; } },
];


/** 从预设中提取生成参数 */
function extractGenParams(preset) {
    if (!preset) return null;
    var params = {};
    var genKeys = ['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'top_k', 'top_a', 'min_p', 'repetition_penalty', 'openai_max_context', 'openai_max_tokens', 'stream_openai'];
    for (var i = 0; i < genKeys.length; i++) {
        var key = genKeys[i];
        if (preset[key] !== undefined) params[key] = preset[key];
    }
    return Object.keys(params).length ? params : null;
}

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPresetModulesHtml(preset, enabled) {
    if (!preset) return '<div class="nsfw-preset-status">未导入预设</div>';
    var name = preset.name || preset.display_name || '未命名预设';
    var html = '<div class="nsfw-preset-status">已导入: <span class="preset-name">' + name + '</span></div>';
    html += '<div class="nsfw-preset-modules">';
    for (var mi = 0; mi < PRESET_MODULES.length; mi++) {
        var m = PRESET_MODULES[mi];
        if (!m.test(preset)) continue;
        var modOn = !enabled || enabled[m.id] !== false;
        html += '<div class="nsfw-module-header" data-module="' + m.id + '">' +
            '<input type="checkbox" class="nsfw-module-chk" data-module="' + m.id + '" ' + (modOn ? 'checked' : '') + '>' +
            m.name + '</div>';

        if (m.id === 'prompts' && Array.isArray(preset.prompts)) {
            for (var pi = 0; pi < preset.prompts.length; pi++) {
                var pp = preset.prompts[pi];
                var pfId = 'prompt_' + pi;
                var pfOn = enabled && enabled[pfId] !== false;
                html += '<div class="nsfw-field-row" data-field="' + pfId + '">' +
                    '<input type="checkbox" class="nsfw-field-chk" data-field="' + pfId + '" ' + (pfOn ? 'checked' : '') + '>' +
                    '<span class="nsfw-field-value">' + escapeHtml(pp.name || '(未命名)') + '</span></div>';
            }
        } else if (m.fields) {
            for (var fi = 0; fi < m.fields.length; fi++) {
                var fk = m.fields[fi];
                if (preset[fk] !== undefined) {
                    var fId = m.id + '_' + fk;
                    var fOn = enabled && enabled[fId] !== false;
                    var val = String(preset[fk]);
                    if (val.length > 80) val = val.substring(0, 80) + '...';
                    html += '<div class="nsfw-field-row" data-field="' + fId + '" data-key="' + fk + '">' +
                        '<input type="checkbox" class="nsfw-field-chk" data-field="' + fId + '" ' + (fOn ? 'checked' : '') + '>' +
                        '<span class="nsfw-field-key">' + fk + ':</span>' +
                        '<span class="nsfw-field-value">' + escapeHtml(val) + '</span></div>';
                }
            }
        }
    }
    html += '</div>';
    return html;
}

function buildDefaultEnabledModules(preset) {
    var enabled = {};
    if (!preset) return enabled;
    for (var mi = 0; mi < PRESET_MODULES.length; mi++) {
        var m = PRESET_MODULES[mi];
        if (!m.test(preset)) continue;
        enabled[m.id] = true;
        if (m.id === 'prompts' && Array.isArray(preset.prompts)) {
            for (var pi = 0; pi < preset.prompts.length; pi++) enabled['prompt_' + pi] = true;
        } else if (m.fields) {
            for (var fi = 0; fi < m.fields.length; fi++) {
                if (['always_force_name2', 'trim_sentences', 'single_line'].indexOf(m.fields[fi]) !== -1) {
                    if (preset[m.fields[fi]] !== undefined) enabled[m.id + '_' + m.fields[fi]] = true;
                } else if (preset[m.fields[fi]] !== undefined) enabled[m.id + '_' + m.fields[fi]] = true;
            }
        }
    }
    return enabled;
}

// ---------------------------------------------------------------------------
//  Settings HTML — Section Builders
// ---------------------------------------------------------------------------

/** 构建表单输入字段 HTML (label + input) */
function buildInputFieldHtml(id, labelText, type, placeholder, required) {
    var reqMark = required ? ' <span class="required">*</span>' : '';
    return '<div class="nsfw-field-group">' +
        '<label class="nsfw-field-label" for="' + id + '">' +
        labelText + reqMark + '</label>' +
        '<input type="' + type + '" id="' + id + '" class="nsfw-input"' +
        (placeholder ? ' placeholder="' + placeholder + '"' : '') + '>' +
        '</div>';
}

/** 构建复选框字段 HTML */
function buildCheckboxFieldHtml(id, labelText, checked) {
    return '<label class="nsfw-checkbox-row" for="' + id + '">' +
        '<input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '>' +
        '<span>' + labelText + '</span>' +
        '</label>';
}

/** 构建带图标的区块标题 HTML */
function buildSectionTitleHtml(iconClass, titleText) {
    return '<div class="nsfw-section-title">' +
        '<i class="' + iconClass + '"></i>' + titleText +
        '</div>';
}

/** 状态指示器区域 */
function buildStatusSectionHtml() {
    return '<div class="nsfw-status-bar">' +
        '<div class="nsfw-status-indicator" id="nsfw_switcher_status_indicator" data-state="incomplete"></div>' +
        '<span class="nsfw-status-text">状态:</span> ' +
        '<span class="nsfw-status-text" id="nsfw_switcher_status_text">启动中...</span>' +
        '<span class="nsfw-state-text" id="nsfw_switcher_state_text"></span>' +
        '</div>';
}

/** 启用插件开关 */
function buildEnableSectionHtml() {
    return '<div class="nsfw-settings-section">' +
        buildSectionTitleHtml('fa-solid fa-toggle-on', '启用插件') +
        '<label class="nsfw-checkbox-row" for="nsfw_switcher_enabled">' +
        '<input type="checkbox" id="nsfw_switcher_enabled" checked>' +
        '<span>启用NSFW检测</span>' +
        '</label></div>';
}

/** 轻量化检测模型配置 */
function buildDetectionModelSectionHtml() {
    return '<div class="nsfw-settings-section">' +
        buildSectionTitleHtml('fa-solid fa-microscope', '轻量化检测模型（判断NSFW）') +
        buildInputFieldHtml('nsfw_switcher_api_url', 'API地址', 'text', 'https://api.example.com/v1/chat/completions', true) +
        buildInputFieldHtml('nsfw_switcher_api_key', 'API密钥', 'password', 'sk-... (可选)', false) +
        buildInputFieldHtml('nsfw_switcher_model_name', '模型名称', 'text', 'nsfw-detector', false) +
        '</div>';
}

/** 切换目标模型配置 */
function buildTargetModelSectionHtml() {
    return '<div class="nsfw-settings-section">' +
        buildSectionTitleHtml('fa-solid fa-arrow-right-arrow-left', '切换目标模型（NSFW场景使用）') +
        buildInputFieldHtml('nsfw_switcher_model_a', '目标模型名称', 'text', 'gpt-4', true) +
        buildInputFieldHtml('nsfw_switcher_model_a_api_url', '目标模型API地址', 'text', 'https://api.example.com/v1/chat/completions', true) +
        buildInputFieldHtml('nsfw_switcher_model_a_api_key', '目标模型API密钥', 'password', 'sk-... (可选)', false) +
        '</div>';
}

/** 选项设置 */
function buildOptionsSectionHtml() {
    return '<div class="nsfw-settings-section">' +
        buildCheckboxFieldHtml('nsfw_switcher_show_notification', '显示切换通知', true) +
        buildCheckboxFieldHtml('nsfw_switcher_debug_mode', '调试模式（显示详细日志）', false) +
        '<div class="nsfw-field-group">' +
        '<label class="nsfw-field-label" for="nsfw_switcher_debug_level">日志级别</label>' +
        '<select id="nsfw_switcher_debug_level" class="nsfw-select">' +
        '<option value="debug">Debug（详细调试）</option>' +
        '<option value="info" selected>Info（一般信息）</option>' +
        '<option value="warn">Warn（警告）</option>' +
        '<option value="error">Error（仅错误）</option>' +
        '</select></div></div>';
}

/** 预设管理区域 */
function buildPresetSectionHtml() {
    return '<div class="nsfw-preset-area">' +
        '<div class="nsfw-preset-header" data-toggle="preset">' +
        '<div class="nsfw-section-title">' +
        '<i class="fa-solid fa-file-import"></i>NSFW 预设</div>' +
        '<div class="nsfw-preset-header-right">' +
        '<div class="nsfw-preset-actions">' +
        '<div id="nsfw_preset_import_btn" class="menu_button menu_button_icon" title="导入预设"><i class="fa-solid fa-file-import"></i></div>' +
        '<div id="nsfw_preset_export_btn" class="menu_button menu_button_icon" title="导出预设"><i class="fa-solid fa-file-export"></i></div>' +
        '<div id="nsfw_preset_delete_btn" class="menu_button menu_button_icon" title="删除预设"><i class="fa-solid fa-trash"></i></div>' +
        '</div>' +
        '<i class="fa-solid fa-chevron-down nsfw-collapse-icon"></i>' +
        '</div></div>' +
        '<div class="nsfw-preset-content" style="display:none;">' +
        '<div class="nsfw-preset-selector-row">' +
        '<select id="nsfw_preset_selector" class="nsfw-select"></select>' +
        '<div id="nsfw_preset_save_btn" class="menu_button menu_button_icon" title="保存当前预设"><i class="fa-solid fa-save"></i></div>' +
        '<div id="nsfw_preset_rename_btn" class="menu_button menu_button_icon" title="重命名预设"><i class="fa-solid fa-pen"></i></div>' +
        '<div id="nsfw_preset_new_btn" class="menu_button menu_button_icon" title="新建预设"><i class="fa-solid fa-plus"></i></div>' +
        '</div>' +
        '<div class="nsfw-preset-status" id="nsfw_switcher_preset_status">未导入预设</div>' +
        '</div></div>';
}

/** 操作按钮区域 */
function buildActionButtonsHtml() {
    return '<div class="nsfw-button-row">' +
        '<button id="nsfw_switcher_test_btn" class="nsfw-btn nsfw-btn-primary">' +
        '<i class="fa-solid fa-play"></i> 测试API</button>' +
        '<button id="nsfw_switcher_restore_btn" class="nsfw-btn nsfw-btn-secondary">' +
        '<i class="fa-solid fa-rotate-left"></i> 恢复原模型</button>' +
        '</div>';
}

/** 运行日志区域 */
function buildLogsSectionHtml() {
    return '<div class="nsfw-log-section">' +
        '<div class="nsfw-log-header" data-toggle="logs">' +
        '<div class="nsfw-section-title">' +
        '<i class="fa-solid fa-scroll"></i>运行日志</div>' +
        '<div class="nsfw-log-header-right">' +
        '<div class="nsfw-log-toolbar">' +
        '<select id="nsfw_switcher_log_level_filter" class="nsfw-select">' +
        '<option value="debug">全部</option>' +
        '<option value="info">Info+</option>' +
        '<option value="warn">Warn+</option>' +
        '<option value="error">仅Error</option>' +
        '</select>' +
        '<button id="nsfw_switcher_clear_logs_btn" class="nsfw-log-btn">' +
        '<i class="fa-solid fa-trash"></i> 清空</button>' +
        '<button id="nsfw_switcher_copy_logs_btn" class="nsfw-log-btn">' +
        '<i class="fa-solid fa-copy"></i> 复制</button>' +
        '<button id="nsfw_switcher_export_logs_btn" class="nsfw-log-btn">' +
        '<i class="fa-solid fa-download"></i> 导出</button>' +
        '</div>' +
        '<i class="fa-solid fa-chevron-down nsfw-collapse-icon"></i>' +
        '</div></div>' +
        '<div class="nsfw-log-content" style="display:none;">' +
        '<div class="nsfw-log-viewer" id="nsfw_switcher_logs">' +
        '<div class="nsfw-log-empty">暂无日志</div>' +
        '</div></div></div>';
}

/** 组装完整设置面板 HTML */
function createSettingsHtml() {
    return '<div class="inline-drawer">' +
        '<div class="inline-drawer-toggle inline-drawer-header">' +
        '<b><i class="fa-solid fa-shield-halved"></i>NSFW模型切换器</b>' +
        '<div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>' +
        '</div>' +
        '<div class="inline-drawer-content">' +
        buildStatusSectionHtml() +
        buildEnableSectionHtml() +
        buildDetectionModelSectionHtml() +
        buildTargetModelSectionHtml() +
        buildOptionsSectionHtml() +
        buildPresetSectionHtml() +
        buildActionButtonsHtml() +
        buildLogsSectionHtml() +
        '</div></div>';
}

function setupLogRendering() {
    setRenderCallback(function (logs) {
        var minLevel = (extension_settings[EXTENSION_NAME] && extension_settings[EXTENSION_NAME].debugLevel) || 'debug';
        var $c = $('#nsfw_switcher_logs');
        if ($c.length) $c.html(renderLogsHtml(logs, minLevel));
    });
}

function bindSettingsListeners($panel) {
    // 折叠/展开预设区域
    $panel.on('click', '[data-toggle="preset"]', function (e) {
        // 如果点击的是按钮，不触发折叠
        if ($(e.target).closest('.menu_button').length) return;
        var $content = $panel.find('.nsfw-preset-content');
        var $icon = $(this).find('.nsfw-collapse-icon');
        $content.slideToggle(200);
        $icon.toggleClass('nsfw-expanded');
    });

    // 折叠/展开日志区域
    $panel.on('click', '[data-toggle="logs"]', function (e) {
        if ($(e.target).closest('.menu_button, .nsfw-log-btn, .nsfw-select').length) return;
        var $content = $panel.find('.nsfw-log-content');
        var $icon = $(this).find('.nsfw-collapse-icon');
        $content.slideToggle(200);
        $icon.toggleClass('nsfw-expanded');
    });

    $panel.on('input change',
        '#nsfw_switcher_enabled, #nsfw_switcher_api_url, #nsfw_switcher_api_key, ' +
        '#nsfw_switcher_model_name, #nsfw_switcher_model_a, #nsfw_switcher_model_a_api_url, ' +
        '#nsfw_switcher_model_a_api_key, ' +
        '#nsfw_switcher_show_notification, #nsfw_switcher_debug_mode, #nsfw_switcher_debug_level',
        function () {
            collectAndSaveFromDom($panel);
            var s = loadSettings();
            if (!s.enabled && isInterceptEnabled()) setInterceptEnabled(false);
            updateIndicator();
        }
    );
    $panel.on('click', '#nsfw_switcher_test_btn', async function () {
        await testNsfwApi();
    });
    $panel.on('click', '#nsfw_switcher_restore_btn', async function () {
        setInterceptEnabled(false);
        deactivateOverrides();
        setPresetOverrides(null);
        state.onManualRestore();
        await restoreOriginalModel();
        clearSettingsSnapshot();
        addLog('手动恢复: 将使用原始模型生成', 'success');
        updateIndicator();
    });
    $panel.on('click', '#nsfw_switcher_clear_logs_btn', function () {
        clearLogs();
        addLog('日志已清空', 'info');
    });
    $panel.on('click', '#nsfw_switcher_copy_logs_btn', async function () {
        await copyLogsToClipboard('text');
    });
    $panel.on('click', '#nsfw_switcher_export_logs_btn', function () {
        var jsonStr = exportLogsAsJson();
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'nsfw-switcher-logs-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addLog('日志已导出为JSON文件', 'success');
    });

    // --- Preset Management ---
    function refreshPresetDropdown($panel) {
        var $sel = $panel.find('#nsfw_preset_selector');
        var currentVal = extension_settings[EXTENSION_NAME].activePresetName || '';
        $sel.empty().append('<option value="">-- 无预设 --</option>');
        var names = getAllPresetNames();
        for (var i = 0; i < names.length; i++) {
            $sel.append('<option value="' + escapeHtml(names[i]) + '">' + escapeHtml(names[i]) + '</option>');
        }
        $sel.val(currentVal);
        var active = getActivePreset();
        if (active) {
            $panel.find('#nsfw_switcher_preset_status').html(renderPresetModulesHtml(active.data, active.modules));
        } else {
            $panel.find('#nsfw_switcher_preset_status').text('未导入预设');
        }
    }

    $panel.on('change', '#nsfw_preset_selector', function () {
        var name = $(this).val();
        extension_settings[EXTENSION_NAME].activePresetName = name;
        saveSettingsDebounced();
        refreshPresetDropdown($panel);
        addLog('切换预设: ' + (name || '(无)'), 'info');
    });

    var $presetFileInput = $('<input type="file" accept=".json" class="nsfw-hidden">');
    $('body').append($presetFileInput);
    $panel.on('click', '#nsfw_preset_import_btn', function () { $presetFileInput.click(); });
    $presetFileInput.on('change', function (e) {
        var file = e.target.files?.[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
            try {
                var rawData = JSON.parse(ev.target.result);
                var presetData, presetName, presetModules;
                if (rawData.nsfwSwitcherPreset) {
                    presetName = rawData.name;
                    presetData = rawData.data;
                    presetModules = rawData.modules;
                } else {
                    presetName = rawData.name || rawData.display_name || file.name.replace(/\.json$/i, '');
                    presetData = rawData;
                    presetModules = buildDefaultEnabledModules(rawData);
                }
                if (extension_settings[EXTENSION_NAME].nsfwPresets[presetName]) {
                    var suffix = 1;
                    var baseName = presetName;
                    while (extension_settings[EXTENSION_NAME].nsfwPresets[presetName]) {
                        presetName = baseName + ' (' + suffix + ')';
                        suffix++;
                    }
                }
                savePresetAs(presetName, presetData, presetModules);
                refreshPresetDropdown($panel);
                if (typeof toastr !== 'undefined') toastr.success('[NSFW 模型切换器] 已导入预设: ' + presetName);
            } catch (err) {
                addLog('预设导入失败: ' + err.message, 'error');
                if (typeof toastr !== 'undefined') toastr.error('预设文件解析失败');
            }
        };
        reader.readAsText(file);
        $presetFileInput.val('');
    });

    $panel.on('click', '#nsfw_preset_export_btn', function () {
        var name = getActivePresetName();
        if (!name) { if (typeof toastr !== 'undefined') toastr.warning('请先选择一个预设'); return; }
        exportPreset(name);
    });

    $panel.on('click', '#nsfw_preset_delete_btn', function () {
        var name = getActivePresetName();
        if (!name) { if (typeof toastr !== 'undefined') toastr.warning('请先选择一个预设'); return; }
        if (!confirm('确定删除预设 "' + name + '"？')) return;
        deletePreset(name);
        refreshPresetDropdown($panel);
        if (typeof toastr !== 'undefined') toastr.info('[NSFW 模型切换器] 已删除预设: ' + name);
    });

    $panel.on('click', '#nsfw_preset_save_btn', function () {
        var name = getActivePresetName();
        if (!name) { if (typeof toastr !== 'undefined') toastr.warning('请先选择一个预设，或使用"另存为"'); return; }
        var active = getActivePreset();
        if (!active) return;
        var mods = extension_settings[EXTENSION_NAME].nsfwPresetModules || active.modules;
        savePresetAs(name, active.data, mods);
        if (typeof toastr !== 'undefined') toastr.success('[NSFW 模型切换器] 已保存预设: ' + name);
    });

    $panel.on('click', '#nsfw_preset_rename_btn', function () {
        var oldName = getActivePresetName();
        if (!oldName) { if (typeof toastr !== 'undefined') toastr.warning('请先选择一个预设'); return; }
        var newName = prompt('输入新名称:', oldName);
        if (!newName || newName === oldName) return;
        if (extension_settings[EXTENSION_NAME].nsfwPresets[newName]) {
            if (typeof toastr !== 'undefined') toastr.error('预设名称 "' + newName + '" 已存在');
            return;
        }
        renamePreset(oldName, newName);
        refreshPresetDropdown($panel);
        if (typeof toastr !== 'undefined') toastr.success('[NSFW 模型切换器] 已重命名: ' + oldName + ' → ' + newName);
    });

    $panel.on('click', '#nsfw_preset_new_btn', function () {
        var name = prompt('输入预设名称:');
        if (!name) return;
        if (extension_settings[EXTENSION_NAME].nsfwPresets[name]) {
            if (typeof toastr !== 'undefined') toastr.error('预设名称 "' + name + '" 已存在');
            return;
        }
        var active = getActivePreset();
        var data = active ? active.data : {};
        var modules = active ? active.modules : {};
        savePresetAs(name, data, modules);
        refreshPresetDropdown($panel);
        if (typeof toastr !== 'undefined') toastr.success('[NSFW 模型切换器] 已创建预设: ' + name);
    });

    refreshPresetDropdown($panel);

    // 预设模块开关（事件委托）
    $panel.on('change', '.nsfw-module-chk', function () {
        var mid = $(this).data('module');
        var checked = $(this).prop('checked');
        var mods = extension_settings[EXTENSION_NAME].nsfwPresetModules || {};
        mods[mid] = checked;
        // 同步该模块下所有字段
        $panel.find('.nsfw-field-chk[data-field^="' + mid + '_"], .nsfw-field-chk[data-field^="prompt_"]').each(function () {
            $(this).prop('checked', checked);
            mods[$(this).data('field')] = checked;
        });
        extension_settings[EXTENSION_NAME].nsfwPresetModules = mods;
        saveSettingsDebounced();
    });
    $panel.on('change', '.nsfw-field-chk', function () {
        var fid = $(this).data('field');
        var checked = $(this).prop('checked');
        var mods = extension_settings[EXTENSION_NAME].nsfwPresetModules || {};
        mods[fid] = checked;
        extension_settings[EXTENSION_NAME].nsfwPresetModules = mods;
        saveSettingsDebounced();
    });
    $panel.on('change', '#nsfw_switcher_log_level_filter', function () {
        var minLevel = $(this).val();
        var logs = getLogs();
        var $c = $panel.find('#nsfw_switcher_logs');
        if ($c.length) $c.html(renderLogsHtml(logs, minLevel));
    });
    // 点击字段行展开编辑器
    $panel.on('click', '.nsfw-field-row', function (e) {
        if ($(e.target).is('input')) return;
        var $row = $(this);
        var $existing = $row.next('.nsfw-editor');
        if ($existing.length) { $existing.slideToggle(100); return; }
        var fid = $row.data('field');
        var key = $row.data('key');
        var presetData = extension_settings[EXTENSION_NAME].nsfwPresetData;
        if (!presetData) return;
        var val = key ? presetData[key] : '';
        if (fid && fid.indexOf('prompt_') === 0) {
            var idx = parseInt(fid.split('_')[1], 10);
            if (!isNaN(idx) && presetData.prompts && presetData.prompts[idx]) val = presetData.prompts[idx].content || '';
        }
        var $editor = $('<div class="nsfw-editor" style="display:none;">' +
            '<textarea>' + escapeHtml(String(val)) + '</textarea>' +
            '<button class="nsfw-editor-save">保存</button>' +
            '</div>');
        $row.after($editor);
        $editor.slideDown(100);
        $editor.find('.nsfw-editor-save').on('click', function () {
            var newVal = $editor.find('textarea').val();
            if (fid && fid.indexOf('prompt_') === 0) {
                var idx = parseInt(fid.split('_')[1], 10);
                if (!isNaN(idx) && presetData.prompts && presetData.prompts[idx]) presetData.prompts[idx].content = newVal;
            } else if (key && presetData[key] !== undefined) {
                var num = Number(newVal);
                presetData[key] = (newVal !== '' && !isNaN(num)) ? num : (newVal === 'true' ? true : (newVal === 'false' ? false : newVal));
            }
            extension_settings[EXTENSION_NAME].nsfwPresetData = presetData;
            saveSettingsDebounced();
            var display = newVal.length > 50 ? newVal.substring(0, 50) + '...' : newVal;
            $row.find('span:last').text(display);
            addLog('已更新: ' + (key || fid), 'info');
            if (typeof toastr !== 'undefined') toastr.success('[NSFW 模型切换器] 已更新');
            $editor.slideUp(100);
        });
    });

    var updateIndicator = function () {
        var s = loadSettings();
        updateStatusIndicator(s, $panel);
        $panel.find('#nsfw_switcher_state_text').text('状态机: ' + state.getStateDescription() + (isInterceptEnabled() ? ' [拦截中]' : ''));
    };

    var initialSettings = loadSettings();
    if (initialSettings.nsfwPresetData) {
        $panel.find('#nsfw_switcher_preset_status').html(renderPresetModulesHtml(initialSettings.nsfwPresetData, initialSettings.nsfwPresetModules));
    }

    updateIndicator();
}

function registerEventListeners() {
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onMessageRendered);
    eventSource.on(event_types.GENERATION_STARTED, onGenerationStarted);
    eventSource.on(event_types.MESSAGE_SENT, onMessageSent);
    eventSource.on(event_types.EXTENSION_SETTINGS_LOADED, onSettingsLoaded);
}

async function onMessageRendered(messageId, type) {
    if (!isReady) return;
    var settings = loadSettings();
    if (!settings.enabled || type === 'user') return;
    if (detectionAbortController) detectionAbortController.abort();
    detectionAbortController = new AbortController();
    var thisDetectionId = ++currentDetectionId;
    var content = getMessageTextById(messageId) || getLastAiMessageText();
    if (!content) {
        if (settings.debugMode) addDebugLog('未找到 AI 消息内容');
        return;
    }
    if (settings.debugMode) addDebugLog('检测 AI 回复中... (长度: ' + content.length + ' 字)');
    var nsfwResult = await detectNSFW(content, detectionAbortController.signal);
    if (thisDetectionId !== currentDetectionId) return;
    if (nsfwResult === true) {
        if (state.onNsfwDetected()) { addLog('检测结果: NSFW → 下次生成将切换模型', 'warning'); saveSettingsSnapshot(); }
    } else if (nsfwResult === false) {
        if (state.onCleanDetected()) addLog('检测结果: 正常 → 下次生成将恢复原模型', 'info');
        else if (settings.debugMode) addDebugLog('检测结果: 正常，保持当前模型');
    } else {
        if (state.onDetectionFailed()) addLog('检测失败 → 下次生成将恢复原模型', 'warning');
    }
    var $c = $('#nsfw_switcher_state_text');
    if ($c.length) $c.text('状态机: ' + state.getStateDescription() + (isInterceptEnabled() ? ' [拦截中]' : ''));
}

async function onGenerationStarted(type, params, dryRun) {
    if (!isReady || dryRun) return;
    var settings = loadSettings();
    if (!settings.enabled) return;
    var action = state.getPendingAction();
    if (action === 'switch') {
        addLog('生成开始 → 启用拦截（上次回复为 NSFW）', 'info');
        var activePreset = getActivePreset();
        if (activePreset && activePreset.data) {
            var mods = extension_settings[EXTENSION_NAME].nsfwPresetModules || {};
            activateOverrides(activePreset.data, mods);
            var genParams = extractGenParams(activePreset.data);
            setPresetOverrides(genParams);
        }
        setInterceptEnabled(true);
        state.onSwitchApplied();
    } else if (action === 'restore') {
        addLog('生成开始 → 禁用拦截（上次回复正常）', 'info');
        setInterceptEnabled(false);
        deactivateOverrides();
        setPresetOverrides(null);
        state.onRestoreApplied();
    } else {
        if (settings.debugMode) addDebugLog('生成开始 → 无需操作');
    }
    var $c = $('#nsfw_switcher_state_text');
    if ($c.length) $c.text('状态机: ' + state.getStateDescription() + (isInterceptEnabled() ? ' [拦截中]' : ''));
}

async function onMessageSent(messageId) {
    if (!isReady) return;
    var settings = loadSettings();
    if (!settings.enabled || !settings.debugMode) return;
    addLog('用户发送消息 messageId=' + messageId, 'info');
}

function onSettingsLoaded() {
    var settings = loadSettings();
    addLog('设置已加载', 'info');
    var $panel = $('#nsfw_switcher_state_text').closest('.inline-drawer');
    if ($panel.length) {
        applySettingsToDom(settings, $panel);
        updateStatusIndicator(settings, $panel);
        $panel.find('#nsfw_switcher_state_text').text('状态机: ' + state.getStateDescription() + (isInterceptEnabled() ? ' [拦截中]' : ''));
    }
    isReady = true;
    addLog('插件就绪，开始监听事件', 'success');
}

$(() => {
    console.log('JQUERY_READY');
    setupLogRendering();
    initLogs();
    addLog('jQuery 就绪', 'info', 'debug');
    extension_settings[EXTENSION_NAME] = { ...DEFAULT_SETTINGS, ...extension_settings[EXTENSION_NAME] };

    // Migrate legacy single-preset to multi-preset
    (function() {
        var settings = extension_settings[EXTENSION_NAME];
        if (settings.nsfwPresetData && Object.keys(settings.nsfwPresets || {}).length === 0) {
            var name = settings.nsfwPresetData.name || settings.nsfwPresetData.display_name || '默认预设';
            settings.nsfwPresets = {};
            settings.nsfwPresets[name] = {
                data: settings.nsfwPresetData,
                modules: settings.nsfwPresetModules || {},
            };
            settings.activePresetName = name;
            saveSettingsDebounced();
        }
    })();

    state = createStateMachine();
    isReady = false;
    currentDetectionId = 0;
    detectionAbortController = null;

    initProxies();
    initFetchInterceptor();
    setOnRequestRedirected(function () { deactivateOverrides(); });


    var $panel = $('<div id="nsfw_switcher_panel">' + createSettingsHtml() + '</div>').appendTo('#extensions_settings');
    bindSettingsListeners($panel);
    registerEventListeners();

    if (extension_settings[EXTENSION_NAME]) onSettingsLoaded();

    console.log('INIT_COMPLETE');
    addLog('初始化完成', 'success');
});

window.__nsfwDebug = function () {
    var s = loadSettings();
    var logs = getLogs();
    console.log('======== NSFW 模型切换器 诊断信息 ========');
    console.log('插件已加载:', isReady);
    console.log('状态机:', state ? state.getStateDescription() : 'N/A');
    console.log('拦截器:', isInterceptEnabled() ? '启用' : '禁用');
    console.log('NSFW 预设:', s.nsfwPresetData ? (s.nsfwPresetData.name || '已导入') : '无');
    console.log('最近日志 (' + logs.length + ' 条):');
    logs.slice(0, 20).forEach(function (log) {
        console.log('  [' + log.timestamp + '] [' + log.type + '] ' + log.message);
    });
    console.log('==========================================');
};
