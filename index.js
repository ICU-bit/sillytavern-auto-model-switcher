console.log('[NSFW模型切换器] 插件加载中...');

import {
    loadSettings,
    saveSettings,
    getSetting,
    setSetting,
    initSettingsListeners,
    updateStatusDisplay,
    getSettings
} from './settings.js';

let originalModel = null;
let isTemporarySwitch = false;
let lastAiMessage = null;

async function switchToModel(targetModel) {
    if (!targetModel) {
        console.log('[NSFW模型切换器] 未指定切换模型');
        return false;
    }

    try {
        const { oai_settings, chat_completion_sources, getChatCompletionModel } = await import('../../openai.js');
        
        const currentSource = oai_settings.chat_completion_source;
        const currentModel = getChatCompletionModel();

        if (!originalModel) {
            originalModel = currentModel;
            console.log('[NSFW模型切换器] 保存原模型:', originalModel);
            updateStatusDisplay(currentModel, originalModel, false);
        }

        if (currentModel === targetModel) {
            console.log('[NSFW模型切换器] 已是目标模型，无需切换');
            isTemporarySwitch = true;
            updateStatusDisplay(currentModel, originalModel, true);
            return true;
        }

        console.log('[NSFW模型切换器] 切换模型:', currentModel, '->', targetModel);

        if (currentSource === chat_completion_sources.OPENAI) {
            oai_settings.openai_model = targetModel;
            $('#model_openai_select').val(targetModel).trigger('change');
        } else if (currentSource === chat_completion_sources.CLAUDE) {
            oai_settings.claude_model = targetModel;
            $('#model_claude_select').val(targetModel).trigger('change');
        } else if (currentSource === chat_completion_sources.OPENROUTER) {
            oai_settings.openrouter_model = targetModel;
            $('#model_openrouter_select').val(targetModel).trigger('change');
        } else {
            console.log('[NSFW模型切换器] 不支持的API来源:', currentSource);
            return false;
        }

        isTemporarySwitch = true;
        setSetting('lastSwitchTime', Date.now());
        setSetting('originalModel', originalModel);
        updateStatusDisplay(targetModel, originalModel, true);

        if (getSetting('showNotification', true) && typeof toastr !== 'undefined') {
            toastr.info(`[NSFW模型切换器] 已切换到: ${targetModel}`);
        }
        return true;
    } catch (e) {
        console.error('[NSFW模型切换器] 切换模型失败:', e);
        return false;
    }
}

async function restoreOriginalModel() {
    if (!originalModel || !isTemporarySwitch) {
        return false;
    }

    try {
        const { oai_settings, chat_completion_sources, getChatCompletionModel } = await import('../../openai.js');
        
        const currentModel = getChatCompletionModel();

        if (currentModel === originalModel) {
            console.log('[NSFW模型切换器] 已是原模型，无需恢复');
            isTemporarySwitch = false;
            updateStatusDisplay(originalModel, originalModel, false);
            return true;
        }

        console.log('[NSFW模型切换器] 恢复原模型:', currentModel, '->', originalModel);

        const currentSource = oai_settings.chat_completion_source;

        if (currentSource === chat_completion_sources.OPENAI) {
            oai_settings.openai_model = originalModel;
            $('#model_openai_select').val(originalModel).trigger('change');
        } else if (currentSource === chat_completion_sources.CLAUDE) {
            oai_settings.claude_model = originalModel;
            $('#model_claude_select').val(originalModel).trigger('change');
        } else if (currentSource === chat_completion_sources.OPENROUTER) {
            oai_settings.openrouter_model = originalModel;
            $('#model_openrouter_select').val(originalModel).trigger('change');
        } else {
            console.log('[NSFW模型切换器] 不支持的API来源:', currentSource);
            return false;
        }

        isTemporarySwitch = false;
        const restoredModel = originalModel;
        originalModel = null;
        setSetting('lastSwitchTime', null);
        setSetting('originalModel', null);
        updateStatusDisplay(restoredModel, null, false);

        if (getSetting('showNotification', true) && typeof toastr !== 'undefined') {
            toastr.info(`[NSFW模型切换器] 已恢复原模型: ${restoredModel || '默认模型'}`);
        }
        return true;
    } catch (e) {
        console.error('[NSFW模型切换器] 恢复模型失败:', e);
        return false;
    }
}

window.restoreNsfwOriginalModel = restoreOriginalModel;

