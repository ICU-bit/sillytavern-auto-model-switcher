/**
 * NSFW 模型切换器 (SillyTavern Auto Model Switcher)
 * Copyright (C) 2025 ICU-bit
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * NSFW 模型切换器 — 入口文件
 *
 * 架构说明：
 *   src/logger.js        — 日志管理
 *   src/settings.js      — ST 标准设置 API
 *   src/state.js         — 有限状态机
 *   src/detector.js      — NSFW 检测 (AI 回复完成后调用)
 *   src/direct-api.js    — [Plan B] fetch 拦截 + 直调 API (核心)
 *   src/model-switcher.js — [Plan A 保留] oai_settings 快照 (仅手动恢复用)
 *
 * 事件流：
 *   AI 回复完成 (CHARACTER_MESSAGE_RENDERED) → 异步检测 NSFW → 更新状态机
 *   用户下次发送 → GENERATION_STARTED → 启用/禁用 fetch 拦截器
 *   ST 构建请求 → fetch('/api/backends/chat-completions/generate')
 *     → 拦截器捕获 → 直调目标 API → 返回流式/非流式响应给 ST
 *     → 失败 → toastr 通知 → 回退原始请求
 */

// 模块加载确认（必须在最顶部）
console.log('NSFW_MODULE_LOADED');

import { eventSource, event_types } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { addLog, clearLogs, setRenderCallback, renderLogsHtml, getLogs } from './src/logger.js';
import {
    EXTENSION_NAME,
    DEFAULT_SETTINGS,
    loadSettings,
    collectAndSaveFromDom,
    applySettingsToDom,
    updateStatusIndicator,
} from './src/settings.js';
import { createStateMachine } from './src/state.js';
import { detectNSFW, getLastAiMessageText, getMessageTextById, testNsfwApi } from './src/detector.js';
import { restoreOriginalModel, saveSettingsSnapshot, clearSettingsSnapshot } from './src/model-switcher.js';
import { initFetchInterceptor, setInterceptEnabled, isInterceptEnabled } from './src/direct-api.js';

// ── 状态 ──────────────────────────────────────────────

const state = createStateMachine();
let isReady = false;            // 初始加载完成后才启动检测
let currentDetectionId = 0;     // 递增ID，新消息的检测自动废弃旧结果
let detectionAbortController = null; // 用于swipe时取消前一次检测

// ── 设置面板 HTML ─────────────────────────────────────

