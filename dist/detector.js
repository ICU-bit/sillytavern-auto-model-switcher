// SPDX-License-Identifier: AGPL-3.0-only
/**
 * NSFW 模型切换器 - 检测模块
 * 负责调用外部 API 检测文本内容是否为 NSFW
 */
import { addLog, addDebugLog } from './logger.js';
import { loadSettings } from './settings.js';
import { getContext } from '../../../../extensions.js';
export function normalizeApiUrl(url) {
    if (!url)
        return url;
    url = url.replace(/\/+$/, '');
    if (!url.endsWith('/chat/completions')) {
        url += '/chat/completions';
    }
    return url;
}
/**
 * 检测文本是否为 NSFW
 * @param content - 要检测的文本内容
 * @param externalSignal - 外部取消信号（用于 swipe 时取消前一次检测）
 * @returns true=NSFW, false=正常, null=检测失败
 */
export async function detectNSFW(content, externalSignal) {
    const settings = loadSettings();
    const { nsfwApiUrl, nsfwApiKey, nsfwModelName, debugMode } = settings;
    if (!nsfwApiUrl) {
        addLog('未配置 NSFW 检测 API 地址，跳过检测', 'warning');
        return null;
    }
    const apiUrl = normalizeApiUrl(nsfwApiUrl);
    const startTime = Date.now();
    try {
        const prompt = '判断以下内容是否为 NSFW（成人/色情内容）。请只回复数字 1（是）或 0（否），不要输出任何其他内容：\n\n' + content;
        const requestBody = {
            model: nsfwModelName || 'nsfw-detector',
            messages: [{
                    role: 'user',
                    content: prompt,
                }],
            temperature: 0.0,
            max_tokens: 500,
        };
        const headers = {
            'Content-Type': 'application/json',
            ...(nsfwApiKey ? { 'Authorization': 'Bearer ' + nsfwApiKey } : {}),
        };
        // 记录请求日志（隐藏敏感信息）
        const safeHeaders = { ...headers };
        if (safeHeaders['Authorization']) {
            safeHeaders['Authorization'] = 'Bearer ***';
        }
        addLog(`API请求: POST ${apiUrl}`, 'info', 'debug');
        // M2 修复: externalSignal 可能在到达此处时**已经** aborted (例如上一次
        // 检测 abort 后立即触发新检测, 但新 signal 已被 swipe 取消)。
        // addEventListener('abort') 在已 aborted 的 signal 上**不会**触发回调,
        // 导致 timer 泄漏 + fetch 仍然发出 + 无人 abort fetch。
        // 在创建 controller / timer 之前先检查 aborted 状态主动短路, 静默返回 null。
        if (externalSignal?.aborted) {
            addDebugLog('检测在启动前已被取消, 跳过');
            return null;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        // 如果外部要求取消（用户 swipe），同步取消本次检测
        if (externalSignal) {
            externalSignal.addEventListener('abort', () => {
                clearTimeout(timeoutId);
                controller.abort();
            }, { once: true });
        }
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        if (!response.ok) {
            // 尝试读取响应体以获取错误详情
            let errorBody = null;
            try {
                const clonedResponse = response.clone();
                errorBody = await clonedResponse.text();
                try {
                    errorBody = JSON.parse(errorBody);
                }
                catch (e) { /* 保持文本格式 */ }
            }
            catch (e) { /* 忽略读取错误 */ }
            addLog(`API错误: HTTP ${response.status} (${duration}ms)`, 'error', 'error');
            addLog(`API响应: ${response.status} ${apiUrl} (${duration}ms)`, 'error', 'debug');
            throw new Error('API 请求失败: ' + response.status);
        }
        const data = await response.json();
        const result = data.choices?.[0]?.message?.content?.trim();
        // 记录响应日志
        addLog(`API响应: 200 ${apiUrl} (${duration}ms)`, 'info', 'debug');
        addDebugLog('检测结果: ' + result);
        if (result === '1' || result === 'true' || result === '是' || result === 'yes')
            return true;
        if (result === '0' || result === 'false' || result === '否' || result === 'no')
            return false;
        // 不确定的结果，记录警告并返回 null
        addLog('无法解析检测结果: ' + result, 'warning');
        return null;
    }
    catch (error) {
        const duration = Date.now() - startTime;
        const err = error instanceof Error ? error : new Error(String(error));
        // 分类错误类型
        let errorMessage = err.message;
        if (err.name === 'AbortError') {
            errorMessage = '检测请求超时或取消';
        }
        else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            errorMessage = '网络连接失败';
        }
        addLog(`API错误: ${apiUrl} - ${errorMessage}`, 'error');
        return null;
    }
}
/**
 * 从聊天记录中获取最后一条 AI 消息的文本
 */
export function getLastAiMessageText() {
    try {
        const context = getContext();
        const chat = context?.chat || [];
        for (let i = chat.length - 1; i >= 0; i--) {
            const message = chat[i];
            if (message && !message.is_user && message.mes) {
                return extractContent(message.mes);
            }
        }
        return null;
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        addLog('获取聊天记录失败: ' + msg, 'error');
        return null;
    }
}
export function getMessageTextById(messageId) {
    try {
        const context = getContext();
        const chat = context?.chat || [];
        const message = chat[messageId];
        if (message && !message.is_user && message.mes) {
            return extractContent(message.mes);
        }
        return null;
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        addLog('获取消息失败: ' + msg, 'error');
        return null;
    }
}
function extractContent(text) {
    if (!text)
        return text;
    const match = text.match(/<content>([\s\S]*?)<\/content>/);
    if (match) {
        return match[1].trim();
    }
    return text;
}
/**
 * 测试 NSFW 检测 API
 * @returns true=API正常, false=返回了意外的结果, null=调用失败
 */
export async function testNsfwApi() {
    const testContent = '这是一个测试内容。请判断这个内容是否包含 NSFW 元素。';
    const result = await detectNSFW(testContent);
    if (result === null) {
        if (typeof toastr !== 'undefined') {
            toastr.error('API 测试失败，请检查配置');
        }
        addLog('API 测试失败，请检查配置', 'error');
    }
    else if (result === false) {
        if (typeof toastr !== 'undefined') {
            toastr.success('API 测试成功！返回结果：正常内容');
        }
        addLog('API 测试成功！返回结果：正常内容', 'success');
    }
    else {
        if (typeof toastr !== 'undefined') {
            toastr.warning('API 测试成功！但模型判断为 NSFW 内容');
        }
        addLog('API 测试成功！但模型判断为 NSFW 内容', 'warning');
    }
    return result;
}
//# sourceMappingURL=detector.js.map