async function detectNSFW(content) {
    const settings = getSettings();
    const { nsfwApiUrl, nsfwApiKey, nsfwModelName, prompt, maxLength } = settings;

    if (!nsfwApiUrl) {
        if (getSetting('debugMode', false)) {
            console.log('[NSFW模型切换器] 未配置NSFW检测API');
        }
        return null;
    }

    try {
        const truncatedContent = content.length > maxLength ? content.substring(0, maxLength) : content;
        const finalPrompt = prompt.replace('{content}', truncatedContent);

        const response = await fetch(nsfwApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(nsfwApiKey ? { 'Authorization': `Bearer ${nsfwApiKey}` } : {})
            },
            body: JSON.stringify({
                model: nsfwModelName || 'nsfw-detector',
                messages: [{
                    role: 'user',
                    content: finalPrompt
                }],
                temperature: 0.0,
                max_tokens: 1
            })
        });

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }

        const data = await response.json();
        const result = data.choices?.[0]?.message?.content?.trim();

        if (getSetting('debugMode', false)) {
            console.log('[NSFW模型切换器] 检测结果:', result);
        }

        return result === '1';
    } catch (error) {
        console.error('[NSFW模型切换器] 检测失败:', error);
        return null;
    }
}

window.testNsfwDetection = detectNSFW;

async function onAiMessageRendered(chatId) {
    try {
        const { getContext } = await import('../../extensions.js');
        const context = getContext();
        const chat = context.chat[chatId];

        if (!chat || chat.is_user) {
            return;
        }

        lastAiMessage = chat.mes;
        
        if (getSetting('debugMode', false)) {
            console.log('[NSFW模型切换器] 捕获AI回复:', chatId, chat.mes.substring(0, 50));
        }

        const enabled = getSetting('enabled', true);
        if (!enabled) {
            return;
        }

        const nsfwDetected = await detectNSFW(chat.mes);

        if (nsfwDetected === true) {
            const modelA = getSetting('modelA');
            if (modelA) {
                await switchToModel(modelA);
            } else {
                console.log('[NSFW模型切换器] 未配置模型A');
            }
        } else if (nsfwDetected === false && isTemporarySwitch) {
            await restoreOriginalModel();
        }
    } catch (e) {
        console.error('[NSFW模型切换器] 处理AI消息失败:', e);
    }
}

async function onUserMessageSent(mesId) {
    try {
        const { getContext } = await import('../../extensions.js');
        const context = getContext();
        const chat = context.chat[mesId];

        if (!chat || !chat.is_user) {
            return;
        }

        if (getSetting('debugMode', false)) {
            console.log('[NSFW模型切换器] 用户发送消息:', mesId);
        }

        if (isTemporarySwitch && lastAiMessage) {
            const nsfwDetected = await detectNSFW(lastAiMessage);

            if (nsfwDetected === false) {
                await restoreOriginalModel();
            }
        }
    } catch (e) {
        console.error('[NSFW模型切换器] 处理用户消息失败:', e);
    }
}

function onChatChanged() {
    if (!isTemporarySwitch) {
        originalModel = null;
        lastAiMessage = null;
        updateStatusDisplay(null, null, false);
    }
}

