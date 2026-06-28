// SPDX-License-Identifier: AGPL-3.0-only

export type LogLevelName = 'debug' | 'info' | 'warn' | 'error';
export type LogType = 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
    timestamp: string;
    message: string;
    type: LogType;
    level: LogLevelName;
    data: unknown | null;
}

export type RenderCallback = (logs: LogEntry[], newLog?: LogEntry) => void;

let logs: LogEntry[] = [];
let renderCallback: RenderCallback | null = null;

const LOG_LEVEL_PRIORITY: Record<LogLevelName, number> = {
    debug: 0, info: 1, warn: 2, error: 3,
};

const TYPE_TO_LEVEL: Record<LogType, LogLevelName> = {
    'info': 'info', 'success': 'info', 'warning': 'warn', 'error': 'error',
};

export function initLogs(): void {
    if (renderCallback) renderCallback(logs);
}

export function setRenderCallback(callback: RenderCallback): void {
    renderCallback = callback;
}

export function addLog(
    message: string,
    type: LogType = 'info',
    level?: LogLevelName,
    data?: unknown,
): void {
    if (!level) level = TYPE_TO_LEVEL[type] || 'info';
    const timestamp = new Date().toLocaleTimeString('zh-CN', {
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
        fractionalSecondDigits: 3,
    });
    const logEntry: LogEntry = { timestamp, message, type, level, data: data ?? null };
    logs.unshift(logEntry);
    if (logs.length > 200) logs = logs.slice(0, 200);
    const consoleMsg = `[NSFW模型切换器][${level.toUpperCase()}] ${message}`;
    switch (level) {
        case 'debug': console.debug(consoleMsg, data || ''); break;
        case 'warn': console.warn(consoleMsg, data || ''); break;
        case 'error': console.error(consoleMsg, data || ''); break;
        default: console.log(consoleMsg, data || '');
    }
    if (renderCallback) renderCallback(logs, logEntry);
}

export function addDebugLog(message: string, data?: unknown): void {
    addLog(message, 'info', 'debug', data);
}

export function clearLogs(): void {
    logs = [];
    if (renderCallback) renderCallback(logs);
}

export function getLogs(minLevel?: LogLevelName): LogEntry[] {
    if (!minLevel) return [...logs];
    const minPriority = LOG_LEVEL_PRIORITY[minLevel] ?? 0;
    return logs.filter(log => (LOG_LEVEL_PRIORITY[log.level] ?? 0) >= minPriority);
}

export function escapeHtml(str: string): string {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderLogEntryHtml(log: LogEntry): string {
    return `<div class="nsfw-log-entry" data-level="${log.level}">` +
        `<span class="nsfw-log-timestamp">${escapeHtml(log.timestamp)}</span>` +
        `<span class="nsfw-log-level" data-level="${log.level}">[${log.level.toUpperCase()}]</span>` +
        `<span class="nsfw-log-message">${escapeHtml(log.message)}</span></div>`;
}

export function renderLogsHtml(logsArray?: LogEntry[], minLevel?: LogLevelName): string {
    const items = logsArray || logs;
    const minPriority = LOG_LEVEL_PRIORITY[minLevel || 'debug'] ?? 0;
    const filtered = items.filter(log => (LOG_LEVEL_PRIORITY[log.level] ?? 0) >= minPriority);
    if (!filtered.length) return '<div class="nsfw-log-empty">暂无日志</div>';
    return filtered.map(renderLogEntryHtml).join('');
}
