# NSFW模型切换器 - 本地安装指南

## 安装步骤

1. **克隆或下载插件**
   ```
   git clone https://github.com/ICU-bit/sillytavern-auto-model-switcher.git
   ```
   或者下载ZIP包并解压

2. **复制到酒馆插件目录**
   将 `sillytavern-auto-model-switcher` 文件夹复制到：
   ```
   SillyTavern安装目录/scripts/extensions/third-party/
   ```

3. **重启SillyTavern**

4. **在插件管理中启用**
   - 打开酒馆
   - 点击"扩展"标签
   - 找到"NSFW模型切换器"
   - 点击启用

5. **配置插件**
   在浏览器控制台（F12）中运行：
   ```javascript
   localStorage.setItem('extension_settings', JSON.stringify({
       'nsfw-model-switcher': {
           enabled: true,
           nsfwApiUrl: '你的NSFW检测API地址',
           nsfwApiKey: '你的API密钥',
           nsfwModelName: 'nsfw-detector',
           modelA: '要切换的目标模型名称'
       }
   }));
   ```

## 测试

1. 发送一条消息给AI
2. 查看浏览器控制台（F12）
3. 应该能看到类似日志：
   ```
   [NSFW模型切换器] 捕获AI回复: xxx
   [NSFW模型切换器] 检测结果: 0/1
   ```

## 注意事项

- 当前版本为Demo，仅包含基本框架
- 需要配置NSFW检测API才能实际工作
- 模型切换是临时的，插件不接管时保持原配置
