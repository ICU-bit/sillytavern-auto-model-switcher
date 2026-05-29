/**
 * NSFW 模型切换器 — 移动端工具模块
 *
 * 封装移动端相关工具函数：
 *  - isMobile(): 统一移动端检测
 *  - prefersReducedMotion(): 读取系统减少动画偏好
 *  - showPrompt / showConfirm: 自定义模态框（替代原生 prompt/confirm）
 *  - shareOrDownload: 移动端分享 + 桌面端下载
 *  - initAccordion: 手风琴模式控制器
 */

import { getContext } from '../../../../extensions.js';

/**
 * 统一移动端检测入口
 * @returns {boolean}
 */
export function isMobile() {
    try {
        return Boolean(getContext().isMobile);
    } catch (e) {
        return false;
    }
}

/**
 * 读取系统 prefers-reduced-motion 偏好
 * @returns {boolean}
 */
export function prefersReducedMotion() {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
        return false;
    }
}

// ---------------------------------------------------------------------------
//  Internal Helpers — Modal System
// ---------------------------------------------------------------------------

function createModalOverlay() {
    var overlay = document.createElement('div');
    overlay.className = 'nsfw-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;' +
        'z-index:10000;opacity:0;transition:opacity 0.15s ease;';
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
            overlay._resolve(null);
            destroyDialog(overlay);
        }
    });
    document.body.appendChild(overlay);
    // Force reflow for transition
    overlay.offsetHeight; // eslint-disable-line no-unused-expressions
    overlay.style.opacity = '1';
    return overlay;
}

function createDialogElement(type, message, inputDefault) {
    var dialog = document.createElement('div');
    dialog.className = 'nsfw-modal-dialog';
    dialog.style.cssText = 'background:var(--SmartThemeBodyColor);color:var(--SmartThemeEmColor);' +
        'border:1px solid var(--SmartThemeBorderColor);border-radius:12px;padding:20px;' +
        'max-width:90vw;width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.4);' +
        'transform:scale(0.95);transition:transform 0.15s ease;';

    var msgEl = document.createElement('div');
    msgEl.style.cssText = 'margin-bottom:16px;font-size:14px;line-height:1.5;';
    msgEl.textContent = message;
    dialog.appendChild(msgEl);

    if (type === 'prompt') {
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'nsfw-input';
        input.value = inputDefault || '';
        input.style.cssText = 'width:100%;margin-bottom:16px;box-sizing:border-box;';
        dialog.appendChild(input);
        dialog._input = input;
    }

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'nsfw-btn nsfw-btn-secondary';
    cancelBtn.textContent = type === 'confirm' ? '否' : '取消';
    cancelBtn.style.cssText = 'padding:8px 16px;';
    cancelBtn.addEventListener('click', function () {
        dialog._overlay._resolve(type === 'confirm' ? false : null);
        destroyDialog(dialog._overlay);
    });

    var okBtn = document.createElement('button');
    okBtn.className = 'nsfw-btn nsfw-btn-primary';
    okBtn.textContent = type === 'confirm' ? '是' : '确定';
    okBtn.style.cssText = 'padding:8px 16px;';
    okBtn.addEventListener('click', function () {
        if (type === 'confirm') {
            dialog._overlay._resolve(true);
        } else {
            var val = dialog._input.value;
            dialog._overlay._resolve(val === '' ? null : val);
        }
        destroyDialog(dialog._overlay);
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    dialog.appendChild(btnRow);

    // Enter key support for prompt
    if (type === 'prompt') {
        dialog._input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                okBtn.click();
            } else if (e.key === 'Escape') {
                cancelBtn.click();
            }
        });
        // Auto-focus after append
        setTimeout(function () { dialog._input.focus(); }, 50);
    }

    // Escape key for confirm
    if (type === 'confirm') {
        dialog._escapeHandler = function (e) {
            if (e.key === 'Escape') {
                dialog._overlay._resolve(false);
                destroyDialog(dialog._overlay);
            }
        };
        document.addEventListener('keydown', dialog._escapeHandler);
    }

    // Force reflow for transition
    setTimeout(function () { dialog.style.transform = 'scale(1)'; }, 10);

    return dialog;
}

function destroyDialog(overlay) {
    if (prefersReducedMotion()) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        return;
    }
    overlay.style.opacity = '0';
    var dialog = overlay.querySelector('.nsfw-modal-dialog');
    if (dialog) dialog.style.transform = 'scale(0.95)';
    setTimeout(function () {
        if (overlay._escapeHandler) {
            document.removeEventListener('keydown', overlay._escapeHandler);
        }
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 150);
}

/**
 * 自定义 prompt 模态框（替代原生 prompt）
 * @param {string} message - 提示消息
 * @param {string} [defaultValue=''] - 默认值
 * @returns {Promise<string|null>} 用户输入值，取消返回 null
 */
export function showPrompt(message, defaultValue) {
    return new Promise(function (resolve) {
        var overlay = createModalOverlay();
        overlay._resolve = resolve;
        var dialog = createDialogElement('prompt', message, defaultValue || '');
        dialog._overlay = overlay;
        overlay.appendChild(dialog);
    });
}

/**
 * 自定义 confirm 模态框（替代原生 confirm）
 * @param {string} message - 确认消息
 * @returns {Promise<boolean>} 确认返回 true，取消返回 false
 */
export function showConfirm(message) {
    return new Promise(function (resolve) {
        var overlay = createModalOverlay();
        overlay._resolve = resolve;
        var dialog = createDialogElement('confirm', message);
        dialog._overlay = overlay;
        overlay.appendChild(dialog);
    });
}

/**
 * 移动端分享 / 桌面端下载
 * 优先调用 navigator.share()（移动端），降级为 Blob + <a>.click() 下载
 * @param {string} data - 要分享/下载的文本内容
 * @param {string} filename - 下载文件名
 * @param {string} mimeType - MIME 类型
 * @returns {Promise<void>}
 */
export function shareOrDownload(data, filename, mimeType) {
    if (navigator.share && isMobile()) {
        var blob = new Blob([data], { type: mimeType });
        var file = new File([blob], filename, { type: mimeType });
        return navigator.share({
            files: [file],
            title: filename,
        }).catch(function (err) {
            if (err.name !== 'AbortError') {
                fallbackDownload(data, filename, mimeType);
            }
        });
    }
    return fallbackDownload(data, filename, mimeType);
}

function fallbackDownload(data, filename, mimeType) {
    return new Promise(function (resolve) {
        var blob = new Blob([data], { type: mimeType });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        resolve();
    });
}
