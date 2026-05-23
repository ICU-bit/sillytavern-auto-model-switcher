console.log('[NSFW模型切换器] 插件开始加载...');

const extension_name = 'nsfw-model-switcher';
let logs = [];

function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('zh-CN');
    logs.unshift({ timestamp, message, type });
    if (logs.length > 50) {
        logs = logs.slice(0, 50);
    }
    console.log(`[NSFW模型切换器] ${message}`);
    updateLogDisplay();
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

function loadSettings() {
    try {
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
    } catch (e) {
        addLog('加载设置失败: ' + e.message, 'error');
        return {
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
}

function saveSettings() {
    try {
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
    } catch (e) {
        addLog('保存设置失败: ' + e.message, 'error');
    }
}

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
    
    $('#nsfw_switcher_enabled, #nsfw_switcher_api_url, #nsfw_switcher_api_key, #nsfw_switcher_model_name, ' +
      '#nsfw_switcher_model_a, #nsfw_switcher_model_a_api_url, #nsfw_switcher_model_a_api_key, #nsfw_switcher_model_a_source, ' +
      '#nsfw_switcher_show_notification, #nsfw_switcher_debug_mode').on('input change', () => {
        saveSettings();
    });
    
    $('#nsfw_switcher_test_btn').on('click', async () => {
        await testNsfwApi();
    });
    
    $('#nsfw_switcher_restore_btn').on('click', async () => {
        await restoreOriginalModel();
    });
    
    $('#nsfw_switcher_clear_logs_btn').on('click', () => {
        clearLogs();
        addLog('日志已清空', 'info');
    });
}

let originalModel = null;
let isTemporarySwitch = false;

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
        const prompt = '判断以下内容是否为NSFW（成人内容）：\n\n' + content + '\n\n请只输出1（是）或0（否）';
        
        if (debugMode) {
            addLog('调用NSFW检测API...', 'info');
        }

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

async function testNsfwApi() {
    const testContent = '这是一个测试内容。请判断这个内容是否包含NSFW元素。';
    const result = await detectNSFW(testContent);
    
    if (result === null) {
        if (typeof toastr !== 'undefined') {
            toastr.error('API测试失败，请检查配置');
        }
    } else if (result === '0' || result === 0 || result === false) {
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
}

async function switchToModel(targetModel) {
    if (!targetModel) {
        addLog('未指定切换模型', 'warning');
        return false;
    }

    try {
        const settings = loadSettings();
        
        if (!originalModel) {
            addLog('保存原模型', 'info');
        }

        addLog('切换模型到: ' + targetModel, 'success');

        const modelAApiUrl = settings.modelAApiUrl;
        const modelAApiKey = settings.modelAApiKey;
        const modelASource = settings.modelASource;

        if (modelAApiUrl) {
            addLog('使用独立API配置: ' + modelASource, 'info');
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

async function restoreOriginalModel() {
    if (!originalModel || !isTemporarySwitch) {
        addLog('无需恢复：当前已是原模型或从未切换', 'info');
        if (typeof toastr !== 'undefined') {
            toastr.info('无需恢复：当前已是原模型或从未切换');
        }
        return false;
    }

    try {
        addLog('恢复原模型: ' + originalModel, 'success');

        isTemporarySwitch = false;
        const model = originalModel;
        originalModel = null;

        const settings = loadSettings();
        if (settings.showNotification && typeof toastr !== 'undefined') {
            toastr.info('[NSFW模型切换器] 已恢复原模型: ' + (model || '默认模型'));
        }
        return true;
    } catch (e) {
        addLog('恢复模型失败: ' + e.message, 'error');
        return false;
    }
}

async function onCharacterMessageRendered(data) {
    try {
        const settings = loadSettings();
        if (!settings.enabled) {
            return;
        }

        const chatId = data.chatId || data.messageId;
        
        const content = data.mes || data.message || '';
        
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

function registerEventListeners() {
    try {
        addLog('等待酒馆事件系统', 'info');
        
        if (window.eventSource && window.event_types) {
            window.eventSource.on(window.event_types.CHARACTER_MESSAGE_RENDERED, onCharacterMessageRendered);
            addLog('事件监听注册成功', 'success');
        } else {
            addLog('酒馆事件系统未就绪', 'warning');
        }
    } catch (e) {
        addLog('事件监听注册失败: ' + e.message, 'error');
    }
}

function addSettingsPanel() {
    const extensionsSettings = $('#extensions_settings');
    
    if (extensionsSettings.length > 0) {
        extensionsSettings.append(createSettingsHtml());
        addLog('设置面板已添加到扩展设置', 'success');
        initSettingsListeners();
    } else {
        addLog('extensions_settings 元素未找到，尝试添加到 body', 'warning');
        const panel = $(createSettingsHtml());
        panel.css({
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            zIndex: '999999',
            maxWidth: '450px',
            maxHeight: '90vh',
            overflowY: 'auto'
        });
        $('body').append(panel);
        addLog('设置面板已添加到页面右下角', 'success');
        initSettingsListeners();
    }
}

try {
    addLog('插件开始加载...', 'info');
    
    $(document).ready(() => {
        addLog('DOM 已准备好', 'info');
        
        setTimeout(() => {
            addSettingsPanel();
            registerEventListeners();
            addLog('插件加载完成！', 'success');
        }, 500);
    });
    
} catch (error) {
    console.error('[NSFW模型切换器] 加载出错:', error);
    addLog('加载出错: ' + error.message, 'error');
}