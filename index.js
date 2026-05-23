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
        .nsfw-switcher-settings-panel {
            background: #fff;
            border-radius: 8px;
            padding: 15px;
            max-width: 400px;
        }
        .nsfw-switcher-section {
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid #eee;
        }
        .nsfw-switcher-section:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }
        .nsfw-switcher-title {
            font-weight: 600;
            color: #333;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .nsfw-switcher-title i {
            color: #667eea;
        }
        .nsfw-switcher-form-group {
            margin-bottom: 12px;
        }
        .nsfw-switcher-label {
            display: block;
            font-weight: 500;
            color: #555;
            margin-bottom: 5px;
            font-size: 13px;
        }
        .nsfw-switcher-label .required {
            color: #e74c3c;
        }
        .nsfw-switcher-input {
            width: 100%;
            padding: 8px 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 13px;
            box-sizing: border-box;
        }
        .nsfw-switcher-input:focus {
            outline: none;
            border-color: #667eea;
        }
        .nsfw-switcher-status {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 4px;
            margin-bottom: 12px;
        }
        .nsfw-switcher-status-indicator {
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }
        .nsfw-switcher-status-active { background: #2ecc71; }
        .nsfw-switcher-status-inactive { background: #95a5a6; }
        .nsfw-switcher-status-warning { background: #f39c12; }
        .nsfw-switcher-btn {
            padding: 8px 12px;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            margin-right: 8px;
            margin-bottom: 8px;
        }
        .nsfw-switcher-btn-primary {
            background: #667eea;
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
    </style>
    
    <div id="nsfw_switcher_settings" class="nsfw-switcher-settings-panel">
        <div class="nsfw-switcher-status">
            <div id="nsfw_switcher_status_indicator" class="nsfw-switcher-status-indicator nsfw-switcher-status-warning"></div>
            <div>
                <strong>状态:</strong>
                <span id="nsfw_switcher_status_text">配置不完整</span>
            </div>
        </div>

        <div class="nsfw-switcher-section">
            <div class="nsfw-switcher-title">
                <i class="fa-solid fa-toggle-on"></i>
                启用插件
            </div>
            <input type="checkbox" id="nsfw_switcher_enabled" checked>
            <label for="nsfw_switcher_enabled">启用NSFW检测</label>
        </div>

        <div class="nsfw-switcher-section">
            <div class="nsfw-switcher-title">
                <i class="fa-solid fa-server"></i>
                API配置
            </div>
            
            <div class="nsfw-switcher-form-group">
                <label class="nsfw-switcher-label" for="nsfw_switcher_api_url">
                    检测API地址 <span class="required">*</span>
                </label>
                <input type="text" id="nsfw_switcher_api_url" class="nsfw-switcher-input"
                       placeholder="https://api.example.com/v1/chat/completions">
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

        <div class="nsfw-switcher-section">
            <div class="nsfw-switcher-title">
                <i class="fa-solid fa-robot"></i>
                模型切换配置
            </div>
            
            <div class="nsfw-switcher-form-group">
                <label class="nsfw-switcher-label" for="nsfw_switcher_model_a">
                    NSFW场景模型 <span class="required">*</span>
                </label>
                <input type="text" id="nsfw_switcher_model_a" class="nsfw-switcher-input"
                       placeholder="gpt-4">
            </div>
        </div>

        <div>
            <button id="nsfw_switcher_test_btn" class="nsfw-switcher-btn nsfw-switcher-btn-primary">
                <i class="fa-solid fa-play"></i> 测试API
            </button>
            <button id="nsfw_switcher_restore_btn" class="nsfw-switcher-btn nsfw-switcher-btn-secondary">
                <i class="fa-solid fa-rotate-left"></i> 恢复原模型
            </button>
            <br>
            <button id="nsfw_switcher_reset_btn" class="nsfw-switcher-btn nsfw-switcher-btn-danger">
                <i class="fa-solid fa-trash"></i> 重置所有设置
            </button>
        </div>
    </div>
    `;
}

function onMenuItemClick() {
    const popupContent = createSettingsHtml();
    
    const popup = document.createElement('div');
    popup.innerHTML = popupContent;
    document.body.appendChild(popup);
    
    const dialog = popup.querySelector('.nsfw-switcher-settings-panel');
    dialog.style.position = 'fixed';
    dialog.style.top = '50%';
    dialog.style.left = '50%';
    dialog.style.transform = 'translate(-50%, -50%)';
    dialog.style.zIndex = '9999';
    dialog.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
    
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.background = 'rgba(0,0,0,0.5)';
    overlay.style.zIndex = '9998';
    document.body.appendChild(overlay);
    
    overlay.addEventListener('click', () => {
        document.body.removeChild(popup);
        document.body.removeChild(overlay);
    });
    
    loadSettings();
    initSettingsListeners();
}

function addExtensionMenuItem() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.id === 'extensionsMenu' || (node.querySelector && node.querySelector('#extensionsMenu'))) {
                        console.log('[NSFW模型切换器] 检测到扩展菜单已加载');
                        addMenuItem();
                        observer.disconnect();
                        return;
                    }
                }
            }
        }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    setTimeout(() => {
        observer.disconnect();
        if (!document.getElementById('nsfw_switcher_menu_item')) {
            addMenuItem();
        }
    }, 5000);
}

function addMenuItem() {
    const extensionsMenu = document.getElementById('extensionsMenu');
    if (!extensionsMenu) {
        console.error('[NSFW模型切换器] 无法找到扩展菜单');
        return;
    }
    
    const menuItem = document.createElement('div');
    menuItem.id = 'nsfw_switcher_menu_item';
    menuItem.className = 'list-group-item flex-container flexGap5';
    menuItem.title = 'NSFW模型切换器';
    menuItem.innerHTML = `
        <div class="fa-solid fa-shield-halved extensionsMenuExtensionButton"></div>
        <span>NSFW模型切换器</span>
    `;
    
    menuItem.addEventListener('click', onMenuItemClick);
    
    extensionsMenu.appendChild(menuItem);
    console.log('[NSFW模型切换器] 已添加到扩展菜单');
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

    addExtensionMenuItem();

    console.log('[NSFW模型切换器] 插件初始化完成');
}

if (typeof jQuery !== 'undefined') {
    jQuery(() => {
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
