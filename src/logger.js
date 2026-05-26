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
 * NSFW 模型切换器 - 日志模块
 * 管理运行日志的存储和展示
 */

let logs = [];
let renderCallback = null;

/**
 * 注册渲染回调，当日志更新时自动刷新 UI
 * @param {Function} callback - 接收 logs 数组的渲染函数
 */
export function setRenderCallback(callback) {
    renderCallback = callback;
}

/**
 * 添加一条日志
 * @param {string} message - 日志内容
 * @param {'info'|'success'|'warning'|'error'} type - 日志类型
 */
export function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('zh-CN');
    logs.unshift({ timestamp, message, type });
    if (logs.length > 50) {
        logs = logs.slice(0, 50);
    }
    console.log(`[NSFW模型切换器] ${message}`);
    if (renderCallback) {
        renderCallback(logs);
    }
}

/**
 * 清空所有日志
 */
export function clearLogs() {
    logs = [];
    if (renderCallback) {
        renderCallback(logs);
    }
}

/**
 * 获取当前日志的浅拷贝
 * @returns {Array<{timestamp: string, message: string, type: string}>}
 */
export function getLogs() {
    return [...logs];
}

/**
 * 生成日志 HTML（供设置面板使用）
 * @param {Array} logsArray
 * @returns {string}
 */
export function renderLogsHtml(logsArray) {
    const items = logsArray || logs;
    if (!items.length) {
        return '<div style="color: #999; font-size: 12px; text-align: center;">暂无日志</div>';
    }

    const typeColors = {
        success: '#27ae60',
        warning: '#f39c12',
        error: '#e74c3c',
        info: '#3498db',
    };

    return items.map(log => `
        <div style="display: flex; gap: 8px; padding: 4px 0; font-size: 12px;">
            <span style="color: #999; font-family: monospace;">${log.timestamp}</span>
            <span style="color: ${typeColors[log.type] || '#3498db'};">[${log.type.toUpperCase()}]</span>
            <span style="color: #333;">${log.message}</span>
        </div>
    `).join('');
}