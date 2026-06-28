console.log('NSFW_MODULE_LOADED');
import { saveSettingsDebounced } from '../../../../../script.js';
import { extension_settings } from '../../../../extensions.js';
import { addLog, clearLogs, setRenderCallback, renderLogsHtml, renderLogEntryHtml, getLogs, initLogs } from './logger.js';
import { EXTENSION_NAME, DEFAULT_SETTINGS, loadSettings, collectAndSaveFromDom, updateStatusIndicator, getAllPresetNames, getActivePreset, getActivePresetName, savePresetAs, deletePreset, renamePreset, exportPreset } from './settings.js';
import { createStateMachine } from './state.js';
import { createCoordinator } from './coordinator.js';
import { testNsfwApi } from './detector.js';
import { initFetchInterceptor, isInterceptEnabled, setOnRequestRedirected } from './direct-api.js';
import { initProxies } from './preset-proxy.js';
// Inlined from mobile.ts: prefers-reduced-motion 检测
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Phase 4 Batch C: utility 模块
import { escapeHtml } from './logger.js';
import { getSettingsRoot } from './settings.js';
import { registerEventHandlers, callOnSettingsLoadedNow } from './event-handlers.js';
console.log('ALL_IMPORTS_OK');
addLog('所有模块导入成功', 'info', 'debug');
// ===== 模块级状态 =====
let state;
let coordinator;
let isReady = false;
// ---------------------------------------------------------------------------
//  Settings HTML — Section Builders
// ---------------------------------------------------------------------------
/** 构建表单输入字段 HTML (label + input) */
function buildInputFieldHtml(id, labelText, type, placeholder, required) {
    const reqMark = required ? ' <span class="required">*</span>' : '';
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
    setRenderCallback(function (logs, newLog) {
        const $c = $('#nsfw_switcher_logs');
        if (!$c.length)
            return;
        const root = getSettingsRoot();
        const minLevel = (root && root.debugLevel) || 'info';
        // 如果有新日志条目且级别足够，prepend 到顶部（避免全量重建）
        if (newLog && shouldShowLog(newLog, minLevel)) {
            $c.find('.nsfw-log-empty').remove();
            $c.prepend(renderLogEntryHtml(newLog));
            // 限制 DOM 中的条目数
            while ($c.children().length > 200)
                $c.children().last().remove();
        }
        else {
            // 全量重建（初始化或级别过滤变更时）
            $c.html(renderLogsHtml(logs, minLevel));
        }
    });
}
function shouldShowLog(log, minLevel) {
    const priority = { debug: 0, info: 1, warn: 2, error: 3 };
    return (priority[log.level] ?? 0) >= (priority[minLevel] ?? 0);
}
function bindSettingsListeners($panel) {
    // 折叠/展开预设区域
    $panel.on('click', '[data-toggle="preset"]', function (e) {
        // 如果点击的是按钮，不触发折叠
        if ($(e.target).closest('.menu_button').length)
            return;
        const $content = $panel.find('.nsfw-preset-content');
        const $icon = $(this).find('.nsfw-collapse-icon');
        $content.slideToggle(200);
        $icon.toggleClass('nsfw-expanded');
    });
    // 折叠/展开日志区域
    $panel.on('click', '[data-toggle="logs"]', function (e) {
        if ($(e.target).closest('.menu_button, .nsfw-log-btn, .nsfw-select').length)
            return;
        const $content = $panel.find('.nsfw-log-content');
        const $icon = $(this).find('.nsfw-collapse-icon');
        $content.slideToggle(200);
        $icon.toggleClass('nsfw-expanded');
    });
    $panel.on('input change', '#nsfw_switcher_enabled, #nsfw_switcher_api_url, #nsfw_switcher_api_key, ' +
        '#nsfw_switcher_model_name, #nsfw_switcher_model_a, #nsfw_switcher_model_a_api_url, ' +
        '#nsfw_switcher_model_a_api_key, ' +
        '#nsfw_switcher_show_notification, #nsfw_switcher_debug_mode, #nsfw_switcher_debug_level', function () {
        collectAndSaveFromDom($panel);
        const s = loadSettings();
        // Phase 4 Batch B Step 6: 接管 Path D (plugin off)
        // 旧实现: 只关 fetch, 不动 Proxy/state → BUG-3 (30s 后才兜底)
        // 新实现: coordinator.disable('plugin_off') 同时关 fetch + Proxy + 
        //          presetOverrides + 通知 state 回 IDLE
        if (!s.enabled && coordinator.isActive()) {
            coordinator.disable('plugin_off');
        }
        updateIndicator();
    });
    $panel.on('click', '#nsfw_switcher_test_btn', async function () {
        await testNsfwApi();
    });
    $panel.on('click', '#nsfw_switcher_restore_btn', async function () {
        // Phase 4 Batch B Step 5: 接管 Path C (manual restore)
        // 先转换 state, 让 coordinator 自动 disable (订阅 IDLE 进入)
        // 这里 state.onManualRestore 触发 transition → handleTransition →
        //     runtime.kind !== 'idle' 时 applyDisable() 关三层
        // 若 state 已是 IDLE (协调器未激活), 也 fallback 调 disable('manual') 保证幂等
        state.onManualRestore();
        coordinator.disable('manual'); // 幂等, 兜底关闭
        addLog('手动恢复: 将使用原始模型生成', 'success');
        updateIndicator();
    });
    $panel.on('click', '#nsfw_switcher_clear_logs_btn', function () {
        clearLogs();
        addLog('日志已清空', 'info');
    });
    // --- Preset Management ---
    function refreshPresetDropdown($panel) {
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
        }
        else {
            $panel.find('#nsfw_switcher_preset_status').text('未导入预设');
        }
    }
    $panel.on('change', '#nsfw_preset_selector', function () {
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
    $presetFileInput.on('change', function (e) {
        const target = e.target;
        const file = target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = function (ev) {
            try {
                const result = ev.target?.result;
                if (typeof result !== 'string')
                    return;
                // M1 修复: 用 reviver 过滤 __proto__ / constructor / prototype 等危险键,
                // 防止恶意预设文件污染对象原型 (CVE-2018-3721 类问题)。
                const rawData = JSON.parse(result, (key, value) => {
                    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                        return undefined;
                    }
                    return value;
                });
                let presetData;
                let presetName;
                let presetModules;
                if (rawData.nsfwSwitcherPreset) {
                    presetName = String(rawData.name || '');
                    presetData = rawData.data || {};
                    presetModules = rawData.modules || {};
                }
                else {
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
                if (typeof toastr !== 'undefined')
                    toastr.success('[NSFW 模型切换器] 已导入预设: ' + presetName);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                addLog('预设导入失败: ' + msg, 'error');
                if (typeof toastr !== 'undefined')
                    toastr.error('预设文件解析失败');
            }
        };
        reader.readAsText(file);
        $presetFileInput.val('');
    });
    $panel.on('click', '#nsfw_preset_export_btn', function () {
        var name = getActivePresetName();
        if (!name) {
            if (typeof toastr !== 'undefined')
                toastr.warning('请先选择一个预设');
            return;
        }
        exportPreset(name);
    });
    $panel.on('click', '#nsfw_preset_delete_btn', async function () {
        var name = getActivePresetName();
        if (!name) {
            if (typeof toastr !== 'undefined')
                toastr.warning('请先选择一个预设');
            return;
        }
        if (!confirm('确定删除预设 "' + name + '"？'))
            return;
        deletePreset(name);
        refreshPresetDropdown($panel);
        if (typeof toastr !== 'undefined')
            toastr.info('[NSFW 模型切换器] 已删除预设: ' + name);
    });
    $panel.on('click', '#nsfw_preset_save_btn', function () {
        const name = getActivePresetName();
        if (!name) {
            if (typeof toastr !== 'undefined')
                toastr.warning('请先选择一个预设，或使用"另存为"');
            return;
        }
        const active = getActivePreset();
        if (!active)
            return;
        const root = getSettingsRoot();
        const mods = root.nsfwPresetModules || active.modules;
        savePresetAs(name, active.data, mods);
        if (typeof toastr !== 'undefined')
            toastr.success('[NSFW 模型切换器] 已保存预设: ' + name);
    });
    $panel.on('click', '#nsfw_preset_rename_btn', async function () {
        const oldName = getActivePresetName();
        if (!oldName) {
            if (typeof toastr !== 'undefined')
                toastr.warning('请先选择一个预设');
            return;
        }
        const newName = prompt('输入新名称:', oldName);
        if (!newName || newName === oldName)
            return;
        if (getSettingsRoot().nsfwPresets[newName]) {
            if (typeof toastr !== 'undefined')
                toastr.error('预设名称 "' + newName + '" 已存在');
            return;
        }
        renamePreset(oldName, newName);
        refreshPresetDropdown($panel);
        if (typeof toastr !== 'undefined')
            toastr.success('[NSFW 模型切换器] 已重命名: ' + oldName + ' → ' + newName);
    });
    $panel.on('click', '#nsfw_preset_new_btn', async function () {
        const name = prompt('输入预设名称:');
        if (!name)
            return;
        if (getSettingsRoot().nsfwPresets[name]) {
            if (typeof toastr !== 'undefined')
                toastr.error('预设名称 "' + name + '" 已存在');
            return;
        }
        const active = getActivePreset();
        const data = active ? active.data : {};
        const modules = active ? active.modules : {};
        savePresetAs(name, data, modules);
        refreshPresetDropdown($panel);
        if (typeof toastr !== 'undefined')
            toastr.success('[NSFW 模型切换器] 已创建预设: ' + name);
    });
    refreshPresetDropdown($panel);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        $panel.addClass('nsfw-reduced-motion');
    }
    // 预设模块开关（事件委托）
    $panel.on('change', '.nsfw-module-chk', function () {
        const mid = String($(this).data('module'));
        const checked = Boolean($(this).prop('checked'));
        const root = getSettingsRoot();
        const mods = root.nsfwPresetModules || {};
        mods[mid] = checked;
        // 只同步该模块下所有字段（避免跨模块误选）
        $panel.find('.nsfw-field-chk[data-field^="' + mid + '_"]').each(function () {
            $(this).prop('checked', checked);
            mods[String($(this).data('field'))] = checked;
        });
        // prompts 模块特殊处理
        if (mid === 'prompts') {
            $panel.find('.nsfw-field-chk[data-field^="prompt_"]').each(function () {
                $(this).prop('checked', checked);
                mods[String($(this).data('field'))] = checked;
            });
        }
        root.nsfwPresetModules = mods;
        saveSettingsDebounced();
    });
    $panel.on('change', '.nsfw-field-chk', function () {
        const fid = String($(this).data('field'));
        const checked = Boolean($(this).prop('checked'));
        const root = getSettingsRoot();
        const mods = root.nsfwPresetModules || {};
        mods[fid] = checked;
        root.nsfwPresetModules = mods;
        saveSettingsDebounced();
    });
    $panel.on('change', '#nsfw_switcher_log_level_filter', function () {
        const minLevel = String($(this).val() || 'debug');
        const logs = getLogs();
        const $c = $panel.find('#nsfw_switcher_logs');
        if ($c.length)
            $c.html(renderLogsHtml(logs, minLevel));
    });
    // 点击字段行展开编辑器
    $panel.on('click', '.nsfw-field-row', function (e) {
        if ($(e.target).is('input'))
            return;
        const $row = $(this);
        const $existing = $row.next('.nsfw-editor');
        if ($existing.length) {
            $existing.slideToggle(100);
            return;
        }
        const fid = String($row.data('field') || '');
        const key = String($row.data('key') || '');
        // 优先用当前激活预设（多预设系统），回退到 legacy nsfwPresetData
        // 修复：原代码只写 legacy 字段, 导致多预设场景下编辑不会持久化
        const activePreset = getActivePreset();
        const presetData = activePreset
            ? activePreset.data
            : getSettingsRoot().nsfwPresetData;
        if (!presetData)
            return;
        let val = key ? presetData[key] : '';
        if (fid && fid.indexOf('prompt_') === 0) {
            const idx = parseInt(fid.split('_')[1], 10);
            const prompts = presetData.prompts;
            if (!isNaN(idx) && prompts && prompts[idx])
                val = prompts[idx].content || '';
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
                const prompts = presetData.prompts;
                if (!isNaN(idx) && prompts && prompts[idx])
                    prompts[idx].content = newVal;
            }
            else if (key && presetData[key] !== undefined) {
                const num = Number(newVal);
                presetData[key] = (newVal !== '' && !isNaN(num)) ? num : (newVal === 'true' ? true : (newVal === 'false' ? false : newVal));
            }
            // 修复：写回当前激活预设的 data, 不再写 legacy nsfwPresetData
            // 持久化 (savePresetAs 内部会调 saveSettingsDebounced)
            if (activePreset) {
                const activeName = getActivePresetName();
                savePresetAs(activeName, presetData, activePreset.modules);
            }
            else {
                // 无激活预设（仅 legacy 数据）: 仍写 legacy 保持向后兼容
                getSettingsRoot().nsfwPresetData = presetData;
                saveSettingsDebounced();
            }
            const display = newVal.length > 50 ? newVal.substring(0, 50) + '...' : newVal;
            $row.find('span:last').text(display);
            addLog('已更新: ' + (key || fid), 'info');
            if (typeof toastr !== 'undefined')
                toastr.success('[NSFW 模型切换器] 已更新');
            $editor.slideUp(100);
        });
    });
    const updateIndicator = function () {
        const s = loadSettings();
        updateStatusIndicator(s, $panel);
        $panel.find('#nsfw_switcher_state_text').text('状态机: ' + state.getStateDescription() + (isInterceptEnabled() ? ' [拦截中]' : ''));
    };
    const initialSettings = loadSettings();
    if (initialSettings.nsfwPresetData) {
        $panel.find('#nsfw_switcher_preset_status').html(renderPresetModulesHtml(initialSettings.nsfwPresetData, initialSettings.nsfwPresetModules));
    }
    updateIndicator();
}
// onMessageRendered / onGenerationStarted / onMessageSent / onSettingsLoaded
// 已迁移到 src/event-handlers.ts (Phase 4 Batch C Step C3)
// 通过 registerEventHandlers(deps) 在 jQuery ready 阶段注册
$(() => {
    console.log('JQUERY_READY');
    setupLogRendering();
    initLogs();
    addLog('jQuery 就绪', 'info', 'debug');
    // L3 修复: 用 utils.getSettingsRoot() 替代重复的 `extension_settings as unknown as`。
    // 但首次初始化需要在键不存在时创建, 借用 getSettingsRoot 之前需要先 seed 默认值。
    {
        const extAsAny = extension_settings;
        extAsAny[EXTENSION_NAME] = { ...DEFAULT_SETTINGS, ...(extAsAny[EXTENSION_NAME] || {}) };
    }
    // Migrate legacy single-preset to multi-preset
    (function () {
        const settings = getSettingsRoot();
        if (settings.nsfwPresetData && Object.keys(settings.nsfwPresets || {}).length === 0) {
            const legacy = settings.nsfwPresetData;
            const name = legacy.name || legacy.display_name || '默认预设';
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
    coordinator = createCoordinator(state);
    isReady = false;
    initProxies();
    initFetchInterceptor();
    // Phase 4 Batch B Step 8: 接管 Path A (fetch 重定向回调)
    // 旧实现: 直接调 deactivateOverrides(), 关 Proxy 但留 fetch 拦截
    // 新实现: coordinator.onPayloadCaptured() 走 'switched' → 'partial' 状态转换
    //          仍保留 fetch 应对 streaming reconnect / function-call 后续请求
    setOnRequestRedirected(() => coordinator.onPayloadCaptured());
    // attach coordinator (订阅 state.onTransition + safety timeout)
    coordinator.attach();
    const $panel = $('<div id="nsfw_switcher_panel">' + createSettingsHtml() + '</div>').appendTo('#extensions_settings');
    bindSettingsListeners($panel);
    // Phase 4 Batch C Step C3: 事件处理器注入依赖后注册
    const eventDeps = {
        state,
        coordinator,
        getIsReady: () => isReady,
        setIsReady: (v) => { isReady = v; },
    };
    registerEventHandlers(eventDeps);
    if (getSettingsRoot())
        callOnSettingsLoadedNow(eventDeps);
    console.log('INIT_COMPLETE');
    addLog('初始化完成', 'success');
});
window.__nsfwDebug = function () {
    const s = loadSettings();
    const logs = getLogs();
    console.log('======== NSFW 模型切换器 诊断信息 ========');
    console.log('插件已加载:', isReady);
    console.log('状态机:', state ? state.getStateDescription() : 'N/A');
    console.log('拦截器:', isInterceptEnabled() ? '启用' : '禁用');
    const presetName = s.nsfwPresetData ? (s.nsfwPresetData.name || '已导入') : '无';
    console.log('NSFW 预设:', presetName);
    console.log('最近日志 (' + logs.length + ' 条):');
    logs.slice(0, 20).forEach(function (log) {
        console.log('  [' + log.timestamp + '] [' + log.type + '] ' + log.message);
    });
    console.log('==========================================');
};
/**
 * 6 个预设模块的元数据 (从原 index.ts L40-48 整体迁出)
 */
export const PRESET_MODULES = [
    {
        id: 'genParams',
        name: '生成参数',
        fields: ['temperature', 'top_p', 'top_k', 'top_a', 'min_p', 'repetition_penalty', 'frequency_penalty', 'presence_penalty', 'openai_max_context', 'openai_max_tokens'],
        test: (p) => ['temperature', 'top_p', 'top_k', 'repetition_penalty'].some((k) => p[k] !== undefined),
    },
    {
        id: 'instruct',
        name: 'Instruct 模板',
        fields: ['input_sequence', 'output_sequence', 'system_sequence', 'stop_sequence', 'wrap', 'names_behavior', 'activation_regex', 'output_suffix', 'input_suffix', 'system_suffix', 'first_output_sequence', 'last_output_sequence', 'system_same_as_user', 'sequences_as_stop_strings', 'skip_examples', 'macro', 'user_alignment_message', 'last_system_sequence', 'first_input_sequence', 'last_input_sequence', 'story_string_prefix', 'story_string_suffix'],
        test: (p) => p.input_sequence !== undefined,
    },
    {
        id: 'context',
        name: 'Context 模板',
        fields: ['story_string', 'chat_start', 'example_separator', 'use_stop_strings', 'names_as_stop_strings', 'story_string_position', 'story_string_depth', 'story_string_role', 'always_force_name2', 'trim_sentences', 'single_line'],
        test: (p) => p.story_string !== undefined,
    },
    {
        id: 'sysprompt',
        name: 'System Prompt',
        fields: ['content', 'post_history'],
        test: (p) => p.content !== undefined && p.name !== undefined,
    },
    {
        id: 'reasoning',
        name: 'Reasoning 格式',
        fields: ['prefix', 'suffix', 'separator'],
        test: (p) => p.prefix !== undefined && p.suffix !== undefined,
    },
    {
        id: 'prompts',
        name: '自定义提示词',
        fields: [],
        test: (p) => Array.isArray(p.prompts) && p.prompts.length > 0,
    },
];
/**
 * 生成预设模块树的 HTML
 *
 * @param preset    预设数据 (null 时显示"未导入预设")
 * @param enabled   模块开关字典 (未提供时全开)
 */
export function renderPresetModulesHtml(preset, enabled) {
    if (!preset)
        return '<div class="nsfw-preset-status">未导入预设</div>';
    const name = preset.name || preset.display_name || '未命名预设';
    let html = '<div class="nsfw-preset-status">已导入: <span class="preset-name">' + name + '</span></div>';
    html += '<div class="nsfw-preset-modules">';
    for (const m of PRESET_MODULES) {
        if (!m.test(preset))
            continue;
        const modOn = !enabled || enabled[m.id] !== false;
        html += '<div class="nsfw-module-header" data-module="' + m.id + '">' +
            '<input type="checkbox" class="nsfw-module-chk" data-module="' + m.id + '" ' + (modOn ? 'checked' : '') + '>' +
            m.name + '</div>';
        if (m.id === 'prompts' && Array.isArray(preset.prompts)) {
            const prompts = preset.prompts;
            for (let pi = 0; pi < prompts.length; pi++) {
                const pp = prompts[pi];
                const pfId = 'prompt_' + pi;
                const pfOn = enabled && enabled[pfId] !== false;
                html += '<div class="nsfw-field-row" data-field="' + pfId + '">' +
                    '<input type="checkbox" class="nsfw-field-chk" data-field="' + pfId + '" ' + (pfOn ? 'checked' : '') + '>' +
                    '<span class="nsfw-field-value">' + escapeHtml(pp.name || '(未命名)') + '</span></div>';
            }
        }
        else if (m.fields) {
            for (const fk of m.fields) {
                if (preset[fk] !== undefined) {
                    const fId = m.id + '_' + fk;
                    const fOn = enabled && enabled[fId] !== false;
                    let val = String(preset[fk]);
                    if (val.length > 80)
                        val = val.substring(0, 80) + '...';
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
/**
 * 为新导入的预设生成默认全开的模块字典
 *
 * 用于:
 * - 文件导入时 (用户首次拖入 JSON, 自动启用所有可识别的模块)
 * - "新建" 按钮 (基于当前激活预设复制)
 */
export function buildDefaultEnabledModules(preset) {
    const enabled = {};
    if (!preset)
        return enabled;
    for (const m of PRESET_MODULES) {
        if (!m.test(preset))
            continue;
        enabled[m.id] = true;
        if (m.id === 'prompts' && Array.isArray(preset.prompts)) {
            const prompts = preset.prompts;
            for (let pi = 0; pi < prompts.length; pi++)
                enabled['prompt_' + pi] = true;
        }
        else if (m.fields) {
            for (const f of m.fields) {
                if (preset[f] !== undefined)
                    enabled[m.id + '_' + f] = true;
            }
        }
    }
    return enabled;
}
//# sourceMappingURL=index.js.map