# NSFW模型切换器

SillyTavern插件：根据上一条AI回复自动检测NSFW内容并临时切换模型。

## 功能特性

- 🎯 **自动检测**：在AI回复后自动检测NSFW内容
- 🔄 **临时切换**：仅在需要时临时切换模型，插件不接管时保持原配置
- ⚙️ **配置灵活**：支持配置NSFW检测API和目标模型

## 安装方法

1. 克隆仓库到本地
2. 将插件文件夹复制到 SillyTavern 的 `scripts/extensions/third-party` 目录
3. 重启 SillyTavern
4. 在插件管理中启用此插件

## 配置说明

在浏览器控制台中可以通过以下方式配置：

```javascript
// 设置NSFW检测API地址
localStorage.setItem('extension_settings', JSON.stringify({
    'nsfw-model-switcher': {
        enabled: true,
        nsfwApiUrl: 'https://your-api-endpoint.com/v1/chat/completions',
        nsfwApiKey: 'your-api-key',
        nsfwModelName: 'nsfw-detector',
        modelA: 'gpt-4'
    }
}));
```

## 工作流程

1. AI回复渲染完成后，插件捕获消息内容
2. 调用NSFW检测模型分析内容
3. 如果检测为NSFW（返回1），临时切换到模型A
4. 如果检测为正常（返回0），且当前是临时切换状态，则恢复原模型
5. 下次用户输入时，根据上一个AI回复决定使用哪个模型

## 版本历史

### 0.0.1
- 初始版本
- 实现基本的AI回复检测
- 实现临时模型切换
- 支持OpenAI、Claude、OpenRouter模型切换
