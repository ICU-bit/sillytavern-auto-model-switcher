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
    <div class="nsfw_switcher_container">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header" style="padding: 10px;">
                <b style="font-size: 1.1rem;">NSFW模型切换器</b>
                <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
            </div>

            <div class="inline-drawer-content" style="display: none;">
                <div style="padding: 10px;">
                    <h4>基础设置</h4>
                    <div class="checkbox_label range-block justifyLeft" style="margin-bottom: 15px;">
                        <input type="checkbox" id="nsfw_switcher_enabled" checked>
                        <span>启用插件</span>
                    </div>

                    <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                        <div class="menu_button_icon menu_button interactable">
                            <i class="fa-brands fa-github fa-lg"></i>
                            <a href="https://github.com/ICU-bit/sillytavern-auto-model-switcher/" target="_blank">项目地址</a>
                        </div>
                    </div>

                    <hr/>

                    <h4>NSFW检测设置</h4>

                    <div style="margin-bottom: 15px;">
                        <label for="nsfw_switcher_api_url">检测API地址</label>
                        <small class="toggle-description justifyLeft">(OpenAI兼容的API端点)</small>
                        <input type="text" id="nsfw_switcher_api_url" class="text_pole wide100p"
                               placeholder="https://api.example.com/v1/chat/completions" style="margin-top: 5px;">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label for="nsfw_switcher_api_key">API密钥</label>
                        <small class="toggle-description justifyLeft">(可选，部分API需要)</small>
                        <input type="password" id="nsfw_switcher_api_key" class="text_pole wide100p"
                               placeholder="sk-..." style="margin-top: 5px;">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label for="nsfw_switcher_model_name">检测模型名称</label>
                        <small class="toggle-description justifyLeft">(用于判断NSFW的轻量化模型)</small>
                        <input type="text" id="nsfw_switcher_model_name" class="text_pole wide100p"
                               placeholder="nsfw-detector" style="margin-top: 5px;">
                    </div>

                    <hr/>

                    <h4>模型切换设置</h4>

                    <div style="margin-bottom: 15px;">
                        <label for="nsfw_switcher_model_a">NSFW场景模型</label>
                        <small class="toggle-description justifyLeft">(检测到NSFW内容时切换到此模型)</small>
                        <input type="text" id="nsfw_switcher_model_a" class="text_pole wide100p"
                               placeholder="gpt-4" style="margin-top: 5px;">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label for="nsfw_switcher_prompt">检测提示词</label>
                        <small class="toggle-description justifyLeft">(发送给检测模型，{content}会被替换为待检测内容)</small>
                        <textarea id="nsfw_switcher_prompt" class="wide100p" rows="4"
                                  style="margin-top: 5px; resize: vertical;">判断以下内容是否为NSFW（成人内容）：

{content}

请只输出1（是）或0（否）。</textarea>
                    </div>

                    <hr/>

                    <div class="inline-drawer wide100p">
                        <div class="inline-drawer-toggle inline-drawer-header">
                            <b><span>高级设置</span></b>
                            <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                        </div>
                        <div class="inline-drawer-content" style="display: none; padding-top: 10px;">

                            <div class="checkbox_label range-block justifyLeft" style="margin-bottom: 15px;">
                                <input type="checkbox" id="nsfw_switcher_show_notification" checked>
                                <span>显示切换通知</span>
                                <small class="toggle-description justifyLeft">(切换模型时显示提示信息)</small>
                            </div>

                            <div class="checkbox_label range-block justifyLeft" style="margin-bottom: 15px;">
                                <input type="checkbox" id="nsfw_switcher_debug_mode">
                                <span>调试模式</span>
                                <small class="toggle-description justifyLeft">(在控制台输出详细日志)</small>
                            </div>

                            <div style="margin-bottom: 15px;">
                                <label for="nsfw_switcher_max_length">最大检测长度</label>
                                <small class="toggle-description justifyLeft">(超过此长度的内容将被截断，单位：字符)</small>
                                <input type="number" id="nsfw_switcher_max_length" class="text_pole"
                                       min="100" max="10000" value="2000"
                                       style="margin-top: 5px; width: 100%;">
                            </div>
                        </div>
                    </div>

                    <hr/>

                    <div id="nsfw_switcher_status" style="margin-bottom: 15px;">
                        <h4>当前状态</h4>
                        <div style="padding: 10px; background: rgba(0,0,0,0.1); border-radius: 5px;">
                            <div style="margin-bottom: 5px;">
                                <strong>当前模型：</strong>
                                <span id="nsfw_switcher_current_model">未检测</span>
                            </div>
                            <div style="margin-bottom: 5px;">
                                <strong>原模型：</strong>
                                <span id="nsfw_switcher_original_model">未保存</span>
                            </div>
                            <div>
                                <strong>切换状态：</strong>
                                <span id="nsfw_switcher_switch_status">正常</span>
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; margin-top: 15px;">
                        <div class="menu_button menu_button_icon" id="nsfw_switcher_test_btn">
                            <i class="fa-solid fa-play"></i>
                            <a>测试检测</a>
                        </div>
                        <div class="menu_button menu_button_icon" id="nsfw_switcher_restore_btn">
                            <i class="fa-solid fa-rotate-left"></i>
                            <a>恢复原模型</a>
                        </div>
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
