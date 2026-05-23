import {
    eventSource,
    event_types,
    saveSettingsDebounced,
    getContext,
    oai_settings,
    chat_completion_sources,
    getChatCompletionModel,
} from '../../../script.js';

const extension_name = 'nsfw-model-switcher';

// 从 localStorage 加载设置
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('extension_settings') || '{}');
    return settings[extension_name] || {
        enabled: true,
        nsfwApiUrl: '',
        nsfwApiKey: '',
        nsfwModelName: '',
        modelA: '',
        modelAApiUrl: '',
        modelAApiKey: '',
        modelASource: 'openai',
        showNotification: true,
        debugMode: false,
    };
}

// 保存设置到 localStorage
function saveSettings() {
    const settings = JSON.parse(localStorage.getItem('extension_settings') || '{}');
    settings[extension_name] = {
        enabled: $('#nsfw_switcher_enabled').prop('checked'),
        nsfwApiUrl: $('#nsfw_switcher_api_url').val(),
        nsfwApiKey: $('#nsfw_switcher_api_key').val(),
        nsfwModelName: $('#nsfw_switcher_model_name').val(),
        modelA: $('#nsfw_switcher_model_a').val(),
        modelAApiUrl: $('#nsfw_switcher_model_a_api_url').val(),
        modelAApiKey: $('#nsfw_switcher_model_a_api_key').val(),
        modelASource: $('#nsfw_switcher_model_a_source').val(),
        showNotification: $('#nsfw_switcher_show_notification').prop('checked'),
        debugMode: $('#nsfw_switcher_debug_mode').prop('checked'),
    };
    localStorage.setItem('extension_settings', JSON.stringify(settings));
    updateStatus();
}

// 添加日志
let logs = [];

function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('zh-CN');
    logs.unshift({ timestamp, message, type });
    if (logs.length > 50) {
        logs = logs.slice(0, 50);
    }
    updateLogDisplay();
    console.log(`[NSFW模型切换器] ${message}`);
}

function clearLogs() {
    logs = [];
    updateLogDisplay();
}

function updateLogDisplay() {
    const container = $('#nsfw_switcher_logs');
    if (!container.length) return;
    
    let html = '';
    for (const log of logs) {
        const color = log.type === 'success' ? '#27ae60' :
                      log.type === 'warning' ? '#f39c12' :
                      log.type === 'error' ? '#e74c3c' : '#3498db';
        html += `
            <div style="display: flex; gap: 8px; padding: 4px 0; font-size: 12px;">
                <span style="color: #999; font-family: monospace;">${log.timestamp}</span>
                <span style="color: ${color};">[${log.type.toUpperCase()}]</span>
                <span style="color: #333;">${log.message}</span>
            </div>
        `;
    }
    
    if (!html) {
        html = '<div style="color: #999; font-size: 12px; text-align: center;">暂无日志</div>';
    }
    
    container.html(html);
}

// 更新状态显示
function updateStatus() {
    const settings = loadSettings();
    const statusIndicator = $('#nsfw_switcher_status_indicator');
    const statusText = $('#nsfw_switcher_status_text');
    
    if (!settings.enabled) {
        statusIndicator.css('background', '#e74c3c');
        statusText.text('已禁用');
    } else if (!settings.nsfwApiUrl || !settings.modelA) {
        statusIndicator.css('background', '#f39c12');
        statusText.text('配置不完整');
    } else {
        statusIndicator.css('background', '#27ae60');
        statusText.text('运行中');
    }
}

// 创建设置面板 HTML
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
                                   placeholder="nsfw-detector">
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

                    <button id="nsfw_switcher_clear_logs_btn" 
                            style="width: 100%; padding: 8px 12px; border: none; border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer; background: #ffeaa7; color: #d63031;">
                        <i class="fa-solid fa-trash"></i> 清空日志
                    </button>

                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                        <div style="font-weight: 600; color: #333; margin-bottom: 10px;">
                            <i class="fa-solid fa-scroll" style="margin-right: 8px;"></i>运行日志
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

let originalModel = null;
let isTemporarySwitch = false;