function createSettingsHtml() {
    return `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b><i class="fa-solid fa-shield-halved" style="margin-right: 8px;"></i>NSFW模型切换器</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
            </div>
            <div class="inline-drawer-content">
                <div style="padding: 15px;">
                    <!-- 状态栏 -->
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                        <div id="nsfw_switcher_status_indicator" style="width: 10px; height: 10px; border-radius: 50%; background: #f39c12;"></div>
                        <div>
                            <strong>状态:</strong>
                            <span id="nsfw_switcher_status_text">启动中...</span>
                            <span id="nsfw_switcher_state_text" style="margin-left: 12px; font-size: 12px; color: #888;"></span>
                        </div>
                    </div>

                    <!-- 启用开关 -->
                    <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
                        <div style="font-weight: 600; color: #333; margin-bottom: 10px;">
                            <i class="fa-solid fa-toggle-on" style="margin-right: 8px;"></i>启用插件
                        </div>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="nsfw_switcher_enabled" checked>
                            <span>启用NSFW检测</span>
                        </label>
                    </div>

                    <!-- NSFW 检测 API -->
                    <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
                        <div style="font-weight: 600; color: #333; margin-bottom: 10px;">
                            <i class="fa-solid fa-microscope" style="margin-right: 8px;"></i>轻量化检测模型（判断NSFW）
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">
                                API地址 <span style="color: #e74c3c;">*</span>
                            </label>
                            <input type="text" id="nsfw_switcher_api_url"
                                   style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;"
                                   placeholder="https://api.example.com/v1/chat/completions">
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">API密钥</label>
                            <input type="password" id="nsfw_switcher_api_key"
                                   style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;"
                                   placeholder="sk-... (可选)">
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">模型名称</label>
                            <input type="text" id="nsfw_switcher_model_name"
                                   style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;"
                                   placeholder="nsfw-detector">
                        </div>
                    </div>

                    <!-- 切换目标模型（Plan B: 直调 API） -->
                    <div style="margin-bottom: 15px;">
                        <div style="font-weight: 600; color: #333; margin-bottom: 10px;">
                            <i class="fa-solid fa-arrow-right-arrow-left" style="margin-right: 8px;"></i>切换目标模型（NSFW场景使用）
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">
                                目标模型名称 <span style="color: #e74c3c;">*</span>
                            </label>
                            <input type="text" id="nsfw_switcher_model_a"
                                   style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;"
                                   placeholder="gpt-4">
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">
                                目标模型API地址 <span style="color: #e74c3c;">*</span>
                            </label>
                            <input type="text" id="nsfw_switcher_model_a_api_url"
                                   style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;"
                                   placeholder="https://api.example.com/v1/chat/completions">
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">目标模型API密钥</label>
                            <input type="password" id="nsfw_switcher_model_a_api_key"
                                   style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;"
                                   placeholder="sk-... (可选)">
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="nsfw_switcher_show_notification" checked>
                                <span style="font-size: 13px;">显示切换通知</span>
                            </label>
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="nsfw_switcher_debug_mode">
                                <span style="font-size: 13px;">调试模式（显示详细日志）</span>
                            </label>
                        </div>
                    </div>

                    <!-- 操作按钮 -->
                    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <button id="nsfw_switcher_test_btn"
                                style="flex: 1; padding: 8px 12px; border: none; border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer; background: #667eea; color: white;">
                            <i class="fa-solid fa-play"></i> 测试API
                        </button>
                        <button id="nsfw_switcher_restore_btn"
                                style="flex: 1; padding: 8px 12px; border: none; border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer; background: #e0e0e0; color: #555;">
                            <i class="fa-solid fa-rotate-left"></i> 恢复原模型
                        </button>
                    </div>

                    <!-- 日志 -->
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                            <div style="font-weight: 600; color: #333;">
                                <i class="fa-solid fa-scroll" style="margin-right: 8px;"></i>运行日志
                            </div>
                            <button id="nsfw_switcher_clear_logs_btn"
                                    style="padding: 4px 8px; border: none; border-radius: 3px; font-size: 11px; cursor: pointer; background: #f5f5f5; color: #666;">
                                <i class="fa-solid fa-trash"></i> 清空
                            </button>
                        </div>
                        <div id="nsfw_switcher_logs"
                             style="max-height: 200px; overflow-y: auto; background: #fafafa; border-radius: 4px; padding: 10px; font-family: monospace;">
                            <div style="color: #999; font-size: 12px; text-align: center;">暂无日志</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ── 设置面板初始化 ────────────────────────────────────

function initSettingsPanel() {
    const $container = $('#extensions_settings');
    if (!$container.length) {
        addLog('extensions_settings 元素未找到', 'error');
        return null;
    }

    $container.append(createSettingsHtml());
    addLog('设置面板已添加', 'success');
    return $container;
}

function bindSettingsListeners($panel) {
    const settings = loadSettings();
    applySettingsToDom(settings, $panel);

    // 状态指示灯更新
    const updateIndicator = () => {
        const s = loadSettings();
        updateStatusIndicator(s, $panel);
        // 同时更新状态机状态 + 拦截状态
        $panel.find('#nsfw_switcher_state_text').text(
            '状态机: ' + state.getStateDescription() + (isInterceptEnabled() ? ' [拦截中]' : '')
        );
    };

    // 所有输入/选择变更时保存
    $panel.on('input change',
        '#nsfw_switcher_enabled, #nsfw_switcher_api_url, #nsfw_switcher_api_key, ' +
        '#nsfw_switcher_model_name, #nsfw_switcher_model_a, #nsfw_switcher_model_a_api_url, ' +
        '#nsfw_switcher_model_a_api_key, ' +
        '#nsfw_switcher_show_notification, #nsfw_switcher_debug_mode',
        () => {
            collectAndSaveFromDom($panel);
            // 如果插件被关闭，同时禁用 fetch 拦截器
            const s = loadSettings();
            if (!s.enabled && isInterceptEnabled()) {
                setInterceptEnabled(false);
            }
            updateIndicator();
        }
    );

    // 测试 API
    $panel.on('click', '#nsfw_switcher_test_btn', async () => {
        await testNsfwApi();
    });

    // 手动恢复
    $panel.on('click', '#nsfw_switcher_restore_btn', async () => {
        setInterceptEnabled(false);
        state.onManualRestore();
        // 尝试从快照恢复oai_settings（Plan A兼容 + 兜底）
        await restoreOriginalModel();
        // 清除快照避免脏数据
        clearSettingsSnapshot();
        addLog('手动恢复: 将使用原始模型生成', 'success');
        updateIndicator();
    });

    // 清空日志
    $panel.on('click', '#nsfw_switcher_clear_logs_btn', () => {
        clearLogs();
        addLog('日志已清空', 'info');
    });

    updateIndicator();
}

// ── 事件监听 ──────────────────────────────────────────

/**
 * AI 回复完成 → 异步检测 NSFW → 更新状态机
 */
async function onMessageRendered(messageId, type) {
    if (!isReady) return;
    const settings = loadSettings();
    if (!settings.enabled) return;

    // 跳过用户消息
    if (type === 'user') return;

    // 如果用户swipe产生了新消息，取消前一次正在进行的检测
    if (detectionAbortController) {
        detectionAbortController.abort();
    }
    detectionAbortController = new AbortController();

    const thisDetectionId = ++currentDetectionId;

    try {
        const content = getMessageTextById(messageId) || getLastAiMessageText();
        if (!content) {
            if (settings.debugMode) addLog('未找到 AI 消息内容', 'info');
            return;
        }

        if (settings.debugMode) {
            addLog('检测 AI 回复中... (长度: ' + content.length + ' 字)', 'info');
        }

        const nsfwResult = await detectNSFW(content, detectionAbortController.signal);

        // 如果用户已经swipe产生了新消息，废弃本次检测结果
        if (thisDetectionId !== currentDetectionId) return;

        if (nsfwResult === true) {
            const didTransition = state.onNsfwDetected();
            if (didTransition) {
                addLog('检测结果: NSFW → 下次生成将切换模型', 'warning');
                saveSettingsSnapshot();
            }
        } else if (nsfwResult === false) {
            const didTransition = state.onCleanDetected();
            if (didTransition) {
                addLog('检测结果: 正常 → 下次生成将恢复原模型', 'info');
            } else if (settings.debugMode) {
                addLog('检测结果: 正常，保持当前模型', 'info');
            }
        } else {
            const didTransition = state.onDetectionFailed();
            if (didTransition) {
                addLog('检测失败 → 下次生成将恢复原模型', 'warning');
            }
        }

        // 更新 UI 状态指示
        const $container = $('#nsfw_switcher_state_text');
        if ($container.length) {
            $container.text('状态机: ' + state.getStateDescription() + (isInterceptEnabled() ? ' [拦截中]' : ''));
        }
    }
}

/**
 * 生成开始 → Plan B：启用/禁用 fetch 拦截器
 *
 * 不再修改 oai_settings，而是通过拦截 ST 的 API 请求，
 * 在请求发出时直接重定向到目标模型的 API。
 */
async function onGenerationStarted(type, params, dryRun) {
    if (!isReady || dryRun) return;

    const settings = loadSettings();
    if (!settings.enabled) return;

    const action = state.getPendingAction();

    if (action === 'switch') {
        addLog('生成开始 → 启用拦截（上次回复为 NSFW）', 'info');
        setInterceptEnabled(true);
        state.onSwitchApplied();
    } else if (action === 'restore') {
        addLog('生成开始 → 禁用拦截（上次回复正常）', 'info');
        setInterceptEnabled(false);
        state.onRestoreApplied();
    } else {
        if (settings.debugMode) addLog('生成开始 → 无需操作', 'info');
    }

    // 更新状态 UI
    const $container = $('#nsfw_switcher_state_text');
    if ($container.length) {
        $container.text('状态机: ' + state.getStateDescription() + (isInterceptEnabled() ? ' [拦截中]' : ''));
    }
}

/**
 * 用户发送消息 → 记录日志（仅调试）
 */
async function onMessageSent(messageId) {
    if (!isReady) return;
    const settings = loadSettings();
    if (!settings.enabled || !settings.debugMode) return;

    addLog('用户发送消息 messageId=' + messageId, 'info');
}

/**
 * 设置已加载 → 将选项同步到 UI
 */
function onSettingsLoaded() {
    const settings = loadSettings();
    addLog('设置已加载', 'info');

    const $panel = $('#nsfw_switcher_state_text').closest('.inline-drawer');
    if ($panel.length) {
        applySettingsToDom(settings, $panel);
        updateStatusIndicator(settings, $panel);
        $panel.find('#nsfw_switcher_state_text').text('状态机: ' + state.getStateDescription() + (isInterceptEnabled() ? ' [拦截中]' : ''));
    }

    isReady = true;
    addLog('插件就绪，开始监听事件', 'success');
}

function registerEventListeners() {
    addLog('注册事件监听器...', 'info');

    // [新流程] AI 回复渲染完成 → NSFW 检测 → 更新状态
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onMessageRendered);

    // [新流程] 生成开始 → 启用/禁用 fetch 拦截器
    eventSource.on(event_types.GENERATION_STARTED, onGenerationStarted);

    // 调试日志
    eventSource.on(event_types.MESSAGE_SENT, onMessageSent);

    // 设置加载后同步 UI
    eventSource.on(event_types.EXTENSION_SETTINGS_LOADED, onSettingsLoaded);

    addLog('事件监听器注册成功', 'success');
}

// ── 日志渲染回调 ──────────────────────────────────────

function setupLogRendering() {
    setRenderCallback((logs) => {
        const $container = $('#nsfw_switcher_logs');
        if ($container.length) {
            $container.html(renderLogsHtml(logs));
        }
    });
}

// ── 初始化入口 ────────────────────────────────────────

$(() => {
    extension_settings[EXTENSION_NAME] = { ...DEFAULT_SETTINGS, ...extension_settings[EXTENSION_NAME] };

    // Plan B: fetch 拦截器
    initFetchInterceptor();

    setupLogRendering();

    // 注入设置面板
    const $panel = $('<div id="nsfw_switcher_panel">' + createSettingsHtml() + '</div>').appendTo('#extensions_settings');

    bindSettingsListeners($panel);
    registerEventListeners();

    if (extension_settings[EXTENSION_NAME]) {
        onSettingsLoaded();
    }
});

// ── 调试诊断 ────────────────────────────────────────

window.__nsfwDebug = function () {
    const s = loadSettings();
    const logs = getLogs();
    console.log('======== NSFW 模型切换器 诊断信息 ========');
    console.log('插件已加载:', isReady);
    console.log('状态机:', state.getStateDescription());
    console.log('拦截器:', isInterceptEnabled() ? '启用' : '禁用');
    console.log('当前设置:', JSON.stringify(s, null, 2));
    console.log('最近日志 (' + logs.length + ' 条):');
    logs.slice(0, 20).forEach(function (log) {
        console.log('  [' + log.timestamp + '] [' + log.type + '] ' + log.message);
    });
    console.log('==========================================');
};