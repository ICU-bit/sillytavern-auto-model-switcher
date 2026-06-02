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
// ===== 模块状态 =====
let logs = [];
let renderCallback = null;
/** 日志级别常量 */
export const LogLevel = Object.freeze({
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
});
/** 日志级别优先级（数值越大优先级越高） */
const LOG_LEVEL_PRIORITY = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
/** 日志类型到级别的映射（向后兼容） */
const TYPE_TO_LEVEL = {
    'info': 'info',
    'success': 'info',
    'warning': 'warn',
    'error': 'error',
};
/** localStorage 持久化常量 */
const STORAGE_KEY = 'nsfw_switcher_logs';
// localStorage 写入防抖（避免高频写入）
let saveTimeout = null;
function debouncedSave() {
    if (saveTimeout)
        clearTimeout(saveTimeout);
    saveTimeout = setTimeout(function () { saveLogsToStorage(); }, 1000);
}
/**
 * 将日志保存到 localStorage
 */
function saveLogsToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    }
    catch (e) {
        // 私有浏览模式可能阻止 localStorage 写入，静默失败
    }
}
/**
 * 从 localStorage 加载日志
 */
function loadLogsFromStorage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            logs = JSON.parse(stored);
        }
    }
    catch (e) {
        // 解析失败或 localStorage 不可用，静默失败
    }
}
/**
 * 初始化日志（从 localStorage 加载，应在启动时调用一次）
 */
export function initLogs() {
    loadLogsFromStorage();
    if (renderCallback) {
        renderCallback(logs);
    }
}
/**
 * 注册渲染回调，当日志更新时自动刷新 UI
 * @param callback - 接收 logs 数组的渲染函数
 */
export function setRenderCallback(callback) {
    renderCallback = callback;
}
/**
 * 添加一条日志
 * @param message - 日志内容
 * @param type - 日志类型（向后兼容）
 * @param level - 日志级别（可选，默认根据 type 推断）
 * @param data - 附加数据（如请求/响应详情）
 */
export function addLog(message, type = 'info', level, data) {
    // 向后兼容：如果 level 未指定，根据 type 推断
    if (!level) {
        level = TYPE_TO_LEVEL[type] || 'info';
    }
    const timestamp = new Date().toLocaleTimeString('zh-CN', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
    });
    const logEntry = {
        timestamp,
        message,
        type,
        level,
        data: data ?? null,
    };
    logs.unshift(logEntry);
    // 限制日志数量（最多200条）
    if (logs.length > 200) {
        logs = logs.slice(0, 200);
    }
    debouncedSave();
    // 控制台输出
    const consoleMsg = `[NSFW模型切换器][${level.toUpperCase()}] ${message}`;
    switch (level) {
        case 'debug':
            console.debug(consoleMsg, data || '');
            break;
        case 'warn':
            console.warn(consoleMsg, data || '');
            break;
        case 'error':
            console.error(consoleMsg, data || '');
            break;
        default: console.log(consoleMsg, data || '');
    }
    if (renderCallback) {
        renderCallback(logs, logEntry);
    }
}
/**
 * 添加调试日志（仅在debug模式下显示）
 * @param message - 日志内容
 * @param data - 附加数据
 */
export function addDebugLog(message, data) {
    addLog(message, 'info', 'debug', data);
}
/**
 * 添加API请求日志
 */
export function addApiRequestLog(url, method, headers, body) {
    addLog(`API请求: ${method} ${url}`, 'info', 'debug', {
        type: 'api_request',
        url,
        method,
        headers,
        body,
    });
}
/**
 * 添加API响应日志
 */
export function addApiResponseLog(url, status, headers, body, duration) {
    const level = status >= 400 ? 'error' : 'debug';
    addLog(`API响应: ${status} ${url} (${duration}ms)`, status >= 400 ? 'error' : 'info', level, {
        type: 'api_response',
        url,
        status,
        headers,
        body,
        duration,
    });
}
/**
 * 添加API错误日志
 */
export function addApiErrorLog(url, error, duration) {
    addLog(`API错误: ${url} - ${error.message}`, 'error', 'error', {
        type: 'api_error',
        url,
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
        },
        duration,
    });
}
/**
 * 添加状态转换日志
 */
export function addStateTransitionLog(fromState, toState, reason) {
    addLog(`状态转换: ${fromState} → ${toState} (${reason})`, 'info', 'debug', {
        type: 'state_transition',
        fromState,
        toState,
        reason,
    });
}
/**
 * 清空所有日志
 */
export function clearLogs() {
    logs = [];
    saveLogsToStorage();
    if (renderCallback) {
        renderCallback(logs);
    }
}
/**
 * 获取当前日志的浅拷贝
 * @param minLevel - 最低日志级别（默认 'debug'）
 */
export function getLogs(minLevel) {
    if (!minLevel)
        return [...logs];
    const minPriority = LOG_LEVEL_PRIORITY[minLevel] ?? 0;
    return logs.filter(log => {
        const priority = LOG_LEVEL_PRIORITY[log.level] ?? 0;
        return priority >= minPriority;
    });
}
/**
 * 导出日志为JSON字符串
 */
export function exportLogsAsJson(minLevel) {
    const filteredLogs = getLogs(minLevel);
    return JSON.stringify({
        exportTime: new Date().toISOString(),
        logCount: filteredLogs.length,
        logs: filteredLogs,
    }, null, 2);
}
/**
 * 导出日志为文本字符串
 */
export function exportLogsAsText(minLevel) {
    const filteredLogs = getLogs(minLevel);
    const lines = filteredLogs.map(log => {
        const dataStr = log.data ? ` | ${JSON.stringify(log.data)}` : '';
        return `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}${dataStr}`;
    });
    return lines.join('\n');
}
/**
 * 复制日志到剪贴板
 * @param format - 导出格式（默认 'text'）
 * @param minLevel - 最低日志级别
 */
export async function copyLogsToClipboard(format = 'text', minLevel) {
    try {
        const content = format === 'json'
            ? exportLogsAsJson(minLevel)
            : exportLogsAsText(minLevel);
        await navigator.clipboard.writeText(content);
        addLog('日志已复制到剪贴板', 'success');
        return true;
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        addLog('复制日志失败: ' + msg, 'error');
        return false;
    }
}
/**
 * 转义 HTML 特殊字符（防 XSS）
 */
function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/**
 * 生成单条日志 HTML
 */
export function renderLogEntryHtml(log) {
    return `<div class="nsfw-log-entry" data-level="${log.level}">` +
        `<span class="nsfw-log-timestamp">${escapeHtml(log.timestamp)}</span>` +
        `<span class="nsfw-log-level" data-level="${log.level}">[${log.level.toUpperCase()}]</span>` +
        `<span class="nsfw-log-message">${escapeHtml(log.message)}</span>` +
        `</div>`;
}
/**
 * 生成日志 HTML（供设置面板使用）
 * @param logsArray - 日志数组（默认用模块内 logs）
 * @param minLevel - 最低显示级别（默认 'debug'）
 */
export function renderLogsHtml(logsArray, minLevel) {
    const items = logsArray || logs;
    const minPriority = LOG_LEVEL_PRIORITY[minLevel || 'debug'] ?? 0;
    const filteredItems = items.filter(log => {
        const priority = LOG_LEVEL_PRIORITY[log.level] ?? 0;
        return priority >= minPriority;
    });
    if (!filteredItems.length) {
        return '<div class="nsfw-log-empty">暂无日志</div>';
    }
    return filteredItems.map(renderLogEntryHtml).join('');
}
//# sourceMappingURL=logger.js.map