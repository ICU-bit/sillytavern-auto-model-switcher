console.log('NSFW_MODULE_LOADED');

import { eventSource, event_types } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { power_user } from '../../../../scripts/power-user.js';
import { addLog, addDebugLog, clearLogs, setRenderCallback, renderLogsHtml, getLogs, copyLogsToClipboard, exportLogsAsJson, initLogs } from './src/logger.js';
import { EXTENSION_NAME, DEFAULT_SETTINGS, loadSettings, collectAndSaveFromDom, applySettingsToDom, updateStatusIndicator } from './src/settings.js';
import { createStateMachine } from './src/state.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { detectNSFW, getLastAiMessageText, getMessageTextById, testNsfwApi } from './src/detector.js';
import { restoreOriginalModel, saveSettingsSnapshot, clearSettingsSnapshot } from './src/model-switcher.js';
import { initFetchInterceptor, setInterceptEnabled, isInterceptEnabled, setOnRequestRedirected, setPresetOverrides } from './src/direct-api.js';

console.log('ALL_IMPORTS_OK');
addLog('所有模块导入成功', 'info', 'debug');

var state, isReady, currentDetectionId, detectionAbortController;
var originalPresets = null;

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

function saveOriginalPresets() {
    if (originalPresets) return;
    originalPresets = {
        instruct: structuredClone(power_user.instruct),
        context: structuredClone(power_user.context),
        sysprompt: structuredClone(power_user.sysprompt),
        reasoning: structuredClone(power_user.reasoning),
    };
    addDebugLog('已保存原始预设快照');
}

function flattenMasterPreset(preset) {
    if (preset.instruct || preset.context || preset.sysprompt || preset.reasoning) {
        var flat = {};
        if (preset.instruct) Object.assign(flat, preset.instruct);
        if (preset.context) Object.assign(flat, preset.context);
        if (preset.sysprompt) Object.assign(flat, preset.sysprompt);
        if (preset.reasoning) Object.assign(flat, preset.reasoning);
        if (preset.preset) Object.assign(flat, preset.preset);
        return flat;
    }
    return preset;
}

