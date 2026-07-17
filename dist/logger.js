// SPDX-License-Identifier: AGPL-3.0-only
/** 日志条数上限（外部通过 setLogMaxEntries 注入，避免循环依赖 settings.ts） */
let _logMaxEntries = 200;
export function setLogMaxEntries(n) {
    _logMaxEntries = n;
}
let logs = [];
let renderCallback = null;
const LOG_LEVEL_PRIORITY = {
    debug: 0, info: 1, warn: 2, error: 3,
};
const TYPE_TO_LEVEL = {
    'info': 'info', 'success': 'info', 'warning': 'warn', 'error': 'error',
};
export function initLogs() {
    if (renderCallback)
        renderCallback(logs);
}
export function setRenderCallback(callback) {
    renderCallback = callback;
}
export function addLog(message, type = 'info', level, data) {
    if (!level)
        level = TYPE_TO_LEVEL[type] || 'info';
    const timestamp = new Date().toLocaleTimeString('zh-CN', {
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
        fractionalSecondDigits: 3,
    });
    const logEntry = { timestamp, message, type, level, data: data ?? null };
    logs.unshift(logEntry);
    if (logs.length > _logMaxEntries)
        logs = logs.slice(0, _logMaxEntries);
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
    if (renderCallback)
        renderCallback(logs, logEntry);
}
export function addDebugLog(message, data) {
    addLog(message, 'info', 'debug', data);
}
export function clearLogs() {
    logs = [];
    if (renderCallback)
        renderCallback(logs);
}
export function getLogs(minLevel) {
    if (!minLevel)
        return [...logs];
    const minPriority = LOG_LEVEL_PRIORITY[minLevel] ?? 0;
    return logs.filter(log => (LOG_LEVEL_PRIORITY[log.level] ?? 0) >= minPriority);
}
export function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export function renderLogEntryHtml(log) {
    return `<div class="nsfw-log-entry" data-level="${log.level}">` +
        `<span class="nsfw-log-timestamp">${escapeHtml(log.timestamp)}</span>` +
        `<span class="nsfw-log-level" data-level="${log.level}">[${log.level.toUpperCase()}]</span>` +
        `<span class="nsfw-log-message">${escapeHtml(log.message)}</span></div>`;
}
export function renderLogsHtml(logsArray, minLevel) {
    const items = logsArray || logs;
    const minPriority = LOG_LEVEL_PRIORITY[minLevel || 'debug'] ?? 0;
    const filtered = items.filter(log => (LOG_LEVEL_PRIORITY[log.level] ?? 0) >= minPriority);
    if (!filtered.length)
        return '<div class="nsfw-log-empty">暂无日志</div>';
    return filtered.map(renderLogEntryHtml).join('');
}
//# sourceMappingURL=logger.js.map