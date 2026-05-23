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
        .nsfw-switcher-panel {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
            color: white;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .nsfw-switcher-card {
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 12px;
            transition: all 0.3s ease;
        }
        .nsfw-switcher-card:hover {
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            transform: translateY(-1px);
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
            font-size: 16px;
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
            transition: all 0.3s ease;
            box-sizing: border-box;
        }
        .nsfw-switcher-input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102,126,234,0.1);
        }
        .nsfw-switcher-textarea {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 13px;
            resize: vertical;
            min-height: 80px;
            font-family: inherit;
            transition: all 0.3s ease;
            box-sizing: border-box;
        }
        .nsfw-switcher-textarea:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102,126,234,0.1);
        }
        .nsfw-switcher-help {
            font-size: 11px;
            color: #888;
            margin-top: 4px;
            line-height: 1.4;
        }
        .nsfw-switcher-checkbox {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px;
            background: white;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
            border: 1px solid #e0e0e0;
        }
        .nsfw-switcher-checkbox:hover {
            background: #f0f0f0;
        }
        .nsfw-switcher-checkbox input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
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
            margin-top: 2px;
        }
        .nsfw-switcher-status {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: white;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
        }
        .nsfw-switcher-status-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        .status-active {
            background: #2ecc71;
            box-shadow: 0 0 8px rgba(46,204,113,0.5);
        }
        .status-inactive {
            background: #95a5a6;
            animation: none;
        }
        .status-warning {
            background: #f39c12;
            box-shadow: 0 0 8px rgba(243,156,18,0.5);
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        .nsfw-switcher-status-text {
            font-weight: 600;
            color: #333;
            font-size: 14px;
        }
        .nsfw-switcher-btn-group {
            display: flex;
            gap: 10px;
            margin-top: 15px;
        }
        .nsfw-switcher-btn {
            flex: 1;
            padding: 12px 16px;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .nsfw-switcher-btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .nsfw-switcher-btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102,126,234,0.4);
        }
        .nsfw-switcher-btn-secondary {
            background: #e0e0e0;
            color: #555;
        }
        .nsfw-switcher-btn-secondary:hover {
            background: #d0d0d0;
        }
        .nsfw-switcher-btn-danger {
            background: #ffeaa7;
            color: #d63031;
        }
        .nsfw-switcher-btn-danger:hover {
            background: #fdcb6e;
        }
        .nsfw-switcher-info-box {
            background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%);
            color: white;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 15px;
            font-size: 12px;
            line-height: 1.6;
        }
        .nsfw-switcher-divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, #e0e0e0, transparent);
            margin: 15px 0;
        }
        .nsfw-switcher-footer {
            text-align: center;
            padding: 12px;
            color: #999;
            font-size: 11px;
            border-top: 1px solid #e0e0e0;
            margin-top: 15px;
        }
    </style>
    
    <div class="nsfw_switcher_container" style="max-width: 600px;">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header" style="padding: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-shield-halved" style="color: #667eea; font-size: 18px;"></i>
                    <b style="font-size: 1.1rem; color: #333;">NSFW模型切换器</b>
                </div>
                <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
            </div>

            <div class="inline-drawer-content" style="display: none;">
                <div style="padding: 15px;">
                    
                    <!-- 插件信息卡片 -->
                    <div class="nsfw-switcher-info-box">
                        <div style="font-weight: 600; margin-bottom: 6px;">
                            <i class="fa-solid fa-info-circle"></i> 功能说明
                        </div>
                        <div>
                            自动检测AI回复内容是否为NSFW，当检测到NSFW内容时，自动切换到指定的模型A继续对话。当对话恢复正常后，自动恢复原模型。
                        </div>
                    </div>

                    <!-- 主开关 -->
                    <div class="nsfw-switcher-card" style="background: white;">
                        <div class="nsfw-switcher-checkbox">
                            <input type="checkbox" id="nsfw_switcher_enabled" checked>
                            <div class="nsfw-switcher-checkbox-text">
                                <div class="nsfw-switcher-checkbox-title">启用插件</div>
                                <div class="nsfw-switcher-checkbox-desc">开启后，插件将自动检测并切换模型</div>
                            </div>
                        </div>
                    </div>

                    <!-- 状态显示 -->
                    <div class="nsfw-switcher-status">
                        <div id="nsfw_switcher_status_indicator" class="nsfw-switcher-status-indicator status-warning"></div>
                        <div class="nsfw-switcher-status-text">
                            状态: <span id="nsfw_switcher_status_text">配置不完整</span>
                        </div>
                    </div>

                    <div class="nsfw-switcher-divider"></div>

                    <!-- API配置卡片 -->
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
                            <div class="nsfw-switcher-help">
                                轻量化NSFW检测模型的API地址，支持OpenAI兼容格式
                            </div>
                        </div>

                        <div class="nsfw-switcher-form-group">
                            <label class="nsfw-switcher-label" for="nsfw_switcher_api_key">
                                API密钥
                            </label>
                            <input type="password" id="nsfw_switcher_api_key" class="nsfw-switcher-input"
                                   placeholder="sk-... (可选)">
                            <div class="nsfw-switcher-help">
                                如果API需要认证，请填写API密钥
                            </div>
                        </div>

                        <div class="nsfw-switcher-form-group">
                            <label class="nsfw-switcher-label" for="nsfw_switcher_model_name">
                                检测模型名称
                            </label>
                            <input type="text" id="nsfw_switcher_model_name" class="nsfw-switcher-input"
                                   placeholder="nsfw-detector" value="nsfw-detector">
                            <div class="nsfw-switcher-help">
                                用于判断NSFW的轻量化模型名称
                            </div>
                        </div>
                    </div>

                    <!-- 模型配置卡片 -->
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
                                   placeholder="gpt-4 / claude-3-opus / ...">
                            <div class="nsfw-switcher-help">
                                检测到NSFW内容时，将切换到这个模型
                            </div>
                        </div>

                        <div class="nsfw-switcher-form-group">
                            <label class="nsfw-switcher-label" for="nsfw_switcher_prompt">
                                检测提示词
                            </label>
                            <textarea id="nsfw_switcher_prompt" class="nsfw-switcher-textarea"
                                      placeholder="判断以下内容是否为NSFW...">判断以下内容是否为NSFW（成人内容）：

