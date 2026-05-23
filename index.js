/**
 * NSFW 模型切换器 — 入口文件
 *
 * 架构说明：
 *   src/logger.js     — 日志管理
 *   src/settings.js   — ST 标准设置 API
 *   src/state.js      — 有限状态机
 *   src/detector.js   — NSFW 检测 (AI 回复完成后调用)
 *   src/model-switcher.js — 安全的模型切换 (oai_settings 快照)
 *
 * 事件流：
 *   AI 回复完成 (CHARACTER_MESSAGE_RENDERED) → 异步检测 NSFW → 记录状态
 *   用户下次发送 → GENERATION_STARTED → 按状态决策切换/恢复 → 生成
 */

import { eventSource, event_types } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { addLog, clearLogs, setRenderCallback, renderLogsHtml } from './src/logger.js';
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
import { switchToModel, restoreOriginalModel, saveSettingsSnapshot, clearSettingsSnapshot } from './src/model-switcher.js';

// ── 状态 ──────────────────────────────────────────────

const state = createStateMachine();
let isReady = false;            // 初始加载完成后才启动检测
let detectionInProgress = false; // 避免并发检测

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

                    <!-- 切换目标模型 -->
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
                            <label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">目标模型API地址</label>
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
                            <label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">API来源</label>
                            <select id="nsfw_switcher_model_a_source"
                                    style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;">
                                <option value="openai">OpenAI</option>
                                <option value="claude">Claude</option>
                                <option value="openrouter">OpenRouter</option>
                                <option value="custom">Custom</option>
                                <option value="deepseek">DeepSeek</option>
                            </select>
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
        // 同时更新状态机状态
        $panel.find('#nsfw_switcher_state_text').text(
            '状态机: ' + state.getStateDescription()
        );
    };

    // 所有输入/选择变更时保存
    $panel.on('input change',
        '#nsfw_switcher_enabled, #nsfw_switcher_api_url, #nsfw_switcher_api_key, ' +
        '#nsfw_switcher_model_name, #nsfw_switcher_model_a, #nsfw_switcher_model_a_api_url, ' +
        '#nsfw_switcher_model_a_api_key, #nsfw_switcher_model_a_source, ' +
        '#nsfw_switcher_show_notification, #nsfw_switcher_debug_mode',
        () => {
            collectAndSaveFromDom($panel);
            updateIndicator();
        }
    );

    // 测试 API
    $panel.on('click', '#nsfw_switcher_test_btn', async () => {
        await testNsfwApi();
    });

    // 手动恢复
    $panel.on('click', '#nsfw_switcher_restore_btn', async () => {
        state.onManualRestore();
        const restored = await restoreOriginalModel();
        if (!restored) {
            addLog('未找到可恢复的快照，清除状态', 'warning');
            clearSettingsSnapshot();
        }
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

    // 避免并发检测
    if (detectionInProgress) {
        if (settings.debugMode) addLog('检测进行中，跳过本次', 'info');
        return;
    }

    detectionInProgress = true;
    try {
        const content = getMessageTextById(messageId) || getLastAiMessageText();
        if (!content) {
            if (settings.debugMode) addLog('未找到 AI 消息内容', 'info');
            return;
        }

        if (settings.debugMode) {
            addLog('检测 AI 回复中... (长度: ' + content.length + ' 字)', 'info');
        }

        const nsfwResult = await detectNSFW(content);

        if (nsfwResult === true) {
            state.onNsfwDetected();
            addLog('检测结果: NSFW → 下次生成将切换模型', 'warning');

            // 提前保存原始模型快照（但先不切换）
            saveSettingsSnapshot();
        } else if (nsfwResult === false) {
            const didMarkRestore = state.onCleanDetected();
            if (didMarkRestore) {
                addLog('检测结果: 正常 → 下次生成将恢复原模型', 'info');
            } else {
                if (settings.debugMode) addLog('检测结果: 正常，保持当前模型', 'info');
            }
        } else {
            const didMarkRestore = state.onDetectionFailed();
            if (didMarkRestore) {
                addLog('检测失败 → 下次生成将恢复原模型', 'warning');
            }
        }

        // 更新 UI 状态指示
        const $container = $('#nsfw_switcher_state_text');
        if ($container.length) {
            $container.text('状态机: ' + state.getStateDescription());
        }
    } finally {
        detectionInProgress = false;
    }
}

/**
 * 生成开始 → 应用状态机决策（切换/恢复）
 */
async function onGenerationStarted(type, params, dryRun) {
    if (!isReady || dryRun) return;

    const settings = loadSettings();
    if (!settings.enabled) return;

    const action = state.onGenerationStarted();

    if (action === 'switch') {
        addLog('生成开始 → 执行切换（上次回复为 NSFW）', 'info');
        await switchToModel(settings.modelA, settings.modelASource, settings.modelAApiUrl, settings.modelAApiKey);
    } else if (action === 'restore') {
        addLog('生成开始 → 执行恢复（上次回复正常）', 'info');
        await restoreOriginalModel();
    } else {
        if (settings.debugMode) addLog('生成开始 → 无需操作', 'info');
    }

    // 更新状态 UI
    const $container = $('#nsfw_switcher_state_text');
    if ($container.length) {
        $container.text('状态机: ' + state.getStateDescription());
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
        $panel.find('#nsfw_switcher_state_text').text('状态机: ' + state.getStateDescription());
    }

    isReady = true;
    addLog('插件就绪，开始监听事件', 'success');
}

function registerEventListeners() {
    addLog('注册事件监听器...', 'info');

    // [新流程] AI 回复渲染完成 → NSFW 检测 → 更新状态
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onMessageRendered);

    // [新流程] 生成开始 → 按状态切换/恢复
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

jQuery(async () => {
    extension_settings[EXTENSION_NAME] = extension_settings[EXTENSION_NAME] || {};
    Object.assign(DEFAULT_SETTINGS, extension_settings[EXTENSION_NAME]);
    extension_settings[EXTENSION_NAME] = { ...DEFAULT_SETTINGS, ...extension_settings[EXTENSION_NAME] };

    addLog('插件正在激活...', 'info');

    setupLogRendering();

    const $panel = initSettingsPanel();
    if ($panel) {
        bindSettingsListeners($panel);
    }

    registerEventListeners();

    if (!isReady && extension_settings[EXTENSION_NAME]) {
        onSettingsLoaded();
    }

    addLog('插件加载完成！', 'success');
});