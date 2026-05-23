class ModelSwitcher {
    constructor(apiBridge, configManager) {
        this.apiBridge = apiBridge;
        this.configManager = configManager;
        this.sceneModelMap = new Map();
        this.initializeDefaultMappings();
    }

    initializeDefaultMappings() {
        this.sceneModelMap.set('日常对话', {
            model: 'gpt-3.5-turbo',
            priority: 1,
            reason: '日常对话响应快速且成本低'
        });
        
        this.sceneModelMap.set('创意写作', {
            model: 'gpt-4',
            priority: 3,
            reason: '需要更强的创造力和上下文理解'
        });
        
        this.sceneModelMap.set('角色扮演', {
            model: 'gpt-4',
            priority: 3,
            reason: '需要更好的角色一致性和情感表达'
        });
        
        this.sceneModelMap.set('故事叙述', {
            model: 'gpt-4',
            priority: 3,
            reason: '需要更长的上下文和叙事能力'
        });
        
        this.sceneModelMap.set('知识问答', {
            model: 'gpt-4',
            priority: 2,
            reason: '需要更准确的知识和推理能力'
        });
        
        this.sceneModelMap.set('问题解答', {
            model: 'gpt-3.5-turbo',
            priority: 1,
            reason: '简单问题无需高级模型'
        });
        
        this.sceneModelMap.set('代码编写', {
            model: 'gpt-4',
            priority: 3,
            reason: '需要更准确的代码理解和生成'
        });
        
        this.sceneModelMap.set('翻译任务', {
            model: 'gpt-3.5-turbo',
            priority: 1,
            reason: '翻译任务标准且明确'
        });
        
        this.sceneModelMap.set('情感咨询', {
            model: 'gpt-4',
            priority: 2,
            reason: '需要更好的情感理解和同理心'
        });
    }

    selectModel(sceneType) {
        const mapping = this.sceneModelMap.get(sceneType);
        
        if (!mapping) {
            console.warn(`[ModelSwitcher] 未找到场景 "${sceneType}" 的映射，使用默认模型`);
            return 'gpt-3.5-turbo';
        }
        
        const targetModel = mapping.model;
        
        const modelPool = this.configManager.get('modelPool', ['gpt-3.5-turbo', 'gpt-4']);
        
        if (modelPool.includes(targetModel)) {
            return targetModel;
        }
        
        console.warn(`[ModelSwitcher] 目标模型 "${targetModel}" 不在模型池中，尝试使用备用模型`);
        return modelPool[0];
    }

    async switchTo(model) {
        try {
            await this.apiBridge.setActiveModel(model);
            
            this.configManager.set('lastModel', model);
            this.configManager.set('lastSwitchTime', Date.now());
            
            console.log(`[ModelSwitcher] 已切换到模型: ${model}`);
            
            return true;
        } catch (error) {
            console.error('[ModelSwitcher] 切换模型失败:', error);
            return false;
        }
    }

    setSceneModelMapping(sceneType, model, priority = 1, reason = '') {
        this.sceneModelMap.set(sceneType, {
            model,
            priority,
            reason
        });
        
        this.configManager.updateSceneRule(sceneType, {
            model,
            priority,
            reason
        });
    }

    getMappings() {
        return Object.fromEntries(this.sceneModelMap);
    }

    loadMappings(mappings) {
        this.sceneModelMap.clear();
        
        Object.entries(mappings).forEach(([sceneType, config]) => {
            this.sceneModelMap.set(sceneType, config);
        });
    }

    getModelForPriority(priority) {
        const models = {
            1: 'gpt-3.5-turbo',
            2: 'gpt-4-turbo',
            3: 'gpt-4'
        };
        
        return models[priority] || models[1];
    }
}

module.exports = ModelSwitcher;
