console.log('[NSFW模型切换器] 插件加载中...');

const extensionName = 'nsfw-model-switcher';
let originalModel = null;
let isTemporarySwitch = false;
let lastAiMessage = null;

function getSetting(name, defaultValue = null) {
    try {
        const settings = JSON.parse(localStorage.getItem('extension_settings') || '{}');
        return settings[extensionName]?.[name] ?? defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

function setSetting(name, value) {
    try {
        const settings = JSON.parse(localStorage.getItem('extension_settings') || '{}');
        if (!settings[extensionName]) {
            settings[extensionName] = {};
        }
        settings[extensionName][name] = value;
        localStorage.setItem('extension_settings', JSON.stringify(settings));
    } catch (e) {
        console.error('[NSFW模型切换器] 设置保存失败:', e);
    }
}

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
        }

        if (currentModel === targetModel) {
            console.log('[NSFW模型切换器] 已是目标模型，无需切换');
            isTemporarySwitch = true;
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

        if (typeof toastr !== 'undefined') {
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

        if (typeof toastr !== 'undefined') {
            toastr.info(`[NSFW模型切换器] 已恢复原模型: ${restoredModel || '默认模型'}`);
        }
        return true;
    } catch (e) {
        console.error('[NSFW模型切换器] 恢复模型失败:', e);
        return false;
    }
}

async function detectNSFW(content) {
    const apiUrl = getSetting('nsfwApiUrl');
    const apiKey = getSetting('nsfwApiKey');
    const modelName = getSetting('nsfwModelName', 'nsfw-detector');

    if (!apiUrl) {
        console.log('[NSFW模型切换器] 未配置NSFW检测API');
        return null;
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
            },
            body: JSON.stringify({
                model: modelName,
                messages: [{
                    role: 'user',
                    content: `判断以下内容是否为NSFW（成人内容）：\n\n${content}\n\n请只输出1（是）或0（否）。`
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

        console.log('[NSFW模型切换器] 检测结果:', result);

        return result === '1';
    } catch (error) {
        console.error('[NSFW模型切换器] 检测失败:', error);
        return null;
    }
}

async function onAiMessageRendered(chatId) {
    try {
        const { getContext } = await import('../../extensions.js');
        const context = getContext();
        const chat = context.chat[chatId];

        if (!chat || chat.is_user) {
            return;
        }

        lastAiMessage = chat.mes;
        console.log('[NSFW模型切换器] 捕获AI回复:', chatId, chat.mes.substring(0, 50));

        const enabled = getSetting('enabled', true);
        if (!enabled) {
            console.log('[NSFW模型切换器] 插件已禁用');
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

        console.log('[NSFW模型切换器] 用户发送消息:', mesId);

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
    }
}

function initSettings() {
    const defaultSettings = {
        enabled: true,
        nsfwApiUrl: '',
        nsfwApiKey: '',
        nsfwModelName: 'nsfw-detector',
        modelA: ''
    };

    try {
        const currentSettings = JSON.parse(localStorage.getItem('extension_settings') || '{}');
        if (!currentSettings[extensionName]) {
            currentSettings[extensionName] = defaultSettings;
            localStorage.setItem('extension_settings', JSON.stringify(currentSettings));
        }

        originalModel = getSetting('originalModel', null);
        console.log('[NSFW模型切换器] 初始化完成，原模型:', originalModel);
    } catch (e) {
        console.error('[NSFW模型切换器] 初始化设置失败:', e);
    }
}

function initPlugin() {
    initSettings();

    try {
        import('../../extensions.js').then(({ eventSource, event_types }) => {
            eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onAiMessageRendered);
            eventSource.on(event_types.MESSAGE_SENT, onUserMessageSent);
            eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

            console.log('[NSFW模型切换器] 事件监听已注册');
            console.log('[NSFW模型切换器] 插件加载完成');
        });
    } catch (e) {
        console.error('[NSFW模型切换器] 注册事件失败:', e);
    }
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
