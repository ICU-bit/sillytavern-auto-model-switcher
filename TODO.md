# 待开发功能

## B 方案：插件独立调用 API（不依赖 oai_settings）

### 目标
插件完全不碰酒馆的 `oai_settings`，完全靠自己发送 HTTP 请求调用目标模型 API，将返回结果插入聊天记录。

### 优点
- 完全不影响酒馆本身的配置
- 不需要快照/恢复机制
- 支持任意 API 来源，不受 `chat_completion_source` 约束
- NSFW 模型可以用完全不同的 API 协议

### 需要实现
1. **独立 API 调用模块**
   - 在 `src/` 下新增 `api-client.js`
   - 支持 OpenAI 兼容协议（流式/非流式）
   - 支持自定义请求头、温度等参数

2. **消息历史拼接**
   - 自己从 `getContext().chat` 读取聊天历史
   - 按 OpenAI 格式组装 messages 数组
   - 支持 system prompt、instruct 模板等

3. **回复注入**
   - 调用 API 后直接将回复写入聊天记录
   - 触发 UI 刷新显示新消息
   - 处理流式输出的渐进式渲染

4. **配置面板增强**
   - 新增"独立调用模式"开关
   - 新增更多 API 参数配置（temperature、max_tokens 等）

### 状态
⏳ 未开始