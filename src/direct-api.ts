/**
 * NSFW 模型切换器 (SillyTavern Auto Model Switcher)
 * Copyright (C) 2025 ICU-bit
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * NSFW 模型切换器 - 直接 API 调用模块 (Plan B)
 *
 * Plan A 的缺陷：修改 oai_settings 依赖 ST 在正确的时机读取，但 ST
 * 内部的事件时序不可靠，且 oai_settings 的修改可能不会正确同步到服务端。
 *
 * Plan B 方案：在 fetch 层面拦截 ST 发往自己服务端的 API 请求，
 * 直接调用目标模型的 API，将响应返回给 ST 处理。
 * 完全绕过 ST 的设置系统，不再修改 oai_settings。
 */

import { loadSettings } from './settings.js';
import { addLog, addApiRequestLog, addApiResponseLog, addApiErrorLog } from './logger.js';

// ===== 类型定义 =====

/** 重定向回调（请求被接管时通知调用方） */
type OnRequestRedirected = () => void;

/** 预设覆盖参数（来自 NSFW 预设的生成参数） */
type PresetOverrides = Record<string, unknown> | null;

/** 解析后的请求体（最低保证含 messages 字段才会被重定向） */
interface ChatRequestBody {
    messages?: unknown[];
    model?: string;
    stream?: boolean;
    [key: string]: unknown;
}

// ===== 模块状态 =====

// ST 的聊天补全 API 端点路径特征
// 修复: 原 '/api/openai/' 为前缀子串匹配, 会误伤
// /api/openai/caption-image, /api/openai/generate-voice, /api/openai/generate-image 等
// 非聊天补全端点。这些请求体没有 messages 字段, 走到 fallback 报警告日志。
//
// ST 前端实际只用 /api/backends/chat-completions/generate 一个端点。
// 保留 /api/chat/completions 以兼容用户自定义代理或其他扩展。
// 移除 /api/openai/ 前缀通配 (它从来就是误伤源, 不是真正的聊天端点)。
const ST_API_PATTERNS: string[] = [
    '/api/backends/chat-completions/generate',
    '/api/chat/completions',
];

let originalFetch: typeof window.fetch | null = null;
let interceptEnabled = false;
let onRequestRedirected: OnRequestRedirected | null = null;
let presetOverrides: PresetOverrides = null;

/**
 * 初始化 fetch 拦截器（在插件加载时调用一次）
 * 用包装函数替换 window.fetch，实现请求拦截
 */
export function initFetchInterceptor(): void {
    if (originalFetch) return;

    originalFetch = window.fetch.bind(window);
    addLog('fetch 拦截器已初始化', 'info', 'debug');

    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const url = normalizeInputUrl(input);

        if (interceptEnabled && isStApiEndpoint(url)) {
            // 安全兜底：如果插件已被用户关闭，自动禁用拦截
            const currentSettings = loadSettings();
            if (!currentSettings.enabled) {
                interceptEnabled = false;
                return originalFetch!(input, init);
            }

            const options = init || {};
            try {
                const body = parseBody(options.body);
                if (body && body.messages) {
                    const result = await redirectToTarget(body, options);
                    if (result) return result;
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                addLog('拦截重定向失败: ' + msg, 'error');
            }
            // 重定向失败 → 回退到原始请求（ST 用原模型生成）
            addLog('重定向失败，回退到原始请求', 'warning');
            // 通知用户：NFSW内容将由原模型处理
            if (typeof toastr !== 'undefined') {
                toastr.warning('[NSFW 模型切换器] 直调API失败，已回退到原始模型', undefined, { timeOut: 5000 });
            }
            // 如果原请求的 signal 已被触发（用户点停止），剥离 signal 避免 fallback 立即失败
            if (init && init.signal && typeof init.signal === 'object' && init.signal.aborted) {
                const { signal: _, ...rest } = init;
                return originalFetch!(input, rest);
            }
        }

        return originalFetch!(input, init);
    };
}

/**
 * 启用/禁用拦截
 */
export function setInterceptEnabled(enabled: boolean): void {
    interceptEnabled = enabled;
    addLog('fetch 拦截' + (enabled ? '已启用' : '已禁用'), 'info');
}

export function isInterceptEnabled(): boolean {
    return interceptEnabled;
}

export function setOnRequestRedirected(callback: OnRequestRedirected | null): void {
    onRequestRedirected = callback;
}

export function setPresetOverrides(params: PresetOverrides): void {
    presetOverrides = params;
}

function applyPresetToBody(directBody: Record<string, unknown>): void {
    if (!presetOverrides) return;
    for (const [key, value] of Object.entries(presetOverrides)) {
        if (value !== undefined) {
            directBody[key] = value;
        }
    }
}

/**
 * 判断 URL 是否匹配 ST 的 API 端点
 */
function isStApiEndpoint(url: string): boolean {
    return ST_API_PATTERNS.some(function (p) {
        return url.indexOf(p) !== -1;
    });
}

/**
 * 从 fetch 参数中提取 URL 字符串
 */
function normalizeInputUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string') return input;
    if (input instanceof Request) return input.url;
    if (input instanceof URL) return input.toString();
    if (input && typeof input === 'object' && 'url' in input) {
        return String((input as { url: unknown }).url);
    }
    return '';
}

