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
import { addLog } from './logger.js';

// ST 的聊天补全 API 端点路径特征
const ST_API_PATTERNS = [
    '/api/backends/chat-completions/generate',
    '/api/chat/completions',
    '/api/openai/',
];

let originalFetch = null;
let interceptEnabled = false;

/**
 * 初始化 fetch 拦截器（在插件加载时调用一次）
 * 用包装函数替换 window.fetch，实现请求拦截
 */
export function initFetchInterceptor() {
    if (originalFetch) return;

    originalFetch = window.fetch.bind(window);

    window.fetch = async function (input, init) {
        const url = normalizeInputUrl(input);

        if (interceptEnabled && isStApiEndpoint(url)) {
            // 安全兜底：如果插件已被用户关闭，自动禁用拦截
            const currentSettings = loadSettings();
            if (!currentSettings.enabled) {
                interceptEnabled = false;
                return originalFetch(input, init);
            }

            const options = init || {};
            try {
                const body = parseBody(options.body);
                if (body && body.messages) {
                    const result = await redirectToTarget(body, options);
                    if (result) return result;
                }
            } catch (e) {
                addLog('拦截重定向失败: ' + e.message, 'error');
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
                return originalFetch(input, rest);
            }
        }

        return originalFetch(input, init);
    };
}

/**
 * 启用/禁用拦截
 */
export function setInterceptEnabled(enabled) {
    interceptEnabled = enabled;
}

export function isInterceptEnabled() {
    return interceptEnabled;
}

/**
 * 判断 URL 是否匹配 ST 的 API 端点
 */
function isStApiEndpoint(url) {
    return ST_API_PATTERNS.some(function (p) {
        return url.indexOf(p) !== -1;
    });
}

/**
 * 从 fetch 参数中提取 URL 字符串
 */
function normalizeInputUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof Request) return input.url;
    if (input && typeof input === 'object' && input.url) return input.url;
    return '';
}

/**
 * 安全解析请求体
 */
function parseBody(body) {
    if (!body) return null;
    if (typeof body === 'string') {
        try { return JSON.parse(body); } catch (e) { return null; }
    }
    return body;
}

/**
 * 核心：将请求重定向到目标模型的 API
 */
async function redirectToTarget(originalBody, originalOptions) {
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
    const directBody = {
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

    const headers = {
        'Content-Type': 'application/json',
    };
    if (targetApiKey) {
        headers['Authorization'] = 'Bearer ' + targetApiKey;
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

    const fetchOptions = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(directBody),
        signal: timeoutController.signal,
    };

    try {
        const response = await originalFetch(targetUrl, fetchOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
            addLog('直接API调用失败: ' + targetUrl + ' 状态码 ' + response.status, 'error');
            return null;
        }

        addLog('直接API调用成功: ' + targetModel, 'success');
        return response;
    } catch (e) {
        clearTimeout(timeoutId);
        addLog('直接API调用失败: ' + targetUrl + ' - ' + e.message, 'error');
        return null;
    }
}

/**
 * 标准化 API URL，确保以 /chat/completions 结尾
 */
function normalizeApiUrl(url) {
    if (!url) return url;
    url = url.replace(/\/+$/, '');
    if (url.indexOf('/chat/completions') === -1) {
        url += '/chat/completions';
    }
    return url;
}