function applyNsfwPresets(preset) {
    if (!preset) return;
    saveOriginalPresets();
    preset = flattenMasterPreset(preset);

    var mods = extension_settings[EXTENSION_NAME].nsfwPresetModules || {};

    if (mods.instruct !== false) {
        var instructFields = PRESET_MODULES.find(function(m) { return m.id === 'instruct'; }).fields;
        for (var i = 0; i < instructFields.length; i++) {
            var key = instructFields[i];
            if (preset[key] !== undefined && mods['instruct_' + key] !== false) {
                power_user.instruct[key] = preset[key];
            }
        }
        if (preset.names_behavior !== undefined && mods['instruct_names_behavior'] !== false) {
            power_user.instruct.names_behavior = typeof preset.names_behavior === 'number'
                ? (['none', 'force', 'always'])[preset.names_behavior] || 'force'
                : preset.names_behavior;
        }
        if (preset.wrap_in_quotes !== undefined && mods['instruct_wrap'] !== false) {
            power_user.instruct.wrap = preset.wrap_in_quotes;
        }
    }

    if (mods.context !== false) {
        var contextModule = PRESET_MODULES.find(function(m) { return m.id === 'context'; });
        for (var i = 0; i < contextModule.fields.length; i++) {
            var key = contextModule.fields[i];
            if (preset[key] !== undefined && mods['context_' + key] !== false) {
                if (['always_force_name2', 'trim_sentences', 'single_line'].indexOf(key) !== -1) {
                    power_user[key] = preset[key];
                } else {
                    power_user.context[key] = preset[key];
                }
            }
        }
    }

    if (mods.sysprompt !== false) {
        var syspromptFields = PRESET_MODULES.find(function(m) { return m.id === 'sysprompt'; }).fields;
        for (var i = 0; i < syspromptFields.length; i++) {
            var key = syspromptFields[i];
            if (preset[key] !== undefined && mods['sysprompt_' + key] !== false) {
                power_user.sysprompt[key] = preset[key];
            }
        }
    }

    if (mods.reasoning !== false) {
        var reasoningFields = PRESET_MODULES.find(function(m) { return m.id === 'reasoning'; }).fields;
        for (var i = 0; i < reasoningFields.length; i++) {
            var key = reasoningFields[i];
            if (preset[key] !== undefined && mods['reasoning_' + key] !== false) {
                power_user.reasoning[key] = preset[key];
            }
        }
    }

    if (mods.prompts !== false && Array.isArray(preset.prompts)) {
        addLog('检测到自定义提示词 (' + preset.prompts.length + ' 个)，已跳过', 'info');
    }

    addLog('已应用 NSFW 预设: ' + (preset.name || preset.display_name || '未命名'), 'info');
}

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPresetModulesHtml(preset, enabled) {
    if (!preset) return '<div style="font-size:12px;color:#888;">未导入预设</div>';
    var name = preset.name || preset.display_name || '未命名预设';
    var html = '<div style="font-size:12px;font-weight:600;color:#333;margin-bottom:6px;">已导入: <span style="color:#27ae60;">' + name + '</span></div>';
    html += '<div class="nsfw-preset-modules" style="border:1px solid #ddd;border-radius:4px;overflow:hidden;">';
    for (var mi = 0; mi < PRESET_MODULES.length; mi++) {
        var m = PRESET_MODULES[mi];
        if (!m.test(preset)) continue;
        var modOn = !enabled || enabled[m.id] !== false;
        html += '<div style="border-bottom:1px solid #eee;">';
        html += '<div class="nsfw-module-header" data-module="' + m.id + '" style="padding:5px 8px;background:#f5f5f5;font-size:12px;font-weight:600;display:flex;align-items:center;gap:8px;border-bottom:1px solid #eee;">' +
            '<input type="checkbox" class="nsfw-module-chk" data-module="' + m.id + '" ' + (modOn ? 'checked' : '') + ' style="margin:0;">' +
            m.name + '</div>';

        if (m.id === 'prompts' && Array.isArray(preset.prompts)) {
            for (var pi = 0; pi < preset.prompts.length; pi++) {
                var pp = preset.prompts[pi];
                var pfId = 'prompt_' + pi;
                var pfOn = enabled && enabled[pfId] !== false;
                html += '<div class="nsfw-field-row" data-field="' + pfId + '" style="padding:3px 8px 3px 24px;font-size:11px;color:#555;display:flex;align-items:center;gap:6px;cursor:pointer;">' +
                    '<input type="checkbox" class="nsfw-field-chk" data-field="' + pfId + '" ' + (pfOn ? 'checked' : '') + ' style="margin:0;cursor:pointer;">' +
                    '<span style="color:#333;">' + escapeHtml(pp.name || '(未命名)') + '</span></div>';
            }
        } else if (m.fields) {
            for (var fi = 0; fi < m.fields.length; fi++) {
                var fk = m.fields[fi];
                if (preset[fk] !== undefined) {
                    var fId = m.id + '_' + fk;
                    var fOn = enabled && enabled[fId] !== false;
                    var val = String(preset[fk]);
                    if (val.length > 80) val = val.substring(0, 80) + '...';
                    html += '<div class="nsfw-field-row" data-field="' + fId + '" data-key="' + fk + '" style="padding:3px 8px 3px 24px;font-size:11px;color:#555;display:flex;align-items:center;gap:6px;cursor:pointer;">' +
                        '<input type="checkbox" class="nsfw-field-chk" data-field="' + fId + '" ' + (fOn ? 'checked' : '') + ' style="margin:0;cursor:pointer;">' +
                        '<span style="color:#888;flex-shrink:0;">' + fk + ':</span>' +
                        '<span style="color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(val) + '</span></div>';
                }
            }
        }
        html += '</div>';
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

function restoreOriginalPresets() {
    if (!originalPresets) return;
    if (originalPresets.instruct) Object.assign(power_user.instruct, originalPresets.instruct);
    if (originalPresets.context) Object.assign(power_user.context, originalPresets.context);
    if (originalPresets.sysprompt) Object.assign(power_user.sysprompt, originalPresets.sysprompt);
    if (originalPresets.reasoning) Object.assign(power_user.reasoning, originalPresets.reasoning);
    originalPresets = null;
    addLog('已恢复原始预设', 'info');
}

function createSettingsHtml() {
    return '<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b><i class="fa-solid fa-shield-halved" style="margin-right: 8px;"></i>NSFW模型切换器</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div></div><div class="inline-drawer-content"><div style="padding: 15px;"><div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px;"><div id="nsfw_switcher_status_indicator" style="width: 10px; height: 10px; border-radius: 50%; background: #f39c12;"></div><div><strong>状态:</strong><span id="nsfw_switcher_status_text">启动中...</span><span id="nsfw_switcher_state_text" style="margin-left: 12px; font-size: 12px; color: #888;"></span></div></div>' +
        '<div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;"><div style="font-weight: 600; color: #333; margin-bottom: 10px;"><i class="fa-solid fa-toggle-on" style="margin-right: 8px;"></i>启用插件</div><label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="nsfw_switcher_enabled" checked><span>启用NSFW检测</span></label></div>' +
        '<div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;"><div style="font-weight: 600; color: #333; margin-bottom: 10px;"><i class="fa-solid fa-microscope" style="margin-right: 8px;"></i>轻量化检测模型（判断NSFW）</div>' +
        '<div style="margin-bottom: 12px;"><label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">API地址 <span style="color: #e74c3c;">*</span></label><input type="text" id="nsfw_switcher_api_url" style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;" placeholder="https://api.example.com/v1/chat/completions"></div>' +
        '<div style="margin-bottom: 12px;"><label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">API密钥</label><input type="password" id="nsfw_switcher_api_key" style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;" placeholder="sk-... (可选)"></div>' +
        '<div style="margin-bottom: 12px;"><label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">模型名称</label><input type="text" id="nsfw_switcher_model_name" style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;" placeholder="nsfw-detector"></div></div>' +
        '<div style="margin-bottom: 15px;"><div style="font-weight: 600; color: #333; margin-bottom: 10px;"><i class="fa-solid fa-arrow-right-arrow-left" style="margin-right: 8px;"></i>切换目标模型（NSFW场景使用）</div>' +
        '<div style="margin-bottom: 12px;"><label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">目标模型名称 <span style="color: #e74c3c;">*</span></label><input type="text" id="nsfw_switcher_model_a" style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;" placeholder="gpt-4"></div>' +
        '<div style="margin-bottom: 12px;"><label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">目标模型API地址 <span style="color: #e74c3c;">*</span></label><input type="text" id="nsfw_switcher_model_a_api_url" style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;" placeholder="https://api.example.com/v1/chat/completions"></div>' +
        '<div style="margin-bottom: 12px;"><label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">目标模型API密钥</label><input type="password" id="nsfw_switcher_model_a_api_key" style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;" placeholder="sk-... (可选)"></div>' +
        '<div style="margin-bottom: 12px;"><label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="nsfw_switcher_show_notification" checked><span style="font-size: 13px;">显示切换通知</span></label></div>' +
        '<div style="margin-bottom: 12px;"><label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="nsfw_switcher_debug_mode"><span style="font-size: 13px;">调试模式（显示详细日志）</span></label></div><div style="margin-bottom: 12px;"><label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">日志级别</label><select id="nsfw_switcher_debug_level" style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;"><option value="debug">Debug（详细调试）</option><option value="info" selected>Info（一般信息）</option><option value="warn">Warn（警告）</option><option value="error">Error（仅错误）</option></select></div></div>' +
        '<div style="margin-bottom: 15px; padding: 12px; background: #f8f9fa; border-radius: 4px;"><div style="font-weight: 600; color: #333; margin-bottom: 10px;"><i class="fa-solid fa-file-import" style="margin-right: 8px;"></i>NSFW 预设（导入酒馆预设文件）</div><div style="margin-bottom: 8px; font-size: 12px; color: #666;">导入一个酒馆预设文件（OpenAI Settings / Instruct / Context / Sysprompt / Reasoning），切换 NSFW 模型时自动应用。</div><div style="display: flex; gap: 8px; align-items: center;"><button id="nsfw_switcher_import_preset_btn" style="flex: 1; padding: 8px 12px; border: none; border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer; background: #667eea; color: white;"><i class="fa-solid fa-upload"></i> 导入预设</button><button id="nsfw_switcher_remove_preset_btn" style="padding: 8px 12px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; background: #e74c3c; color: white;"><i class="fa-solid fa-trash"></i> 移除</button></div><div id="nsfw_switcher_preset_status" style="margin-top: 8px; font-size: 12px; color: #888;">未导入预设</div></div>' +
        '<div style="display: flex; gap: 10px; margin-bottom: 10px;"><button id="nsfw_switcher_test_btn" style="flex: 1; padding: 8px 12px; border: none; border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer; background: #667eea; color: white;"><i class="fa-solid fa-play"></i> 测试API</button><button id="nsfw_switcher_restore_btn" style="flex: 1; padding: 8px 12px; border: none; border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer; background: #e0e0e0; color: #555;"><i class="fa-solid fa-rotate-left"></i> 恢复原模型</button></div>' +
        '<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;"><div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;"><div style="font-weight: 600; color: #333;"><i class="fa-solid fa-scroll" style="margin-right: 8px;"></i>运行日志</div><div style="display: flex; gap: 6px; align-items: center;"><select id="nsfw_switcher_log_level_filter" style="padding: 2px 4px; border: 1px solid #ddd; border-radius: 3px; font-size: 11px; background: #f5f5f5; color: #666;"><option value="debug">全部</option><option value="info">Info+</option><option value="warn">Warn+</option><option value="error">仅Error</option></select><button id="nsfw_switcher_clear_logs_btn" style="padding: 4px 8px; border: none; border-radius: 3px; font-size: 11px; cursor: pointer; background: #f5f5f5; color: #666;"><i class="fa-solid fa-trash"></i> 清空</button><button id="nsfw_switcher_copy_logs_btn" style="padding: 4px 8px; border: none; border-radius: 3px; font-size: 11px; cursor: pointer; background: #f5f5f5; color: #666;"><i class="fa-solid fa-copy"></i> 复制</button><button id="nsfw_switcher_export_logs_btn" style="padding: 4px 8px; border: none; border-radius: 3px; font-size: 11px; cursor: pointer; background: #f5f5f5; color: #666;"><i class="fa-solid fa-download"></i> 导出</button></div></div><div id="nsfw_switcher_logs" style="max-height: 200px; overflow-y: auto; background: #fafafa; border-radius: 4px; padding: 10px; font-family: monospace;"><div style="color: #999; font-size: 12px; text-align: center;">暂无日志</div></div></div></div></div>';
}

function setupLogRendering() {
    setRenderCallback(function (logs) {
        var minLevel = (extension_settings[EXTENSION_NAME] && extension_settings[EXTENSION_NAME].debugLevel) || 'debug';
        var $c = $('#nsfw_switcher_logs');
        if ($c.length) $c.html(renderLogsHtml(logs, minLevel));
    });
}

function bindSettingsListeners($panel) {
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

    var $fileInput = $('<input type="file" accept=".json" style="display:none">');
    $('body').append($fileInput);
    $panel.on('click', '#nsfw_switcher_import_preset_btn', function () { $fileInput.click(); });
    $fileInput.on('change', function (e) {
        var file = e.target.files?.[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
            try {
                var data = JSON.parse(ev.target.result);
                extension_settings[EXTENSION_NAME].nsfwPresetData = data;
                extension_settings[EXTENSION_NAME].nsfwPresetModules = buildDefaultEnabledModules(data);
                saveSettingsDebounced();
                var name = data.name || data.display_name || file.name;
                $panel.find('#nsfw_switcher_preset_status').html(renderPresetModulesHtml(data, buildDefaultEnabledModules(data)));
                addLog('已导入预设: ' + name, 'success');
                if (typeof toastr !== 'undefined') toastr.success('[NSFW 模型切换器] 已导入预设: ' + name);
            } catch (err) {
                addLog('预设导入失败: ' + err.message, 'error');
                if (typeof toastr !== 'undefined') toastr.error('预设文件解析失败，请确认是有效的 JSON 格式');
            }
        };
        reader.readAsText(file);
        $fileInput.val('');
    });
    $panel.on('click', '#nsfw_switcher_remove_preset_btn', function () {
        extension_settings[EXTENSION_NAME].nsfwPresetData = null;
        extension_settings[EXTENSION_NAME].nsfwPresetModules = null;
        saveSettingsDebounced();
        $panel.find('#nsfw_switcher_preset_status').text('未导入预设');
        addLog('已移除 NSFW 预设', 'info');
        if (typeof toastr !== 'undefined') toastr.info('[NSFW 模型切换器] 已移除 NSFW 预设');
    });

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
        var $editor = $('<div class="nsfw-editor" style="padding:4px 8px 8px 32px;display:none;">' +
            '<textarea style="width:100%;min-height:40px;font-size:11px;padding:4px;border:1px solid #ddd;border-radius:3px;box-sizing:border-box;font-family:monospace;">' + escapeHtml(String(val)) + '</textarea>' +
            '<button class="nsfw-editor-save" style="margin-top:4px;padding:3px 10px;font-size:11px;background:#27ae60;color:white;border:none;border-radius:3px;cursor:pointer;">保存</button>' +
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
        if (settings.nsfwPresetData) {
            applyNsfwPresets(settings.nsfwPresetData);
            var genParams = extractGenParams(settings.nsfwPresetData);
            if (genParams) {
                Object.keys(genParams).forEach(function(key) {
                    if (key !== 'stream_openai') power_user[key] = genParams[key];
                });
            }
            setPresetOverrides(genParams);
        }
        setInterceptEnabled(true);
        state.onSwitchApplied();
    } else if (action === 'restore') {
        addLog('生成开始 → 禁用拦截（上次回复正常）', 'info');
        setInterceptEnabled(false);
        restoreOriginalPresets();
        setPresetOverrides(null);
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

    state = createStateMachine();
    isReady = false;
    currentDetectionId = 0;
    detectionAbortController = null;

    initFetchInterceptor();
    setOnRequestRedirected(function () { restoreOriginalPresets(); });


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