/**
 * 安全解析请求体
 */
function parseBody(body: BodyInit | null | undefined): ChatRequestBody | null {
    if (!body) return null;
    if (typeof body === 'string') {
        try { return JSON.parse(body) as ChatRequestBody; } catch (e) { return null; }
    }
    return body as unknown as ChatRequestBody;
}

/**
 * 核心：将请求重定向到目标模型的 API
 */
async function redirectToTarget(
    originalBody: ChatRequestBody,
    originalOptions: RequestInit,
): Promise<Response | null> {
    const settings = loadSettings();
    const targetModel = settings.modelA;
    const targetUrl = normalizeApiUrl(settings.modelAApiUrl);
    const targetApiKey = settings.modelAApiKey;

    if (!targetModel) {
        addLog('直接API调用: 目标模型名称为空', 'warning');
        return null;
    }
    if (!targetUrl) {
        addLog('直接API调用: 目标API地址为空', 'warning');
        return null;
    }

    const messages = originalBody.messages || [];

    addLog('直接API调用: ' + targetModel, 'success');

    // 构建目标 API 的请求
    const directBody: Record<string, unknown> = {
        model: targetModel,
        messages: messages,
        stream: originalBody.stream !== false,
    };

    // 透传兼容参数
    const extraParams = ['temperature', 'max_tokens', 'top_p', 'frequency_penalty', 'presence_penalty', 'stop', 'seed'];
    for (let i = 0; i < extraParams.length; i++) {
        const key = extraParams[i];
        if (originalBody[key] !== undefined) {
            directBody[key] = originalBody[key];
        }
    }

    // NSFW 预设覆盖（如果有导入预设，用预设的生成参数覆盖透传值）
    applyPresetToBody(directBody);

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (targetApiKey) {
        headers['Authorization'] = 'Bearer ' + targetApiKey;
    }

    // 记录请求日志（隐藏敏感信息）
    const safeHeaders = { ...headers };
    if (safeHeaders['Authorization']) {
        safeHeaders['Authorization'] = 'Bearer ***';
    }
    addApiRequestLog(targetUrl, 'POST', safeHeaders, directBody);

    const startTime = Date.now();

    // ST 已格式化完毕，请求被接管 → 立即恢复原始预设
    if (onRequestRedirected) {
        onRequestRedirected();
    }

    // 15秒超时，防止目标API过慢导致用户长时间等待
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(function () {
        timeoutController.abort();
    }, 15000);

    // 如果ST取消了请求，同步取消我们的请求
    if (originalOptions && originalOptions.signal) {
        originalOptions.signal.addEventListener('abort', function () {
            timeoutController.abort();
        }, { once: true });
    }

    const fetchOptions: RequestInit = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(directBody),
        signal: timeoutController.signal,
    };

    try {
        const response = await originalFetch!(targetUrl, fetchOptions);
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        if (!response.ok) {
            // 尝试读取响应体以获取错误详情
            let errorBody: unknown = null;
            try {
                const clonedResponse = response.clone();
                errorBody = await clonedResponse.text();
                try { errorBody = JSON.parse(errorBody as string); } catch (e) { /* 保持文本格式 */ }
            } catch (e) { /* 忽略读取错误 */ }

            addApiErrorLog(targetUrl, {
                name: 'HttpError',
                message: 'HTTP ' + response.status,
            }, duration);
            addApiResponseLog(targetUrl, response.status, {}, errorBody, duration);
            return null;
        }

        // 读取响应体
        let responseBody: unknown = null;
        try {
            const clonedResponse = response.clone();
            responseBody = await clonedResponse.text();
            try { responseBody = JSON.parse(responseBody as string); } catch (e) { /* 保持文本格式 */ }
        } catch (e) { /* 忽略读取错误 */ }

        addApiResponseLog(targetUrl, 200, {}, responseBody, duration);
        addLog('直接API调用成功: ' + targetModel, 'success');
        return response;
    } catch (e) {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        const err = e instanceof Error ? e : new Error(String(e));

        // 分类错误类型
        let errorMessage = err.message;
        let errorCode = 'UNKNOWN';
        if (err.name === 'AbortError') {
            errorMessage = '请求超时或被取消 (15秒)';
            errorCode = 'TIMEOUT';
        } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            errorMessage = '网络连接失败，请检查目标API地址是否正确';
            errorCode = 'NETWORK';
        } else if (err.message.includes('CORS')) {
            errorMessage = '跨域请求被阻止，目标API可能不支持浏览器直接调用';
            errorCode = 'CORS';
        }

        addLog('直接API调用失败 [' + errorCode + ']: ' + errorMessage + ' (模型: ' + targetModel + ', 耗时: ' + duration + 'ms)', 'error');
        addApiErrorLog(targetUrl, {
            name: err.name,
            message: errorMessage,
            code: errorCode,
            targetModel: targetModel,
        }, duration);
        return null;
    }
}

/**
 * 标准化 API URL，确保以 /chat/completions 结尾
 */
function normalizeApiUrl(url: string): string {
    if (!url) return url;
    url = url.replace(/\/+$/, '');
    if (url.indexOf('/chat/completions') === -1) {
        url += '/chat/completions';
    }
    return url;
}