function createSettingsHtml() {
    return `
    <style>
        .nsfw-switcher-floating-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 50%;
            box-shadow: 0 4px 12px rgba(102,126,234,0.4);
            cursor: pointer;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        }
        .nsfw-switcher-floating-btn:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 16px rgba(102,126,234,0.5);
        }
        .nsfw-switcher-floating-btn i {
            color: white;
            font-size: 24px;
        }
        .nsfw-switcher-panel {
            position: fixed;
            bottom: 90px;
            right: 20px;
            width: 400px;
            max-height: 80vh;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            z-index: 9998;
            overflow: hidden;
            display: none;
        }
        .nsfw-switcher-panel.show {
            display: block;
        }
        .nsfw-switcher-panel-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .nsfw-switcher-panel-header h3 {
            margin: 0;
            font-size: 16px;
        }
        .nsfw-switcher-panel-close {
            background: none;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
        }
        .nsfw-switcher-panel-body {
            padding: 15px;
            max-height: calc(80vh - 60px);
            overflow-y: auto;
        }
        .nsfw-switcher-card {
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 12px;
        }
        .nsfw-switcher-card-title {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .nsfw-switcher-card-title i {
            color: #667eea;
        }
        .nsfw-switcher-form-group {
            margin-bottom: 15px;
        }
        .nsfw-switcher-label {
            display: block;
            font-weight: 500;
            color: #555;
            margin-bottom: 6px;
            font-size: 13px;
        }
        .nsfw-switcher-label .required {
            color: #e74c3c;
        }
        .nsfw-switcher-input {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 13px;
            box-sizing: border-box;
        }
        .nsfw-switcher-input:focus {
            outline: none;
            border-color: #667eea;
        }
        .nsfw-switcher-textarea {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 13px;
            resize: vertical;
            min-height: 80px;
            box-sizing: border-box;
        }
        .nsfw-switcher-help {
            font-size: 11px;
            color: #888;
            margin-top: 4px;
        }
        .nsfw-switcher-checkbox {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px;
            background: white;
            border-radius: 6px;
            cursor: pointer;
            border: 1px solid #e0e0e0;
        }
        .nsfw-switcher-checkbox input[type="checkbox"] {
            width: 18px;
            height: 18px;
            accent-color: #667eea;
        }
        .nsfw-switcher-checkbox-text {
            flex: 1;
        }
        .nsfw-switcher-checkbox-title {
            font-weight: 500;
            color: #333;
            font-size: 13px;
        }
        .nsfw-switcher-checkbox-desc {
            font-size: 11px;
            color: #888;
        }
        .nsfw-switcher-status {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: white;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
            margin-bottom: 12px;
        }
        .nsfw-switcher-status-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
        }
        .status-active { background: #2ecc71; }
        .status-inactive { background: #95a5a6; }
        .status-warning { background: #f39c12; }
        .nsfw-switcher-btn {
            padding: 10px 16px;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .nsfw-switcher-btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .nsfw-switcher-btn-secondary {
            background: #e0e0e0;
            color: #555;
        }
        .nsfw-switcher-btn-danger {
            background: #ffeaa7;
            color: #d63031;
        }
        .nsfw-switcher-footer {
            text-align: center;
            padding: 10px;
            color: #999;
            font-size: 11px;
            border-top: 1px solid #e0e0e0;
        }
    </style>
    
    <!-- 悬浮按钮 -->
    <div class="nsfw-switcher-floating-btn" id="nsfw_switcher_toggle" title="NSFW模型切换器">
        <i class="fa-solid fa-shield-halved"></i>
    </div>
    
    <!-- 设置面板 -->
    <div class="nsfw-switcher-panel" id="nsfw_switcher_panel">
        <div class="nsfw-switcher-panel-header">
            <h3>🛡️ NSFW模型切换器</h3>
            <button class="nsfw-switcher-panel-close" id="nsfw_switcher_close">&times;</button>
        </div>
        <div class="nsfw-switcher-panel-body">
            
            <div class="nsfw-switcher-status">
                <div id="nsfw_switcher_status_indicator" class="nsfw-switcher-status-indicator status-warning"></div>
                <div>
                    <strong>状态:</strong>
                    <span id="nsfw_switcher_status_text">配置不完整</span>
                </div>
            </div>

            <div class="nsfw-switcher-card">
                <div class="nsfw-switcher-card-title">
                    <i class="fa-solid fa-toggle-on"></i>
                    启用插件
                </div>
                <div class="nsfw-switcher-checkbox">
                    <input type="checkbox" id="nsfw_switcher_enabled" checked>
                    <div class="nsfw-switcher-checkbox-text">
                        <div class="nsfw-switcher-checkbox-title">启用NSFW检测</div>
                        <div class="nsfw-switcher-checkbox-desc">自动检测AI回复并切换模型</div>
                    </div>
                </div>
            </div>

            <div class="nsfw-switcher-card">
                <div class="nsfw-switcher-card-title">
                    <i class="fa-solid fa-server"></i>
                    API 配置
                </div>
                
                <div class="nsfw-switcher-form-group">
                    <label class="nsfw-switcher-label" for="nsfw_switcher_api_url">
                        检测API地址 <span class="required">*</span>
                    </label>
                    <input type="text" id="nsfw_switcher_api_url" class="nsfw-switcher-input"
                           placeholder="https://api.example.com/v1/chat/completions">
                    <div class="nsfw-switcher-help">轻量化NSFW检测模型的API地址</div>
                </div>

                <div class="nsfw-switcher-form-group">
                    <label class="nsfw-switcher-label" for="nsfw_switcher_api_key">
                        API密钥
                    </label>
                    <input type="password" id="nsfw_switcher_api_key" class="nsfw-switcher-input"
                           placeholder="sk-... (可选)">
                </div>

                <div class="nsfw-switcher-form-group">
                    <label class="nsfw-switcher-label" for="nsfw_switcher_model_name">
                        检测模型名称
                    </label>
                    <input type="text" id="nsfw_switcher_model_name" class="nsfw-switcher-input"
                           placeholder="nsfw-detector" value="nsfw-detector">
                </div>
            </div>

            <div class="nsfw-switcher-card">
                <div class="nsfw-switcher-card-title">
                    <i class="fa-solid fa-robot"></i>
                    模型切换配置
                </div>
                
                <div class="nsfw-switcher-form-group">
                    <label class="nsfw-switcher-label" for="nsfw_switcher_model_a">
                        NSFW场景模型 <span class="required">*</span>
                    </label>
                    <input type="text" id="nsfw_switcher_model_a" class="nsfw-switcher-input"
                           placeholder="gpt-4">
                    <div class="nsfw-switcher-help">检测到NSFW内容时切换到此模型</div>
                </div>

                <div class="nsfw-switcher-form-group">
                    <label class="nsfw-switcher-label" for="nsfw_switcher_prompt">
                        检测提示词
                    </label>
                    <textarea id="nsfw_switcher_prompt" class="nsfw-switcher-textarea">判断以下内容是否为NSFW（成人内容）：

{content}

请只输出1（是）或0（否）。</textarea>
                </div>
            </div>

            <div class="nsfw-switcher-card">
                <div class="nsfw-switcher-card-title">
                    <i class="fa-solid fa-gear"></i>
                    高级设置
                </div>
                
                <div class="nsfw-switcher-checkbox" style="margin-bottom: 10px;">
                    <input type="checkbox" id="nsfw_switcher_show_notification" checked>
                    <div class="nsfw-switcher-checkbox-text">
                        <div class="nsfw-switcher-checkbox-title">显示通知</div>
                    </div>
                </div>

                <div class="nsfw-switcher-checkbox">
                    <input type="checkbox" id="nsfw_switcher_debug_mode">
                    <div class="nsfw-switcher-checkbox-text">
                        <div class="nsfw-switcher-checkbox-title">调试模式</div>
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                <button id="nsfw_switcher_test_btn" class="nsfw-switcher-btn nsfw-switcher-btn-primary" style="flex: 1;">
                    <i class="fa-solid fa-play"></i>
                    测试API
                </button>
                <button id="nsfw_switcher_restore_btn" class="nsfw-switcher-btn nsfw-switcher-btn-secondary" style="flex: 1;">
                    <i class="fa-solid fa-rotate-left"></i>
                    恢复原模型
                </button>
            </div>

            <button id="nsfw_switcher_reset_btn" class="nsfw-switcher-btn nsfw-switcher-btn-danger" style="width: 100%;">
                <i class="fa-solid fa-trash"></i>
                重置所有设置
            </button>

            <div class="nsfw-switcher-footer">
                <a href="https://github.com/ICU-bit/sillytavern-auto-model-switcher/" target="_blank" style="color: #667eea;">
                    GitHub 项目地址
                </a>
                <div>v0.0.4</div>
            </div>
        </div>
    </div>
    
    <script>
        // 悬浮按钮和面板交互
        document.getElementById('nsfw_switcher_toggle').addEventListener('click', function() {
            const panel = document.getElementById('nsfw_switcher_panel');
            panel.classList.toggle('show');
        });
        
        document.getElementById('nsfw_switcher_close').addEventListener('click', function() {
            document.getElementById('nsfw_switcher_panel').classList.remove('show');
        });
    </script>
    `;
}

