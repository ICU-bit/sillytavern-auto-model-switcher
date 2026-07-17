# NSFW模型切换器 - 安装与测试指南

> GitHub 默认分支 `master` 是稳定版。v1.2.0 当前位于 `refactor` 分支，正在等待 PC 与移动端实机测试。

## 稳定版安装

在 SillyTavern 中打开 **扩展 → 下载扩展和资源**，在 **自定义插件URL** 中输入：

```text
https://github.com/ICU-bit/sillytavern-auto-model-switcher
```

该地址默认安装 `master`。

## refactor 测试版安装

测试人员建议手动克隆指定分支：

```bash
cd SillyTavern/public/scripts/extensions/third-party/
git clone -b refactor https://github.com/ICU-bit/sillytavern-auto-model-switcher.git
```

也可以下载：

```text
https://github.com/ICU-bit/sillytavern-auto-model-switcher/archive/refs/heads/refactor.zip
```

解压后将目录重命名为 `sillytavern-auto-model-switcher`，放入：

```text
SillyTavern/public/scripts/extensions/third-party/
```

重启 SillyTavern，并使用 `Ctrl+F5` 或 `Ctrl+Shift+R` 硬刷新浏览器。

> `dist/` 已包含编译产物，普通用户无需安装 Node.js 或运行构建。

## 配置插件

在 SillyTavern 扩展设置面板中找到 **NSFW模型切换器**。

### 必要配置

| 字段 | 说明 |
|---|---|
| **轻量化检测模型 → API地址** | NSFW 检测 API 地址，如 `https://api.siliconflow.cn/v1` |
| **轻量化检测模型 → 模型名称** | 检测模型名称 |
| **切换目标模型 → 目标模型名称** | 检测到 NSFW 后使用的模型名称 |
| **切换目标模型 → 目标模型API地址** | 浏览器直调的 OpenAI 兼容 API 地址 |

### 可选与高级配置

| 字段 | 说明 |
|---|---|
| **检测 API 密钥** | 检测服务的 API Key |
| **目标模型API密钥** | 目标服务的 API Key |
| **NSFW 预设导入** | 导入酒馆预设，支持模块/字段开关与内联编辑 |
| **直调 API 超时** | 默认 60 秒；thinking 模型首字延迟较大时可提高 |
| **失败重试次数** | 默认 1 次，仅超时或网络错误重试；HTTP 错误不重试 |
| **Proxy 安全超时** | 默认 30 秒，用于异常情况下自动恢复覆盖状态 |
| **显示通知** | 切换、恢复和失败回退时显示 toastr |
| **调试模式** | 在插件面板显示运行日志 |

## 验证安装

1. 打开浏览器控制台（F12），确认出现插件加载日志。
2. 确认扩展设置面板显示 **NSFW模型切换器**。
3. 开启调试模式，发送消息并观察检测日志。
4. 验证 NSFW 内容会使下一次生成直调目标模型。
5. 验证恢复正常内容后，后续生成回到原始模型。
6. 在移动设备上验证模态框、手风琴、滚动与触摸操作。

完整测试清单见 [TODO.md](TODO.md)。

## 常见问题

### 目标 API 报 CORS 错误

Plan B 由浏览器直接请求目标 API，目标服务必须允许浏览器跨域访问。请改用支持 CORS 的服务或自行配置代理。

### thinking 模型容易超时

在高级设置中提高 **直调 API 超时**。默认值为 60 秒；重试次数默认 1 次。

### 如何确认安装的是哪个分支

在插件目录执行：

```bash
git branch --show-current
git log -1 --oneline
```

测试 v1.2.0 时应显示 `refactor`。
