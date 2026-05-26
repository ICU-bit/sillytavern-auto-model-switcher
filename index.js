console.log('NSFW_MODULE_LOADED');

import { eventSource, event_types } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { power_user } from '../../../../scripts/power-user.js';
import { addLog, clearLogs, setRenderCallback, renderLogsHtml, getLogs } from './src/logger.js';
import { EXTENSION_NAME, DEFAULT_SETTINGS, loadSettings, collectAndSaveFromDom, applySettingsToDom, updateStatusIndicator } from './src/settings.js';
import { createStateMachine } from './src/state.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { detectNSFW, getLastAiMessageText, getMessageTextById, testNsfwApi } from './src/detector.js';
import { restoreOriginalModel, saveSettingsSnapshot, clearSettingsSnapshot } from './src/model-switcher.js';
import { initFetchInterceptor, setInterceptEnabled, isInterceptEnabled, setOnRequestRedirected, setPresetOverrides } from './src/direct-api.js';

console.log('ALL_IMPORTS_OK');

var state, isReady, currentDetectionId, detectionAbortController;
var originalPresets = null;

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
}

function applyNsfwPresets(preset) {
    if (!preset) return;
    saveOriginalPresets();
    if (preset.names_behavior !== undefined) {
        power_user.instruct.names_behavior = typeof preset.names_behavior === 'number'
            ? (['none', 'force', 'always'])[preset.names_behavior] || 'force'
            : preset.names_behavior;
    }
    if (preset.wrap_in_quotes !== undefined) power_user.instruct.wrap = preset.wrap_in_quotes;
    if (preset.input_sequence !== undefined) Object.assign(power_user.instruct, preset);
    if (preset.story_string !== undefined) Object.assign(power_user.context, preset);
    if (preset.content !== undefined && preset.name !== undefined) Object.assign(power_user.sysprompt, preset);
    if (preset.prefix !== undefined && preset.suffix !== undefined) Object.assign(power_user.reasoning, preset);
}

function restoreOriginalPresets() {
    if (!originalPresets) return;
    if (originalPresets.instruct) Object.assign(power_user.instruct, originalPresets.instruct);
    if (originalPresets.context) Object.assign(power_user.context, originalPresets.context);
    if (originalPresets.sysprompt) Object.assign(power_user.sysprompt, originalPresets.sysprompt);
    if (originalPresets.reasoning) Object.assign(power_user.reasoning, originalPresets.reasoning);
    originalPresets = null;
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
        '<div style="margin-bottom: 12px;"><label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" id="nsfw_switcher_debug_mode"><span style="font-size: 13px;">调试模式（显示详细日志）</span></label></div></div>' +
        '<div style="margin-bottom: 15px; padding: 12px; background: #f8f9fa; border-radius: 4px;"><div style="font-weight: 600; color: #333; margin-bottom: 10px;"><i class="fa-solid fa-file-import" style="margin-right: 8px;"></i>NSFW 预设（导入酒馆预设文件）</div><div style="margin-bottom: 8px; font-size: 12px; color: #666;">导入一个酒馆预设文件（OpenAI Settings / Instruct / Context / Sysprompt / Reasoning），切换 NSFW 模型时自动应用。</div><div style="display: flex; gap: 8px; align-items: center;"><button id="nsfw_switcher_import_preset_btn" style="flex: 1; padding: 8px 12px; border: none; border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer; background: #667eea; color: white;"><i class="fa-solid fa-upload"></i> 导入预设</button><button id="nsfw_switcher_remove_preset_btn" style="padding: 8px 12px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; background: #e74c3c; color: white;"><i class="fa-solid fa-trash"></i> 移除</button></div><div id="nsfw_switcher_preset_status" style="margin-top: 8px; font-size: 12px; color: #888;">未导入预设</div></div>' +
        '<div style="display: flex; gap: 10px; margin-bottom: 10px;"><button id="nsfw_switcher_test_btn" style="flex: 1; padding: 8px 12px; border: none; border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer; background: #667eea; color: white;"><i class="fa-solid fa-play"></i> 测试API</button><button id="nsfw_switcher_restore_btn" style="flex: 1; padding: 8px 12px; border: none; border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer; background: #e0e0e0; color: #555;"><i class="fa-solid fa-rotate-left"></i> 恢复原模型</button></div>' +
        '<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;"><div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;"><div style="font-weight: 600; color: #333;"><i class="fa-solid fa-scroll" style="margin-right: 8px;"></i>运行日志</div><button id="nsfw_switcher_clear_logs_btn" style="padding: 4px 8px; border: none; border-radius: 3px; font-size: 11px; cursor: pointer; background: #f5f5f5; color: #666;"><i class="fa-solid fa-trash"></i> 清空</button></div><div id="nsfw_switcher_logs" style="max-height: 200px; overflow-y: auto; background: #fafafa; border-radius: 4px; padding: 10px; font-family: monospace;"><div style="color: #999; font-size: 12px; text-align: center;">暂无日志</div></div></div></div></div>';
}

