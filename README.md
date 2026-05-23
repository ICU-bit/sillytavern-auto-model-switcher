# NSFW模型切换器

SillyTavern插件：根据上一条AI回复自动检测NSFW内容并临时切换模型。

## 功能特性

- 🎯 **自动检测**：在AI回复后自动检测NSFW内容
- 🔄 **临时切换**：仅在需要时临时切换模型，插件不接管时保持原配置
- ⚙️ **配置灵活**：支持配置NSFW检测API和目标模型

## 安装方法

### 方式一：通过插件管理页面安装（推荐）

1. 打开 SillyTavern
2. 点击左侧 **"扩展"** 图标
3. 切换到 **"下载扩展和资源"** 标签页
4. 在 **"自定义插件URL"** 输入框中填入：
   ```
   https://github.com/ICU-bit/sillytavern-auto-model-switcher
   ```
5. 点击 **"安装"** 按钮
6. 在 **"已安装的扩展"** 列表中找到 **"NSFW模型切换器"**，点击启用

### 方式二：手动安装

1. 下载插件：
   ```bash
   git clone https://github.com/ICU-bit/sillytavern-auto-model-switcher.git
   ```
2. 将插件文件夹复制到：
   ```
   SillyTavern/public/scripts/extensions/third-party/
   ```
3. 重启 SillyTavern
4. 在插件管理中启用此插件

## 配置说明

安装并启用插件后，需要在浏览器控制台（F12）中配置API：

```javascript
localStorage.setItem('extension_settings', JSON.stringify({
    'nsfw-model-switcher': {
        enabled: true,
        nsfwApiUrl: '你的NSFW检测API地址',
        nsfwApiKey: '你的API密钥（可选）',
        nsfwModelName: 'nsfw-detector',
        modelA: '要切换的目标模型名称'
    }
}));
```

配置完成后刷新页面使配置生效。

## 工作流程

1. AI回复渲染完成后，插件捕获消息内容
2. 调用NSFW检测模型分析内容
3. 如果检测为NSFW（返回1），临时切换到模型A
4. 如果检测为正常（返回0），且当前是临时切换状态，则恢复原模型
5. 下次用户输入时，根据上一个AI回复决定使用哪个模型

## 注意事项

- 当前版本为Demo，需要配置NSFW检测API才能实际工作
- 模型切换是临时的，插件不接管时保持原配置
- 支持 OpenAI、Claude、OpenRouter 等主流API

## 版本历史

### 0.0.1
- 初始版本
- 实现基本的AI回复检测
- 实现临时模型切换
- 支持OpenAI、Claude、OpenRouter模型切换
