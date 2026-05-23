const extensionName = 'nsfw-model-switcher';

const defaultSettings = {
    enabled: true,
    nsfwApiUrl: '',
    nsfwApiKey: '',
    nsfwModelName: 'nsfw-detector',
    modelA: '',
    modelAApiUrl: '',
    modelAApiKey: '',
    modelASource: 'openai',
    prompt: '判断以下内容是否为NSFW（成人内容）：\n\n{content}\n\n请只输出1（是）或0（否）。',
    showNotification: true,
    debugMode: false,
    maxLength: 2000
};

export function loadSettings() {
    try {
        const settings = JSON.parse(localStorage.getItem('extension_settings') || '{}');
        if (!settings[extensionName]) {
            settings[extensionName] = defaultSettings;
            localStorage.setItem('extension_settings', JSON.stringify(settings));
        }
        
        const currentSettings = settings[extensionName];
        
        $('#nsfw_switcher_enabled').prop('checked', currentSettings.enabled);
        $('#nsfw_switcher_api_url').val(currentSettings.nsfwApiUrl || '');
        $('#nsfw_switcher_api_key').val(currentSettings.nsfwApiKey || '');
        $('#nsfw_switcher_model_name').val(currentSettings.nsfwModelName || 'nsfw-detector');
        $('#nsfw_switcher_model_a').val(currentSettings.modelA || '');
        $('#nsfw_switcher_model_a_api_url').val(currentSettings.modelAApiUrl || '');
        $('#nsfw_switcher_model_a_api_key').val(currentSettings.modelAApiKey || '');
        $('#nsfw_switcher_model_a_source').val(currentSettings.modelASource || 'openai');
        $('#nsfw_switcher_prompt').val(currentSettings.prompt || defaultSettings.prompt);
        $('#nsfw_switcher_show_notification').prop('checked', currentSettings.showNotification !== false);
        $('#nsfw_switcher_debug_mode').prop('checked', currentSettings.debugMode === true);
        $('#nsfw_switcher_max_length').val(currentSettings.maxLength || 2000);
        
        updatePluginStatus();
    } catch (e) {
        console.error('[NSFW模型切换器] 加载设置失败:', e);
    }
}

export function saveSettings() {
    try {
        const settings = JSON.parse(localStorage.getItem('extension_settings') || '{}');
        if (!settings[extensionName]) {
            settings[extensionName] = {};
        }
        
        settings[extensionName] = {
            enabled: $('#nsfw_switcher_enabled').prop('checked'),
            nsfwApiUrl: $('#nsfw_switcher_api_url').val().trim(),
            nsfwApiKey: $('#nsfw_switcher_api_key').val().trim(),
            nsfwModelName: $('#nsfw_switcher_model_name').val().trim() || 'nsfw-detector',
            modelA: $('#nsfw_switcher_model_a').val().trim(),
            modelAApiUrl: $('#nsfw_switcher_model_a_api_url').val().trim(),
            modelAApiKey: $('#nsfw_switcher_model_a_api_key').val().trim(),
            modelASource: $('#nsfw_switcher_model_a_source').val() || 'openai',
            prompt: $('#nsfw_switcher_prompt').val(),
            showNotification: $('#nsfw_switcher_show_notification').prop('checked'),
            debugMode: $('#nsfw_switcher_debug_mode').prop('checked'),
            maxLength: parseInt($('#nsfw_switcher_max_length').val()) || 2000
        };
        
        localStorage.setItem('extension_settings', JSON.stringify(settings));
        
        updatePluginStatus();
    } catch (e) {
        console.error('[NSFW模型切换器] 保存设置失败:', e);
    }
}