function setupLogRendering() {
    setRenderCallback(function (logs) {
        var $c = $('#nsfw_switcher_logs');
        if ($c.length) $c.html(renderLogsHtml(logs));
    });
}

function bindSettingsListeners($panel) {
    $panel.on('input change',
        '#nsfw_switcher_enabled, #nsfw_switcher_api_url, #nsfw_switcher_api_key, ' +
        '#nsfw_switcher_model_name, #nsfw_switcher_model_a, #nsfw_switcher_model_a_api_url, ' +
        '#nsfw_switcher_model_a_api_key, ' +
        '#nsfw_switcher_show_notification, #nsfw_switcher_debug_mode',
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
                saveSettingsDebounced();
                var name = data.name || data.display_name || file.name;
                $panel.find('#nsfw_switcher_preset_status').html('<span style="color: #27ae60;">已导入: <b>' + name + '</b></span>');
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
        saveSettingsDebounced();
        $panel.find('#nsfw_switcher_preset_status').text('未导入预设');
        addLog('已移除 NSFW 预设', 'info');
        if (typeof toastr !== 'undefined') toastr.info('[NSFW 模型切换器] 已移除 NSFW 预设');
    });

    var updateIndicator = function () {
        var s = loadSettings();
        updateStatusIndicator(s, $panel);
        $panel.find('#nsfw_switcher_state_text').text('状态机: ' + state.getStateDescription() + (isInterceptEnabled() ? ' [拦截中]' : ''));
    };

    var initialSettings = loadSettings();
    if (initialSettings.nsfwPresetData) {
        var presetName = initialSettings.nsfwPresetData.name || initialSettings.nsfwPresetData.display_name || '已导入';
        $panel.find('#nsfw_switcher_preset_status').html('<span style="color: #27ae60;">已导入: <b>' + presetName + '</b></span>');
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
        if (settings.debugMode) addLog('未找到 AI 消息内容', 'info');
        return;
    }
    if (settings.debugMode) addLog('检测 AI 回复中... (长度: ' + content.length + ' 字)', 'info');
    var nsfwResult = await detectNSFW(content, detectionAbortController.signal);
    if (thisDetectionId !== currentDetectionId) return;
    if (nsfwResult === true) {
        if (state.onNsfwDetected()) { addLog('检测结果: NSFW → 下次生成将切换模型', 'warning'); saveSettingsSnapshot(); }
    } else if (nsfwResult === false) {
        if (state.onCleanDetected()) addLog('检测结果: 正常 → 下次生成将恢复原模型', 'info');
        else if (settings.debugMode) addLog('检测结果: 正常，保持当前模型', 'info');
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
            setPresetOverrides(extractGenParams(settings.nsfwPresetData));
        }
        setInterceptEnabled(true);
        state.onSwitchApplied();
    } else if (action === 'restore') {
        addLog('生成开始 → 禁用拦截（上次回复正常）', 'info');
        setInterceptEnabled(false);
        restoreOriginalPresets();
        setPresetOverrides(null);
    } else {
        if (settings.debugMode) addLog('生成开始 → 无需操作', 'info');
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
    extension_settings[EXTENSION_NAME] = { ...DEFAULT_SETTINGS, ...extension_settings[EXTENSION_NAME] };

    state = createStateMachine();
    isReady = false;
    currentDetectionId = 0;
    detectionAbortController = null;

    initFetchInterceptor();
    setOnRequestRedirected(function () { restoreOriginalPresets(); });

    setupLogRendering();

    var $panel = $('<div id="nsfw_switcher_panel">' + createSettingsHtml() + '</div>').appendTo('#extensions_settings');
    bindSettingsListeners($panel);
    registerEventListeners();

    if (extension_settings[EXTENSION_NAME]) onSettingsLoaded();

    console.log('INIT_COMPLETE');
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
