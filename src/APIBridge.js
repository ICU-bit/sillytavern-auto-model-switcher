class APIBridge {
    constructor(configManager) {
        this.configManager = configManager;
        this.activeModel = null;
        this.apiEndpoints = {
            'gpt-3.5-turbo': 'https://api.openai.com/v1/chat/completions',
            'gpt-4': 'https://api.openai.com/v1/chat/completions',
            'gpt-4-turbo': 'https://api.openai.com/v1/chat/completions'
        };
    }

    async callModel(model, prompt, options = {}) {
        const apiKey = await this.getAPIKey();
        
        if (!apiKey) {
            throw new Error('未配置 API 密钥');
        }
        
        const endpoint = this.apiEndpoints[model] || this.apiEndpoints['gpt-3.5-turbo'];
        
        const messages = Array.isArray(prompt) 
            ? prompt 
            : [{ role: 'user', content: prompt }];
        
        const requestBody = {
            model: model,
            messages: messages,
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 1000,
            stream: false
        };
        
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                throw new Error(`API 请求失败: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.choices && data.choices[0]) {
                return data.choices[0].message.content;
            } else {
                throw new Error('API 响应格式错误');
            }
        } catch (error) {
            console.error('[APIBridge] 调用模型失败:', error);
            throw error;
        }
    }

    async getAPIKey() {
        return this.configManager.get('apiKey', null);
    }

    async setAPIKey(key) {
        this.configManager.set('apiKey', key);
    }

    async setActiveModel(model) {
        this.activeModel = model;
        this.configManager.set('activeModel', model);
        
        if (typeof window !== 'undefined' && window.SillyTavern) {
            window.SillyTavern.setModel(model);
        }
        
        return model;
    }

    getActiveModel() {
        return this.activeModel || this.configManager.get('activeModel', 'gpt-3.5-turbo');
    }

    addModelToPool(model) {
        const pool = this.configManager.get('modelPool', []);
        if (!pool.includes(model)) {
            pool.push(model);
            this.configManager.set('modelPool', pool);
        }
    }

    removeModelFromPool(model) {
        const pool = this.configManager.get('modelPool', []);
        const index = pool.indexOf(model);
        if (index > -1) {
            pool.splice(index, 1);
            this.configManager.set('modelPool', pool);
        }
    }

    getModelPool() {
        return this.configManager.get('modelPool', ['gpt-3.5-turbo', 'gpt-4']);
    }

    async testConnection(model) {
        try {
            const response = await this.callModel(
                model,
                [{ role: 'user', content: '测试' }],
                { maxTokens: 5 }
            );
            return {
                success: true,
                message: '连接成功',
                model: model
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
                model: model
            };
        }
    }

    setEndpoint(model, endpoint) {
        this.apiEndpoints[model] = endpoint;
    }

    getEndpoint(model) {
        return this.apiEndpoints[model];
    }
}

module.exports = APIBridge;