function addSettingsUI() {
    document.body.insertAdjacentHTML('beforeend', createSettingsHtml());
    loadSettings();
    initSettingsListeners();
    console.log('[NSFW模型切换器] 悬浮按钮和设置面板已添加');
}

async function initPlugin() {
    console.log('[NSFW模型切换器] 开始初始化...');
    
    const savedOriginalModel = getSetting('originalModel', null);
    if (savedOriginalModel) {
        originalModel = savedOriginalModel;
        console.log('[NSFW模型切换器] 已恢复原模型:', originalModel);
    }
    
    try {
        const { eventSource, event_types } = await import('../../extensions.js');
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onAiMessageRendered);
        eventSource.on(event_types.MESSAGE_SENT, onUserMessageSent);
        eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
        console.log('[NSFW模型切换器] 事件监听已注册');
    } catch (e) {
        console.error('[NSFW模型切换器] 注册事件失败:', e);
    }

    addSettingsUI();
    console.log('[NSFW模型切换器] 插件初始化完成');
}

if (typeof jQuery !== 'undefined') {
    jQuery(() => {
        initPlugin().catch(error => {
            console.error('[NSFW模型切换器] 初始化失败:', error);
        });
    });
} else if (typeof $ !== 'undefined') {
    $(() => {
        initPlugin().catch(error => {
            console.error('[NSFW模型切换器] 初始化失败:', error);
        });
    });
} else {
    document.addEventListener('DOMContentLoaded', () => {
        initPlugin().catch(error => {
            console.error('[NSFW模型切换器] 初始化失败:', error);
        });
    });
}
