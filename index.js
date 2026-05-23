console.log('[NSFW模型切换器] 插件加载中...');

try {
    import('./settings.js').then(({
        loadSettings,
        saveSettings,
        getSetting,
        setSetting,
        initSettingsListeners,
        updateStatusDisplay,
        getSettings
    }) => {
        console.log('[NSFW模型切换器] settings.js 加载成功');
        
        let originalModel = null;
        let isTemporarySwitch = false;
        let lastAiMessage = null;
        let eventSource = null;
        let event_types = null;

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

                const modelAApiUrl = getSetting('modelAApiUrl', '');
                const modelAApiKey = getSetting('modelAApiKey', '');
                const modelASource = getSetting('modelASource', 'openai');

                if (modelAApiUrl) {
                    console.log('[NSFW模型切换器] 使用独立API配置:', modelASource);
                    
                    oai_settings.chat_completion_source = chat_completion_sources[modelASource.toUpperCase()] || chat_completion_sources.OPENAI;
                    
                    if (modelASource === 'openai') {
                        oai_settings.openai_api_base_url = modelAApiUrl;
                        oai_settings.openai_api_key = modelAApiKey;
                        oai_settings.openai_model = targetModel;
                        $('#model_openai_select').val(targetModel).trigger('change');
                    } else if (modelASource === 'claude') {
                        oai_settings.claude_api_base_url = modelAApiUrl;
                        oai_settings.claude_api_key = modelAApiKey;
                        oai_settings.claude_model = targetModel;
                        $('#model_claude_select').val(targetModel).trigger('change');
                    } else if (modelASource === 'openrouter') {
                        oai_settings.openrouter_api_base_url = modelAApiUrl;
                        oai_settings.openrouter_api_key = modelAApiKey;
                        oai_settings.openrouter_model = targetModel;
                        $('#model_openrouter_select').val(targetModel).trigger('change');
                    }
                } else {
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
                const modelAApiUrl = getSetting('modelAApiUrl', '');

                if (modelAApiUrl) {
                    if (currentSource === chat_completion_sources.OPENAI) {
                        oai_settings.openai_model = originalModel;
                        $('#model_openai_select').val(originalModel).trigger('change');
                    } else if (currentSource === chat_completion_sources.CLAUDE) {
                        oai_settings.claude_model = originalModel;
                        $('#model_claude_select').val(originalModel).trigger('change');
                    } else if (currentSource === chat_completion_sources.OPENROUTER) {
                        oai_settings.openrouter_model = originalModel;
                        $('#model_openrouter_select').val(originalModel).trigger('change');
                    }
                } else {
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
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b><i class="fa-solid fa-shield-halved" style="margin-right: 8px;"></i>NSFW模型切换器</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div style="padding: 15px;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                            <div id="nsfw_switcher_status_indicator" style="width: 10px; height: 10px; border-radius: 50%; background: #f39c12;"></div>
                            <div>
                                <strong>状态:</strong>
                                <span id="nsfw_switcher_status_text">配置不完整</span>
                            </div>
                        </div>

                        <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
                            <div style="font-weight: 600; color: #333; margin-bottom: 10px;">
                                <i class="fa-solid fa-toggle-on" style="margin-right: 8px;"></i>启用插件
                            </div>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="nsfw_switcher_enabled" checked>
                                <span>启用NSFW检测</span>
                            </label>
                        </div>

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
                                <label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">
                                    API密钥
                                </label>
                                <input type="password" id="nsfw_switcher_api_key" 
                                       style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;"
                                       placeholder="sk-... (可选)">
                            </div>

                            <div style="margin-bottom: 12px;">
                                <label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">
                                    模型名称
                                </label>
                                <input type="text" id="nsfw_switcher_model_name" 
                                       style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;"
                                       value="nsfw-detector">
                            </div>
                        </div>

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
                                    目标模型API地址
                                </label>
                                <input type="text" id="nsfw_switcher_model_a_api_url" 
                                       style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;"
                                       placeholder="https://api.example.com/v1/chat/completions">
                            </div>

                            <div style="margin-bottom: 12px;">
                                <label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">
                                    目标模型API密钥
                                </label>
                                <input type="password" id="nsfw_switcher_model_a_api_key" 
                                       style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;"
                                       placeholder="sk-... (可选)">
                            </div>

                            <div style="margin-bottom: 12px;">
                                <label style="display: block; font-weight: 500; color: #555; margin-bottom: 5px; font-size: 13px;">
                                    API来源
                                </label>
                                <select id="nsfw_switcher_model_a_source" 
                                        style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;">
                                    <option value="openai">OpenAI</option>
                                    <option value="claude">Claude</option>
                                    <option value="openrouter">OpenRouter</option>
                                </select>
                            </div>
                        </div>

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

                        <button id="nsfw_switcher_reset_btn" 
                                style="width: 100%; padding: 8px 12px; border: none; border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer; background: #ffeaa7; color: #d63031;">
                            <i class="fa-solid fa-trash"></i> 重置所有设置
                        </button>
                    </div>
                </div>
            </div>
            `;
        }

        function addSettingsPanel() {
            console.log('[NSFW模型切换器] 开始添加设置面板...');
            
            const $extensionsSettings = $('#extensions_settings');
            console.log('[NSFW模型切换器] extensions_settings元素:', $extensionsSettings.length);
            
            if ($extensionsSettings.length === 0) {
                console.warn('[NSFW模型切换器] extensions_settings元素不存在，尝试添加到body');
                const $panel = $(createSettingsHtml());
                $panel.css({
                    position: 'fixed',
                    top: '20px',
                    right: '20px',
                    zIndex: '9999',
                    background: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    maxWidth: '400px',
                    maxHeight: '80vh',
                    overflowY: 'auto'
                });
                $('body').append($panel);
                console.log('[NSFW模型切换器] 设置面板已添加到body');
            } else {
                try {
                    const settingsHtml = createSettingsHtml();
                    console.log('[NSFW模型切换器] 设置HTML已创建');
                    
                    const $panel = $(settingsHtml);
                    console.log('[NSFW模型切换器] jQuery对象已创建');
                    
                    $extensionsSettings.append($panel);
                    console.log('[NSFW模型切换器] 设置面板已添加到extensions_settings');
                } catch (e) {
                    console.error('[NSFW模型切换器] 添加设置面板失败:', e);
                }
            }
            
            loadSettings();
            console.log('[NSFW模型切换器] 设置已加载');
            
            initSettingsListeners();
            console.log('[NSFW模型切换器] 设置监听器已初始化');
        }

        async function registerEventListeners() {
            console.log('[NSFW模型切换器] 尝试注册事件监听...');
            
            try {
                const module = await import('../../extensions.js');
                eventSource = module.eventSource;
                event_types = module.event_types;
                
                eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onAiMessageRendered);
                eventSource.on(event_types.MESSAGE_SENT, onUserMessageSent);
                eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
                console.log('[NSFW模型切换器] 事件监听注册成功');
            } catch (e) {
                console.warn('[NSFW模型切换器] 注册事件失败:', e.message);
                console.log('[NSFW模型切换器] 将使用定时器轮询方式');
                
                setTimeout(() => {
                    registerEventListeners();
                }, 3000);
            }
        }

        async function initPlugin() {
            console.log('[NSFW模型切换器] 开始初始化...');
            
            const savedOriginalModel = getSetting('originalModel', null);
            if (savedOriginalModel) {
                originalModel = savedOriginalModel;
                console.log('[NSFW模型切换器] 已恢复原模型:', originalModel);
            }
            
            registerEventListeners();

            if (typeof jQuery !== 'undefined') {
                console.log('[NSFW模型切换器] jQuery已加载');
                
                $(document).ready(() => {
                    console.log('[NSFW模型切换器] DOM已就绪');
                    
                    setTimeout(() => {
                        console.log('[NSFW模型切换器] 尝试添加设置面板...');
                        addSettingsPanel();
                    }, 500);
                });
            } else {
                console.error('[NSFW模型切换器] jQuery未加载');
            }

            console.log('[NSFW模型切换器] 插件初始化完成');
        }

        initPlugin().catch(error => {
            console.error('[NSFW模型切换器] 初始化失败:', error);
        });

    }).catch(error => {
        console.error('[NSFW模型切换器] 加载settings.js失败:', error);
    });
} catch (e) {
    console.error('[NSFW模型切换器] 顶层错误:', e);
}
