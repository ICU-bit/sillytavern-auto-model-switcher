# NSFW模型切换器 - 本地安装指南

## 通过插件管理页面安装（推荐）

### 安装步骤

1. **打开酒馆**
   - 启动 SillyTavern
   - 点击左侧 **"扩展"** 图标

2. **下载插件**
   - 切换到 **"下载扩展和资源"** 标签页
   - 在 **"自定义插件URL"** 输入框中填入：
     ```
     https://github.com/ICU-bit/sillytavern-auto-model-switcher
     ```
   - 点击 **"安装"** 按钮

3. **启用插件**
   - 切换到 **"已安装的扩展"** 标签页
   - 找到 **"NSFW模型切换器"**
   - 点击开关启用

4. **验证安装**
   - 打开浏览器控制台（F12）
   - 应该能看到：
     ```
     [NSFW模型切换器] 插件加载完成
     ```

## 手动安装（备选方案）

如果上述方法失败，可以使用手动安装：

1. 下载ZIP包：
   [https://github.com/ICU-bit/sillytavern-auto-model-switcher/archive/refs/heads/master.zip](https://github.com/ICU-bit/sillytavern-auto-model-switcher/archive/refs/heads/master.zip)

2. 解压ZIP包，将文件夹重命名为 `sillytavern-auto-model-switcher`

3. 复制到酒馆插件目录：
   ```
   SillyTavern/public/scripts/extensions/third-party/
   ```

4. 重启酒馆

## 配置插件

安装启用后，在浏览器控制台（F12）配置API：

```javascript
localStorage.setItem('extension_settings', JSON.stringify({
    'nsfw-model-switcher': {
        enabled: true,
        nsfwApiUrl: '你的NSFW检测API地址',
        nsfwApiKey: '你的API密钥',
        modelA: '要切换的目标模型名称'
    }
}));
```

配置后刷新页面使配置生效。

## 测试

1. 发送一条消息给AI
2. 查看浏览器控制台（F12）
3. 应该能看到类似日志：
   ```
   [NSFW模型切换器] 捕获AI回复: xxx
   [NSFW模型切换器] 检测结果: 0/1
   ```

## 常见问题

### Q: 插件加载失败怎么办？
A: 确保正确填写了仓库URL，尝试手动安装方式。

### Q: 如何确认插件已加载？
A: 查看浏览器控制台，应该能看到 `[NSFW模型切换器] 插件加载完成`。

### Q: 如何查看当前配置？
A: 在控制台运行：
```javascript
console.log(JSON.parse(localStorage.getItem('extension_settings'))['nsfw-model-switcher']);
```
