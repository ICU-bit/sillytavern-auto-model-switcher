class SceneAnalyzer {
    constructor(apiBridge, configManager) {
        this.apiBridge = apiBridge;
        this.configManager = configManager;
        this.sceneTypes = [
            '日常对话',
            '创意写作',
            '角色扮演',
            '故事叙述',
            '知识问答',
            '问题解答',
            '代码编写',
            '翻译任务',
            '情感咨询'
        ];
    }

    async analyze(conversationHistory) {
        const analysisModel = this.configManager.get('analysisModel', 'gpt-3.5-turbo');
        
        const prompt = this.buildAnalysisPrompt(conversationHistory);
        
        try {
            const response = await this.apiBridge.callModel(
                analysisModel,
                prompt
            );
            
            return this.parseSceneType(response);
        } catch (error) {
            console.error('[SceneAnalyzer] 分析失败:', error);
            return '日常对话';
        }
    }

    buildAnalysisPrompt(conversationHistory) {
        const recentMessages = conversationHistory
            .slice(-6)
            .map(msg => `${msg.role}: ${msg.content}`)
            .join('\n');
        
        const sceneList = this.sceneTypes.join(', ');
        
        return `请分析以下对话内容，判断当前最可能的场景类型。
        
场景类型包括: ${sceneList}

最近对话:
${recentMessages}

请只输出一个场景类型的名称，不要添加其他内容。`;
    }

    parseSceneType(response) {
        const content = response.trim();
        
        for (const sceneType of this.sceneTypes) {
            if (content.includes(sceneType)) {
                return sceneType;
            }
        }
        
        if (content.includes('日常') || content.includes('聊天')) {
            return '日常对话';
        } else if (content.includes('写作') || content.includes('创作')) {
            return '创意写作';
        } else if (content.includes('角色') || content.includes('扮演')) {
            return '角色扮演';
        } else if (content.includes('故事')) {
            return '故事叙述';
        } else if (content.includes('问答') || content.includes('回答')) {
            return '知识问答';
        } else if (content.includes('代码') || content.includes('编程')) {
            return '代码编写';
        } else if (content.includes('翻译')) {
            return '翻译任务';
        } else if (content.includes('情感')) {
            return '情感咨询';
        }
        
        return '日常对话';
    }

    getSceneTypes() {
        return this.sceneTypes;
    }

    addCustomScene(sceneType, keywords) {
        if (!this.sceneTypes.includes(sceneType)) {
            this.sceneTypes.push(sceneType);
            this.configManager.addSceneRule(sceneType, keywords);
        }
    }
}

module.exports = SceneAnalyzer;