export function getSetting(name, defaultValue = null) {
    try {
        const settings = JSON.parse(localStorage.getItem('extension_settings') || '{}');
        return settings[extensionName]?.[name] ?? defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

export function setSetting(name, value) {
    try {
        const settings = JSON.parse(localStorage.getItem('extension_settings') || '{}');
        if (!settings[extensionName]) {
            settings[extensionName] = {};
        }
        settings[extensionName][name] = value;
        localStorage.setItem('extension_settings', JSON.stringify(settings));
    } catch (e) {
        console.error('[NSFW模型切换器] 保存设置失败:', e);
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function initSettingsListeners() {
    $('#nsfw_switcher_enabled').on('change', () => {
        saveSettings();
        updatePluginStatus();
    });
    
    $('#nsfw_switcher_api_url, #nsfw_switcher_api_key, #nsfw_switcher_model_name, #nsfw_switcher_model_a, #nsfw_switcher_model_a_api_url, #nsfw_switcher_model_a_api_key, #nsfw_switcher_model_a_source').on('input', debounce(saveSettings, 500));
    $('#nsfw_switcher_prompt').on('input', debounce(saveSettings, 1000));
    $('#nsfw_switcher_max_length').on('change', saveSettings);
    $('#nsfw_switcher_show_notification, #nsfw_switcher_debug_mode').on('change', saveSettings);
    
    $('#nsfw_switcher_test_btn').on('click', async () => {
        const testContent = '这是一个测试内容。请判断这个内容是否包含NSFW元素。';
        const apiUrl = $('#nsfw_switcher_api_url').val().trim();
        const apiKey = $('#nsfw_switcher_api_key').val().trim();
        const modelName = $('#nsfw_switcher_model_name').val().trim() || 'nsfw-detector';
        
        if (!apiUrl) {
            showToast('请先配置NSFW检测API地址', 'error');
            return;
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
                        content: testContent
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
            
            if (result === '0') {
                showToast('✅ 测试成功！API连接正常，返回结果：正常内容', 'success');
            } else if (result === '1') {
                showToast('⚠️ 测试成功！但模型判断为NSFW内容', 'warning');
            } else {
                showToast(`❌ 测试失败：无法解析结果 "${result}"`, 'error');
            }
        } catch (error) {
            showToast(`❌ 测试失败：${error.message}`, 'error');
        }
    });
    
    $('#nsfw_switcher_restore_btn').on('click', async () => {
        if (typeof window.restoreNsfwOriginalModel === 'function') {
            const result = await window.restoreNsfwOriginalModel();
            if (result) {
                showToast('✅ 已恢复原模型', 'success');
            } else {
                showToast('ℹ️ 无需恢复，当前已是原模型', 'info');
            }
            updatePluginStatus();
        }
    });
    
    $('#nsfw_switcher_reset_btn').on('click', () => {
        if (confirm('确定要重置所有设置为默认值吗？')) {
            localStorage.setItem('extension_settings', JSON.stringify({
                [extensionName]: defaultSettings
            }));
            loadSettings();
            showToast('✅ 设置已重置为默认值', 'success');
        }
    });
}

function showToast(message, type = 'info') {
    if (typeof toastr !== 'undefined') {
        switch (type) {
            case 'success':
                toastr.success(message);
                break;
            case 'error':
                toastr.error(message);
                break;
            case 'warning':
                toastr.warning(message);
                break;
            default:
                toastr.info(message);
        }
    } else {
        alert(message);
    }
}

export function updatePluginStatus() {
    const enabled = $('#nsfw_switcher_enabled').prop('checked');
    const apiUrl = $('#nsfw_switcher_api_url').val().trim();
    const modelA = $('#nsfw_switcher_model_a').val().trim();
    
    const statusIndicator = $('#nsfw_switcher_status_indicator');
    const statusText = $('#nsfw_switcher_status_text');
    
    if (!enabled) {
        statusIndicator.removeClass('status-active status-warning').addClass('status-inactive');
        statusText.text('已禁用');
    } else if (!apiUrl || !modelA) {
        statusIndicator.removeClass('status-active status-inactive').addClass('status-warning');
        statusText.text('配置不完整');
    } else {
        statusIndicator.removeClass('status-inactive status-warning').addClass('status-active');
        statusText.text('运行中');
    }
}

export function getSettings() {
    try {
        const settings = JSON.parse(localStorage.getItem('extension_settings') || '{}');
        return settings[extensionName] || defaultSettings;
    } catch (e) {
        return defaultSettings;
    }
}
