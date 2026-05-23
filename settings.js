const extensionName = 'nsfw-model-switcher';

const defaultSettings = {
    enabled: true,
    nsfwApiUrl: '',
    nsfwApiKey: '',
    nsfwModelName: 'nsfw-detector',
    modelA: '',
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
        $('#nsfw_switcher_prompt').val(currentSettings.prompt || defaultSettings.prompt);
        $('#nsfw_switcher_show_notification').prop('checked', currentSettings.showNotification);
        $('#nsfw_switcher_debug_mode').prop('checked', currentSettings.debugMode);
        $('#nsfw_switcher_max_length').val(currentSettings.maxLength || 2000);
        
        console.log('[NSFW模型切换器] 设置已加载');
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
            prompt: $('#nsfw_switcher_prompt').val(),
            showNotification: $('#nsfw_switcher_show_notification').prop('checked'),
            debugMode: $('#nsfw_switcher_debug_mode').prop('checked'),
            maxLength: parseInt($('#nsfw_switcher_max_length').val()) || 2000
        };
        
        localStorage.setItem('extension_settings', JSON.stringify(settings));
        
        console.log('[NSFW模型切换器] 设置已保存');
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

export function initSettingsListeners() {
    $('#nsfw_switcher_enabled, #nsfw_switcher_show_notification, #nsfw_switcher_debug_mode').on('change', saveSettings);
    $('#nsfw_switcher_api_url, #nsfw_switcher_api_key, #nsfw_switcher_model_name, #nsfw_switcher_model_a').on('input', debounce(saveSettings, 500));
    $('#nsfw_switcher_prompt').on('input', debounce(saveSettings, 1000));
    $('#nsfw_switcher_max_length').on('change', saveSettings);
    
    $('#nsfw_switcher_test_btn').on('click', async () => {
        const testContent = '这是一个测试内容。';
        if (typeof window.testNsfwDetection === 'function') {
            const result = await window.testNsfwDetection(testContent);
            alert(`测试结果: ${result === true ? 'NSFW' : result === false ? '正常' : '检测失败'}`);
        } else {
            alert('请先配置NSFW检测API');
        }
    });
    
    $('#nsfw_switcher_restore_btn').on('click', async () => {
        if (typeof window.restoreNsfwOriginalModel === 'function') {
            await window.restoreNsfwOriginalModel();
            updateStatusDisplay();
        }
    });
    
    console.log('[NSFW模型切换器] 设置监听器已初始化');
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

export function updateStatusDisplay(currentModel, originalModel, isSwitched) {
    $('#nsfw_switcher_current_model').text(currentModel || '未检测');
    $('#nsfw_switcher_original_model').text(originalModel || '未保存');
    $('#nsfw_switcher_switch_status').text(isSwitched ? '已切换' : '正常');
}

export function getSettings() {
    try {
        const settings = JSON.parse(localStorage.getItem('extension_settings') || '{}');
        return settings[extensionName] || defaultSettings;
    } catch (e) {
        return defaultSettings;
    }
}