{content}

请只输出1（是）或0（否）。</textarea>
                            <div class="nsfw-switcher-help">
                                发送给检测模型的问题，{content} 会被替换为待检测的内容
                            </div>
                        </div>
                    </div>

                    <!-- 高级设置 -->
                    <div class="inline-drawer wide100p">
                        <div class="inline-drawer-toggle inline-drawer-header" style="padding: 12px; background: #f0f0f0; border-radius: 8px; cursor: pointer;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-gear" style="color: #666;"></i>
                                <b style="color: #555; font-size: 13px;">高级设置</b>
                            </div>
                            <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down" style="color: #666;"></div>
                        </div>
                        <div class="inline-drawer-content" style="display: none; padding-top: 15px;">
                            
                            <div class="nsfw-switcher-checkbox">
                                <input type="checkbox" id="nsfw_switcher_show_notification" checked>
                                <div class="nsfw-switcher-checkbox-text">
                                    <div class="nsfw-switcher-checkbox-title">显示切换通知</div>
                                    <div class="nsfw-switcher-checkbox-desc">在界面上显示模型切换提示</div>
                                </div>
                            </div>
                            
                            <div style="height: 10px;"></div>
                            
                            <div class="nsfw-switcher-checkbox">
                                <input type="checkbox" id="nsfw_switcher_debug_mode">
                                <div class="nsfw-switcher-checkbox-text">
                                    <div class="nsfw-switcher-checkbox-title">调试模式</div>
                                    <div class="nsfw-switcher-checkbox-desc">在控制台输出详细的调试信息</div>
                                </div>
                            </div>
                            
                            <div style="height: 10px;"></div>
                            
                            <div class="nsfw-switcher-form-group">
                                <label class="nsfw-switcher-label" for="nsfw_switcher_max_length">
                                    最大检测长度
                                </label>
                                <input type="number" id="nsfw_switcher_max_length" class="nsfw-switcher-input"
                                       min="100" max="10000" value="2000">
                                <div class="nsfw-switcher-help">
                                    超过此长度的内容将被截断，单位：字符
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="nsfw-switcher-divider"></div>

                    <!-- 操作按钮 -->
                    <div class="nsfw-switcher-btn-group">
                        <button id="nsfw_switcher_test_btn" class="nsfw-switcher-btn nsfw-switcher-btn-primary">
                            <i class="fa-solid fa-flask"></i>
                            测试API
                        </button>
                        <button id="nsfw_switcher_restore_btn" class="nsfw-switcher-btn nsfw-switcher-btn-secondary">
                            <i class="fa-solid fa-rotate-left"></i>
                            恢复原模型
                        </button>
                    </div>

                    <button id="nsfw_switcher_reset_btn" class="nsfw-switcher-btn nsfw-switcher-btn-danger" style="width: 100%; margin-top: 10px;">
                        <i class="fa-solid fa-trash"></i>
                        重置所有设置
                    </button>

                    <div class="nsfw-switcher-footer">
                        <div style="margin-bottom: 4px;">
                            <i class="fa-brands fa-github"></i>
                            <a href="https://github.com/ICU-bit/sillytavern-auto-model-switcher/" 
                               target="_blank" 
                               style="color: #667eea; text-decoration: none;">
                                GitHub 项目地址
                            </a>
                        </div>
                        <div>NSFW模型切换器 v0.0.2</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
}

async function initPlugin() {
    const savedOriginalModel = getSetting('originalModel', null);
    if (savedOriginalModel) {
        originalModel = savedOriginalModel;
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

    const settingsHtml = createSettingsHtml();
    const container = document.createElement('div');
    container.innerHTML = settingsHtml;
    const settingsElement = container.firstElementChild;

    const targetElement = document.querySelector('#extensions-settings-button');
    if (targetElement) {
        $(targetElement).after(settingsElement);
        loadSettings();
        initSettingsListeners();
        console.log('[NSFW模型切换器] 设置界面已添加');
    } else {
        console.warn('[NSFW模型切换器] 未找到目标容器，稍后重试');
        setTimeout(() => {
            const retryTarget = document.querySelector('#extensions-settings-button');
            if (retryTarget) {
                $(retryTarget).after(settingsElement);
                loadSettings();
                initSettingsListeners();
                console.log('[NSFW模型切换器] 设置界面已添加（延迟加载）');
            } else {
                console.error('[NSFW模型切换器] 无法找到扩展设置容器');
            }
        }, 2000);
    }

    console.log('[NSFW模型切换器] 插件加载完成');
}

if (typeof jQuery !== 'undefined') {
    jQuery(() => {
        initPlugin();
    });
} else {
    document.addEventListener('DOMContentLoaded', () => {
        initPlugin();
    });
}