// 切换到模型 A
async function switchToModel(targetModel) {
    if (!targetModel) {
        addLog('未指定切换模型', 'warning');
        return false;
    }

    try {
        const currentSource = oai_settings.chat_completion_source;
        const currentModel = getChatCompletionModel();

        if (!originalModel) {
            originalModel = currentModel;
            addLog('保存原模型: ' + originalModel, 'info');
        }

        if (currentModel === targetModel) {
            addLog('已是目标模型，无需切换', 'info');
            isTemporarySwitch = true;
            return true;
        }

        addLog('切换模型: ' + currentModel + ' -> ' + targetModel, 'success');

        const settings = loadSettings();
        const modelAApiUrl = settings.modelAApiUrl;
        const modelAApiKey = settings.modelAApiKey;
        const modelASource = settings.modelASource;

        if (modelAApiUrl) {
            addLog('使用独立API配置: ' + modelASource, 'info');
            
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
                addLog('不支持的API来源: ' + currentSource, 'error');
                return false;
            }
        }

        isTemporarySwitch = true;
        
        if (settings.showNotification && typeof toastr !== 'undefined') {
            toastr.info('[NSFW模型切换器] 已切换到: ' + targetModel);
        }
        return true;
    } catch (e) {
        addLog('切换模型失败: ' + e.message, 'error');
        return false;
    }
}

// 恢复到原模型
async function restoreOriginalModel() {
    if (!originalModel || !isTemporarySwitch) {
        addLog('无需恢复：当前已是原模型或从未切换', 'info');
        return false;
    }

    try {
        const currentModel = getChatCompletionModel();

        if (currentModel === originalModel) {
            addLog('已是原模型，无需恢复', 'info');
            isTemporarySwitch = false;
            return true;
        }

        addLog('恢复原模型: ' + currentModel + ' -> ' + originalModel, 'success');

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
            addLog('不支持的API来源: ' + currentSource, 'error');
            return false;
        }

        isTemporarySwitch = false;
        const restoredModel = originalModel;
        originalModel = null;

        const settings = loadSettings();
        if (settings.showNotification && typeof toastr !== 'undefined') {
            toastr.info('[NSFW模型切换器] 已恢复原模型: ' + (restoredModel || '默认模型'));
        }
        return true;
    } catch (e) {
        addLog('恢复模型失败: ' + e.message, 'error');
        return false;
    }
}

// NSFW 检测
async function detectNSFW(content) {
    const settings = loadSettings();
    const { nsfwApiUrl, nsfwApiKey, nsfwModelName, debugMode } = settings;

    if (!nsfwApiUrl) {
        if (debugMode) {
            addLog('未配置NSFW检测API', 'warning');
        }
        return null;
    }

    try {
        const prompt = '判断以下内容是否为NSFW（成人内容）：\n\n' + content + '\n\n请只输出1（是）或0（否）。';
        
        const response = await fetch(nsfwApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(nsfwApiKey ? { 'Authorization': 'Bearer ' + nsfwApiKey } : {})
            },
            body: JSON.stringify({
                model: nsfwModelName || 'nsfw-detector',
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                temperature: 0.0,
                max_tokens: 1
            })
        });

        if (!response.ok) {
            throw new Error('API请求失败: ' + response.status);
        }

        const data = await response.json();
        const result = data.choices?.[0]?.message?.content?.trim();

        if (debugMode) {
            addLog('检测结果: ' + result, 'info');
        }

        return result === '1';
    } catch (error) {
        addLog('检测失败: ' + error.message, 'error');
        return null;
    }
}

// 处理 AI 消息事件
async function onCharacterMessageRendered(data) {
    try {
        const settings = loadSettings();
        if (!settings.enabled) {
            return;
        }

        const context = getContext();
        const chatId = data.chatId || data.messageId;
        const chat = context.chat[chatId];

        if (!chat || chat.is_user) {
            return;
        }

        const content = chat.mes || '';
        
        if (settings.debugMode) {
            addLog('捕获AI回复', 'info');
        }

        const nsfwDetected = await detectNSFW(content);

        if (nsfwDetected === true) {
            if (settings.modelA) {
                await switchToModel(settings.modelA);
            } else {
                addLog('未配置目标模型A', 'warning');
            }
        } else if (nsfwDetected === false && isTemporarySwitch) {
            await restoreOriginalModel();
        }
    } catch (e) {
        addLog('处理AI消息失败: ' + e.message, 'error');
    }
}

