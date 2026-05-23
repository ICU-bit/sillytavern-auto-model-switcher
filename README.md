# SillyTavern Auto Model Switcher

一个智能的 SillyTavern 插件，能够根据对话场景自动切换最适合的生成模型。

## 功能特性

- 🎯 **智能场景识别**：使用轻量化模型实时分析对话内容
- 🔄 **自动模型切换**：根据场景类型自动切换到最适合的生成模型
- ⚙️ **灵活配置**：支持自定义场景分类和模型映射规则
- 💾 **模型记忆**：记住用户在特定场景中的偏好设置
- 🌐 **API 兼容**：支持多种 LLM API 接口

## 支持的场景类型

- 💬 日常对话
- 📝 创意写作
- 💭 角色扮演
- 🎭 故事叙述
- 🤔 知识问答
- 💡 问题解答

## 安装方法

1. 克隆仓库到本地：
   ```bash
   git clone https://github.com/ICU-bit/sillytavern-auto-model-switcher.git
   ```

2. 将插件文件夹复制到 SillyTavern 的 `scripts/plugins` 目录

3. 重启 SillyTavern

## 使用方法

### 基础配置

1. 在 SillyTavern 设置中启用插件
2. 配置你的 LLM API 密钥
3. 添加需要切换的模型列表
4. 设置场景识别模型（建议使用轻量化模型如 GPT-3.5-turbo）

### 自定义场景

插件支持自定义场景分类规则，可以根据关键词、语气、话题等维度进行识别。

## 技术实现

### 核心模块

- **SceneAnalyzer**：场景分析器，负责解析对话内容并判断场景类型
- **ModelSwitcher**：模型切换器，根据场景类型选择合适的模型
- **ConfigManager**：配置管理器，处理用户配置和偏好设置
- **APIBridge**：API 桥接器，统一不同 LLM API 的调用接口

### 场景识别流程

1. 收集最近的对话历史
2. 发送给轻量化场景分析模型
3. 解析模型返回的场景类型
4. 根据预设规则选择目标模型
5. 自动切换到目标模型
6. 更新对话上下文

## 配置示例

```json
{
  "scenes": {
    "日常对话": {
      "keywords": ["你好", "最近", "怎么样"],
      "targetModel": "gpt-3.5-turbo"
    },
    "创意写作": {
      "keywords": ["写", "创作", "故事"],
      "targetModel": "gpt-4"
    }
  },
  "modelPool": [
    "gpt-3.5-turbo",
    "gpt-4",
    "claude-3-opus"
  ]
}
```

## 开发指南

### 项目结构

```
sillytavern-auto-model-switcher/
├── src/
│   ├── SceneAnalyzer.js      # 场景分析模块
│   ├── ModelSwitcher.js      # 模型切换模块
│   ├── ConfigManager.js      # 配置管理模块
│   └── APIBridge.js          # API 桥接模块
├── plugin.json               # 插件配置文件
├── package.json              # NPM 配置文件
└── README.md                 # 项目说明文档
```

### 开发环境

- Node.js >= 16.0.0
- SillyTavern >= 1.0.0

### 运行测试

```bash
npm install
npm test
```

## 注意事项

- 确保 API 额度充足
- 建议使用支持流式输出的模型以获得更好的体验
- 首次使用建议在测试模式下验证场景识别准确性

## 许可证

MIT License

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 联系方式

- GitHub Issues: https://github.com/ICU-bit/sillytavern-auto-model-switcher/issues
