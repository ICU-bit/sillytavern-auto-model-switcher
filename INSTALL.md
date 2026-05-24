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
     [NSFW模型切换器] 插件加载完成！
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

安装启用后，在 SillyTavern 右侧扩展设置面板中找到 **NSFW模型切换器** 进行配置。

### 必要配置

| 字段 | 说明 |
|---|---|
| **轻量化检测模型 → API地址** | NSFW 检测 API 地址（如 https://api.siliconflow.cn/v1） |
| **轻量化检测模型 → 模型名称** | 检测模型名（如 Qwen2.5-7B-Instruct） |
| **切换目标模型 → 目标模型名称** | 检测到 NSFW 后切换到的模型名称 |
| **切换目标模型 → API来源** | 切换目标的 API 来源（如 DeepSeek、Custom） |

### 可选配置

| 字段 | 说明 |
|---|---|
| **API密钥** | 检测 API / 目标 API 的密钥 |
| **目标模型API地址** | 切换目标模型的 API 地址 |
| **显示通知** | 切换/恢复时显示 toastr 弹窗 |
| **调试模式** | 显示详细运行日志 |

## 测试

1. 发送一条消息给AI
2. 在插件设置面板中打开 **调试模式**
3. 查看插件面板内的运行日志，应能看到类似输出：
   ```
   检测 AI 回复中... (长度: xxx 字)
   检测结果: NSFW → 下次生成将切换模型
   ```

## 常见问题

### Q: 插件加载失败怎么办？
A: 确保正确填写了仓库URL，尝试手动安装方式。

### Q: 如何确认插件已加载？
A: 查看浏览器控制台或扩展设置面板，应能看到 `[NSFW模型切换器] 插件加载完成！`。

### Q: 配置文件在哪里？
A: 所有配置通过 SillyTavern 扩展设置面板操作，自动保存到服务器端的 settings.json 中，无需手动编辑。