// 处理用户发送消息事件
async function onMessageSent(data) {
    try {
        const settings = loadSettings();
        if (!settings.enabled) {
            return;
        }

        if (settings.debugMode) {
            addLog('用户发送消息', 'info');
        }

        // 如果当前是临时切换的状态，且上一次是NSFW，则下次需要恢复
        // 但这个逻辑我们已经在 AI 回复后处理了
    } catch (e) {
        addLog('处理用户消息失败: ' + e.message, 'error');
    }
}

// 初始化设置监听器
function initSettingsListeners() {
    const settings = loadSettings();
    
    $('#nsfw_switcher_enabled').prop('checked', settings.enabled);
    $('#nsfw_switcher_api_url').val(settings.nsfwApiUrl);
    $('#nsfw_switcher_api_key').val(settings.nsfwApiKey);
    $('#nsfw_switcher_model_name').val(settings.nsfwModelName);
    $('#nsfw_switcher_model_a').val(settings.modelA);
    $('#nsfw_switcher_model_a_api_url').val(settings.modelAApiUrl);
    $('#nsfw_switcher_model_a_api_key').val(settings.modelAApiKey);
    $('#nsfw_switcher_model_a_source').val(settings.modelASource);
    $('#nsfw_switcher_show_notification').prop('checked', settings.showNotification);
    $('#nsfw_switcher_debug_mode').prop('checked', settings.debugMode);
    
    updateStatus();
    
    // 保存设置
    $('#nsfw_switcher_enabled, #nsfw_switcher_api_url, #nsfw_switcher_api_key, #nsfw_switcher_model_name, ' +
      '#nsfw_switcher_model_a, #nsfw_switcher_model_a_api_url, #nsfw_switcher_model_a_api_key, #nsfw_switcher_model_a_source, ' +
      '#nsfw_switcher_show_notification, #nsfw_switcher_debug_mode').on('input change', () => {
        saveSettings();
    });
    
    // 测试API
    $('#nsfw_switcher_test_btn').on('click', async () => {
        const testContent = '这是一个测试内容。请判断这个内容是否包含NSFW元素。';
        const result = await detectNSFW(testContent);
        
        if (result === null) {
            if (typeof toastr !== 'undefined') {
                toastr.error('API测试失败，请检查配置');
            }
        } else if (result === '0' || result === 0) {
            if (typeof toastr !== 'undefined') {
                toastr.success('API测试成功！返回结果：正常内容');
            }
            addLog('API测试成功！返回结果：正常内容', 'success');
        } else {
            if (typeof toastr !== 'undefined') {
                toastr.warning('API测试成功！但模型判断为NSFW内容');
            }
            addLog('API测试成功！但模型判断为NSFW内容', 'warning');
        }
    });
    
    // 恢复原模型
    $('#nsfw_switcher_restore_btn').on('click', async () => {
        const result = await restoreOriginalModel();
        if (!result && typeof toastr !== 'undefined') {
            toastr.info('无需恢复：当前已是原模型或从未切换');
        }
    });
    
    // 清空日志
    $('#nsfw_switcher_clear_logs_btn').on('click', () => {
        clearLogs();
        addLog('日志已清空', 'info');
    });
}

// 添加设置面板
function addSettingsPanel() {
    const extensionsSettings = $('#extensions_settings');
    
    if (!extensionsSettings.length) {
        addLog('未找到 extensions_settings 元素', 'warning');
        return;
    }
    
    extensionsSettings.append(createSettingsHtml());
    addLog('设置面板已添加', 'success');
    
    initSettingsListeners();
}

// 插件初始化
function initPlugin() {
    addLog('插件加载中...', 'info');
    
    // 注册事件监听器
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onCharacterMessageRendered);
    eventSource.on(event_types.MESSAGE_SENT, onMessageSent);
    
    addLog('事件监听器已注册', 'success');
    
    // 等待 DOM 准备好后添加设置面板
    $(document).ready(() => {
        setTimeout(() => {
            addSettingsPanel();
        }, 500);
    });
    
    addLog('插件初始化完成', 'success');
}

// 启动插件
initPlugin();
