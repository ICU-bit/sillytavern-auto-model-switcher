# 贡献指南

> 本文档面向**开发者**。如果只是想安装使用插件，看 [README.md](./README.md) 或 [INSTALL.md](./INSTALL.md)。

---

## 前置条件

- **Node.js** ≥ 18.x（用于本地 TS 编译）
- **npm** ≥ 9.x（随 Node 自带）
- **Git**
- **浏览器** + **SillyTavern** 实例（用于运行时调试）

## 快速上手

```bash
# 1. clone 仓库到任意目录
git clone -b refactor https://github.com/ICU-bit/sillytavern-auto-model-switcher.git
cd sillytavern-auto-model-switcher

# 2. 安装开发依赖
npm install

# 3. 启动 watch 模式（保存 .ts 自动重编译到 dist/）
npm run dev
```

## 让 SillyTavern 加载你的开发版本

### 方案 A：复制（最简单，但需手动同步）

把整个仓库目录复制到：
```
<SillyTavern>/public/scripts/extensions/third-party/sillytavern-auto-model-switcher/
```

每次改代码后，重新复制 `dist/` 到 ST 目录。

### 方案 B：junction / symlink（推荐）

让 ST 目录指向你的开发仓库，源码改动**实时生效**。

**Windows（管理员 PowerShell）：**
```powershell
cmd /c mklink /J `
    "<SillyTavern>\public\scripts\extensions\third-party\sillytavern-auto-model-switcher" `
    "<你的仓库绝对路径>"
```

**Linux/macOS：**
```bash
ln -s "<你的仓库绝对路径>" \
    "<SillyTavern>/public/scripts/extensions/third-party/sillytavern-auto-model-switcher"
```

### 方案 C：git worktree（多分支并行调试）

如果你同时调试 master/dev/refactor，建议：
```bash
# 主目录用一个分支
git clone https://github.com/ICU-bit/sillytavern-auto-model-switcher.git
cd sillytavern-auto-model-switcher

# 为 refactor 分支创建 worktree
git worktree add ../sillytavern-auto-model-switcher-refactor refactor

# 然后 junction 指向需要调试的 worktree
```

## 开发循环

```
1. 编辑 src/*.ts
        ↓
2. tsc watch 自动编译到 dist/（终端会显示错误）
        ↓
3. 浏览器 Ctrl+F5 硬刷新 SillyTavern（清除 ES Module 缓存）
        ↓
4. 查看效果 + 控制台日志
        ↓
5. 控制台搜索 NSFW_MODULE_LOADED 确认加载
        ↓
6. 调用 __nsfwDebug() 查看运行时状态
```

## 提交规范

### Commit Message

```
<type>(<scope>): <subject>

<body 详细说明>

<footer 备注 / 关联 issue>
```

`<type>` 可选值：
- `feat` 新功能
- `fix` bug 修复
- `refactor` 重构（不改变行为）
- `docs` 文档
- `chore` 工程类（依赖、配置）
- `test` 测试

`<scope>` 可选值：模块名（`logger` / `state` / `direct-api` 等）、`ts`、`ui`、`build`。

例：
```
fix(preset-proxy): 30s 安全超时未通知 fetch 拦截器和状态机

修复 BUG-7：startSafetyTimer 触发后只关闭 Proxy，
但 interceptEnabled 仍为 true、状态机仍 SWITCHED。
现在用集中协调器同步关闭三者。

refs ARCHITECTURE.md §10
```

### 提交内容

**必须同时提交**：
- `src/*.ts` 源码
- `dist/*.js` 编译产物（运行 `npm run build` 后产生）
- `dist/*.js.map` source map

**不要提交**：
- `node_modules/`（已在 .gitignore）
- `*.tsbuildinfo`（已在 .gitignore）
- 测试/临时文件

### 提交前检查

```bash
# 类型检查必须通过
npm run check

# 编译必须无错误
npm run build

# 浏览器实测插件功能（最低限度）
# - 设置面板正常显示
# - 控制台无报错
# - 至少触发一次 detection + switch + restore 循环
```

## 分支规则

详见父目录 [AGENTS.md](../AGENTS.md) 的「Git 工作流程」章节。

**TL;DR**：
- ❌ 不在 `master` 直接提交
- ✅ 在 `refactor`（或派生分支）开发 → 推送 → 等用户确认 → 合并

## 调试技巧

### 控制台命令

```javascript
// 检查插件加载状态
__nsfwDebug()

// 查看当前设置
extension_settings['nsfw-model-switcher']

// 查看 ST 当前 API 来源
oai_settings.chat_completion_source

// 查看预设 Proxy 状态
power_user.instruct.__nsfw_proxy_installed__  // 应为 true
```

### Source Map

`dist/*.js.map` 让浏览器调试器**直接断点在 `.ts` 源码**。

- F12 → Sources → Page → 找到 `dist/index.js`
- 设置断点时浏览器会自动跳转到对应的 `src/index.ts`

### 常见问题

**Q：改了 .ts 但浏览器没生效？**
- 确认 `npm run dev` 终端没有报错
- 确认 `dist/` 文件时间戳更新了
- 浏览器 `Ctrl+Shift+R`（强制硬刷新，绕过所有缓存）
- 检查 ST 目录的 junction 是否指向当前 worktree

**Q：类型检查失败但运行正常？**
- 不要 `// @ts-ignore`。stop。debug。
- 真的需要时用 `as unknown as Foo`（双重断言）让自己警觉

**Q：插件加载报错？**
- 控制台搜索 `NSFW_MODULE_LOADED`，没有 → 模块加载失败 → 检查 import 路径
- 有但后续报错 → 检查 `dist/` 是否完整（9 个 .js + 9 个 .map）
- 检查 manifest.json `js` 字段是否为 `dist/index.js`

## 重构进行中

当前 refactor 分支正在进行结构性重构。已识别的 15 个 bug 和 5 个重构方向见 [ARCHITECTURE.md §11.6-11.7](./ARCHITECTURE.md)。

提交修复前请确认：
- 没有触碰其他正在重构中的模块（防止 merge conflict）
- 测试覆盖了你修复的场景
- 没有引入新的 TS 类型 escape（如 `any`、`!` 非空断言）
