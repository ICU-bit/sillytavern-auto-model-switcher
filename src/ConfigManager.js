class ConfigManager {
    constructor() {
        this.config = {
            enabled: true,
            analysisModel: 'gpt-3.5-turbo',
            currentModel: null,
            modelPool: ['gpt-3.5-turbo', 'gpt-4'],
            sensitivity: 0.5,
            showNotification: true,
            maxHistory: 50,
            sceneRules: {},
            userPreferences: {}
        };
        
        this.defaults = { ...this.config };
    }

    async loadConfig() {
        try {
            const savedConfig = localStorage.getItem('autoModelSwitcherConfig');
            if (savedConfig) {
                const parsed = JSON.parse(savedConfig);
                this.config = { ...this.defaults, ...parsed };
                console.log('[ConfigManager] 配置已加载');
            } else {
                console.log('[ConfigManager] 使用默认配置');
            }
        } catch (error) {
            console.error('[ConfigManager] 加载配置失败:', error);
            this.config = { ...this.defaults };
        }
    }

    async saveConfig() {
        try {
            localStorage.setItem(
                'autoModelSwitcherConfig',
                JSON.stringify(this.config)
            );
            console.log('[ConfigManager] 配置已保存');
        } catch (error) {
            console.error('[ConfigManager] 保存配置失败:', error);
        }
    }

    get(key, defaultValue = null) {
        return this.config.hasOwnProperty(key) 
            ? this.config[key] 
            : defaultValue;
    }

    set(key, value) {
        this.config[key] = value;
        this.saveConfig();
    }

    updateConfig(updates) {
        Object.assign(this.config, updates);
        this.saveConfig();
    }

    resetConfig() {
        this.config = { ...this.defaults };
        this.saveConfig();
        console.log('[ConfigManager] 配置已重置为默认值');
    }

    addSceneRule(sceneType, keywords) {
        if (!this.config.sceneRules) {
            this.config.sceneRules = {};
        }
        
        this.config.sceneRules[sceneType] = {
            keywords,
            model: this.getDefaultModelForScene(sceneType),
            createdAt: Date.now()
        };
        
        this.saveConfig();
    }

    updateSceneRule(sceneType, updates) {
        if (!this.config.sceneRules) {
            this.config.sceneRules = {};
        }
        
        if (!this.config.sceneRules[sceneType]) {
            this.config.sceneRules[sceneType] = {};
        }
        
        Object.assign(this.config.sceneRules[sceneType], updates);
        this.saveConfig();
    }

    removeSceneRule(sceneType) {
        if (this.config.sceneRules && this.config.sceneRules[sceneType]) {
            delete this.config.sceneRules[sceneType];
            this.saveConfig();
        }
    }

    getSceneRules() {
        return this.config.sceneRules || {};
    }

    setUserPreference(sceneType, model) {
        if (!this.config.userPreferences) {
            this.config.userPreferences = {};
        }
        
        this.config.userPreferences[sceneType] = {
            model,
            selectedAt: Date.now()
        };
        
        this.saveConfig();
    }

    getUserPreference(sceneType) {
        if (!this.config.userPreferences) {
            return null;
        }
        
        const pref = this.config.userPreferences[sceneType];
        return pref ? pref.model : null;
    }

    getDefaultModelForScene(sceneType) {
        const defaults = {
            '日常对话': 'gpt-3.5-turbo',
            '创意写作': 'gpt-4',
            '角色扮演': 'gpt-4',
            '故事叙述': 'gpt-4',
            '知识问答': 'gpt-4',
            '问题解答': 'gpt-3.5-turbo',
            '代码编写': 'gpt-4',
            '翻译任务': 'gpt-3.5-turbo',
            '情感咨询': 'gpt-4'
        };
        
        return defaults[sceneType] || 'gpt-3.5-turbo';
    }

    exportConfig() {
        return JSON.stringify(this.config, null, 2);
    }

    importConfig(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            this.config = { ...this.defaults, ...imported };
            this.saveConfig();
            return true;
        } catch (error) {
            console.error('[ConfigManager] 导入配置失败:', error);
            return false;
        }
    }
}

module.exports = ConfigManager;
