const SceneAnalyzer = require('./src/SceneAnalyzer');
const ModelSwitcher = require('./src/ModelSwitcher');
const ConfigManager = require('./src/ConfigManager');
const APIBridge = require('./src/APIBridge');

class AutoModelSwitcher {
    constructor() {
        this.configManager = new ConfigManager();
        this.apiBridge = new APIBridge(this.configManager);
        this.sceneAnalyzer = new SceneAnalyzer(this.apiBridge, this.configManager);
        this.modelSwitcher = new ModelSwitcher(this.apiBridge, this.configManager);
        this.enabled = false;
        this.currentModel = null;
        this.conversationHistory = [];
    }

    async init() {
        console.log('[Auto Model Switcher] 插件初始化中...');
        
        await this.configManager.loadConfig();
        
        this.enabled = this.configManager.get('enabled', true);
        this.currentModel = this.configManager.get('currentModel', null);
        
        this.setupEventListeners();
        
        console.log('[Auto Model Switcher] 插件初始化完成');
        console.log(`[Auto Model Switcher] 当前模型: ${this.currentModel}`);
        console.log(`[Auto Model Switcher] 自动切换: ${this.enabled ? '启用' : '禁用'}`);
    }

    setupEventListeners() {
        if (typeof window !== 'undefined') {
            window.addEventListener('message', (event) => {
                this.handleMessage(event);
            });
        }
    }

    handleMessage(event) {
        const { type, data } = event.data;
        
        switch (type) {
            case 'userMessage':
                this.onUserMessage(data);
                break;
            case 'assistantMessage':
                this.onAssistantMessage(data);
                break;
            case 'enable':
                this.enable();
                break;
            case 'disable':
                this.disable();
                break;
            case 'updateConfig':
                this.updateConfig(data);
                break;
        }
    }

    async onUserMessage(message) {
        this.conversationHistory.push({
            role: 'user',
            content: message,
            timestamp: Date.now()
        });
        
        if (this.shouldAnalyze()) {
            await this.analyzeAndSwitch();
        }
    }

    onAssistantMessage(message) {
        this.conversationHistory.push({
            role: 'assistant',
            content: message,
            timestamp: Date.now()
        });
        
        this.trimHistory();
    }

    shouldAnalyze() {
        if (!this.enabled) return false;
        
        const sensitivity = this.configManager.get('sensitivity', 0.5);
        const threshold = Math.floor(10 * (1 - sensitivity)) + 1;
        
        return this.conversationHistory.length >= threshold;
    }

    async analyzeAndSwitch() {
        try {
            console.log('[Auto Model Switcher] 开始分析对话场景...');
            
            const sceneType = await this.sceneAnalyzer.analyze(
                this.conversationHistory.slice(-10)
            );
            
            console.log(`[Auto Model Switcher] 识别场景: ${sceneType}`);
            
            const targetModel = this.modelSwitcher.selectModel(sceneType);
            
            if (targetModel && targetModel !== this.currentModel) {
                console.log(`[Auto Model Switcher] 切换模型: ${this.currentModel} -> ${targetModel}`);
                
                await this.modelSwitcher.switchTo(targetModel);
                this.currentModel = targetModel;
                
                if (this.configManager.get('showNotification', true)) {
                    this.showNotification(sceneType, targetModel);
                }
            }
        } catch (error) {
            console.error('[Auto Model Switcher] 分析失败:', error);
        }
    }

    showNotification(sceneType, model) {
        if (typeof toast !== 'undefined') {
            toast(`场景: ${sceneType} → 模型: ${model}`);
        }
    }

    trimHistory() {
        const maxHistory = this.configManager.get('maxHistory', 50);
        if (this.conversationHistory.length > maxHistory) {
            this.conversationHistory = this.conversationHistory.slice(-maxHistory);
        }
    }

    enable() {
        this.enabled = true;
        this.configManager.set('enabled', true);
        console.log('[Auto Model Switcher] 插件已启用');
    }

    disable() {
        this.enabled = false;
        this.configManager.set('enabled', false);
        console.log('[Auto Model Switcher] 插件已禁用');
    }

    updateConfig(config) {
        Object.keys(config).forEach(key => {
            this.configManager.set(key, config[key]);
        });
        console.log('[Auto Model Switcher] 配置已更新');
    }

    getStatus() {
        return {
            enabled: this.enabled,
            currentModel: this.currentModel,
            conversationLength: this.conversationHistory.length
        };
    }
}

const plugin = new AutoModelSwitcher();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = plugin;
}

if (typeof window !== 'undefined') {
    window.AutoModelSwitcher = plugin;
}

module.exports = { AutoModelSwitcher, plugin };
