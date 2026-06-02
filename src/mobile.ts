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

/** 对话框类型 */
type DialogType = 'prompt' | 'confirm';

/** 内部 overlay 元素（带 _resolve 钩子） */
interface ModalOverlay extends HTMLDivElement {
    _resolve: (value: unknown) => void;
    _escapeHandler?: (e: KeyboardEvent) => void;
}

/** 内部 dialog 元素（带 _overlay / _input 钩子） */
interface ModalDialog extends HTMLDivElement {
    _overlay: ModalOverlay;
    _input?: HTMLInputElement;
}

/**
 * 统一移动端检测入口
 */
export function isMobile(): boolean {
    try {
        return Boolean(getContext().isMobile);
    } catch (e) {
        return false;
    }
}

/**
 * 读取系统 prefers-reduced-motion 偏好
 */
export function prefersReducedMotion(): boolean {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
        return false;
    }
}

// ---------------------------------------------------------------------------
//  Internal Helpers — Modal System
// ---------------------------------------------------------------------------

function createModalOverlay(): ModalOverlay {
    const overlay = document.createElement('div') as ModalOverlay;
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
    void overlay.offsetHeight;
    overlay.style.opacity = '1';
    return overlay;
}

function createDialogElement(
    type: DialogType,
    message: string,
    inputDefault?: string,
): ModalDialog {
    const dialog = document.createElement('div') as ModalDialog;
    dialog.className = 'nsfw-modal-dialog';
    dialog.style.cssText = 'background:var(--SmartThemeBodyColor);color:var(--SmartThemeEmColor);' +
        'border:1px solid var(--SmartThemeBorderColor);border-radius:12px;padding:20px;' +
        'max-width:90vw;width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.4);' +
        'transform:scale(0.95);transition:transform 0.15s ease;';

    const msgEl = document.createElement('div');
    msgEl.style.cssText = 'margin-bottom:16px;font-size:14px;line-height:1.5;';
    msgEl.textContent = message;
    dialog.appendChild(msgEl);

    if (type === 'prompt') {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'nsfw-input';
        input.value = inputDefault || '';
        input.style.cssText = 'width:100%;margin-bottom:16px;box-sizing:border-box;';
        dialog.appendChild(input);
        dialog._input = input;
    }

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'nsfw-btn nsfw-btn-secondary';
    cancelBtn.textContent = type === 'confirm' ? '否' : '取消';
    cancelBtn.style.cssText = 'padding:8px 16px;';
    cancelBtn.addEventListener('click', function () {
        dialog._overlay._resolve(type === 'confirm' ? false : null);
        destroyDialog(dialog._overlay);
    });

    const okBtn = document.createElement('button');
    okBtn.className = 'nsfw-btn nsfw-btn-primary';
    okBtn.textContent = type === 'confirm' ? '是' : '确定';
    okBtn.style.cssText = 'padding:8px 16px;';
    okBtn.addEventListener('click', function () {
        if (type === 'confirm') {
            dialog._overlay._resolve(true);
        } else {
            const val = dialog._input ? dialog._input.value : '';
            dialog._overlay._resolve(val === '' ? null : val);
        }
        destroyDialog(dialog._overlay);
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    dialog.appendChild(btnRow);

    // Enter key support for prompt
    if (type === 'prompt' && dialog._input) {
        const input = dialog._input;
        input.addEventListener('keydown', function (e: KeyboardEvent) {
            if (e.key === 'Enter') {
                okBtn.click();
            } else if (e.key === 'Escape') {
                cancelBtn.click();
            }
        });
        // Auto-focus after append
        setTimeout(function () { input.focus(); }, 50);
    }

    // Escape key for confirm
    if (type === 'confirm') {
        dialog._overlay._escapeHandler = function (e: KeyboardEvent) {
            if (e.key === 'Escape') {
                dialog._overlay._resolve(false);
                destroyDialog(dialog._overlay);
            }
        };
        document.addEventListener('keydown', dialog._overlay._escapeHandler);
    }

    // Force reflow for transition
    setTimeout(function () { dialog.style.transform = 'scale(1)'; }, 10);

    return dialog;
}

function destroyDialog(overlay: ModalOverlay): void {
    if (prefersReducedMotion()) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        return;
    }
    overlay.style.opacity = '0';
    const dialog = overlay.querySelector('.nsfw-modal-dialog') as HTMLDivElement | null;
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
 * @param message - 提示消息
 * @param defaultValue - 默认值
 * @returns Promise — 用户输入值，取消返回 null
 */
export function showPrompt(message: string, defaultValue?: string): Promise<string | null> {
    return new Promise(function (resolve) {
        const overlay = createModalOverlay();
        overlay._resolve = resolve as (v: unknown) => void;
        const dialog = createDialogElement('prompt', message, defaultValue || '');
        dialog._overlay = overlay;
        overlay.appendChild(dialog);
    });
}

/**
 * 自定义 confirm 模态框（替代原生 confirm）
 * @param message - 确认消息
 * @returns Promise — 确认返回 true，取消返回 false
 */
export function showConfirm(message: string): Promise<boolean> {
    return new Promise(function (resolve) {
        const overlay = createModalOverlay();
        overlay._resolve = resolve as (v: unknown) => void;
        const dialog = createDialogElement('confirm', message);
        dialog._overlay = overlay;
        overlay.appendChild(dialog);
    });
}

/**
 * 移动端分享 / 桌面端下载
 * 优先调用 navigator.share()（移动端），降级为 Blob + <a>.click() 下载
 */
export function shareOrDownload(
    data: string,
    filename: string,
    mimeType: string,
): Promise<void> {
    if (navigator.share && isMobile()) {
        const blob = new Blob([data], { type: mimeType });
        const file = new File([blob], filename, { type: mimeType });
        return navigator.share({
            files: [file],
            title: filename,
        }).catch(function (err: Error) {
            if (err.name !== 'AbortError') {
                return fallbackDownload(data, filename, mimeType);
            }
            return undefined;
        });
    }
    return fallbackDownload(data, filename, mimeType);
}

function fallbackDownload(data: string, filename: string, mimeType: string): Promise<void> {
    return new Promise(function (resolve) {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        resolve();
    });
}

/**
 * 手风琴模式控制器
 * 点击模块头展开当前模块，自动折叠其他模块
 */
export function initAccordion(containerSelector: string): void {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    // Collapse all modules initially, keep first one open
    const headers = container.querySelectorAll('.nsfw-module-header');
    let currentModule: string | null = null;

    for (let i = 0; i < headers.length; i++) {
        const header = headers[i] as HTMLElement;
        const moduleId = header.getAttribute('data-module');
        if (!moduleId) continue;

        // Initially collapse all except the first
        if (i > 0) {
            collapseModuleFields(container, moduleId);
        } else {
            currentModule = moduleId;
        }

        // Add click handler
        header.addEventListener('click', function (this: HTMLElement, e: Event) {
            // Don't trigger on checkbox click
            if ((e.target as HTMLElement).tagName === 'INPUT') return;

            const clickedModule = this.getAttribute('data-module');
            if (!clickedModule) return;

            // If clicking the already-open module, collapse it
            if (currentModule === clickedModule) {
                collapseModuleFields(container, clickedModule);
                currentModule = null;
                return;
            }

            // Collapse current, expand clicked
            if (currentModule) {
                collapseModuleFields(container, currentModule);
            }
            expandModuleFields(container, clickedModule);
            currentModule = clickedModule;
        });
    }
}

function collapseModuleFields(container: Element, moduleId: string): void {
    const rows = container.querySelectorAll('.nsfw-field-row[data-field^="' + moduleId + '_"]');
    for (let i = 0; i < rows.length; i++) {
        (rows[i] as HTMLElement).style.display = 'none';
    }
    // Also collapse prompt_ rows if this is the prompts module
    if (moduleId === 'prompts') {
        const promptRows = container.querySelectorAll('.nsfw-field-row[data-field^="prompt_"]');
        for (let j = 0; j < promptRows.length; j++) {
            (promptRows[j] as HTMLElement).style.display = 'none';
        }
    }
    // Update header chevron
    const header = container.querySelector('.nsfw-module-header[data-module="' + moduleId + '"]');
    if (header) {
        const chevron = header.querySelector('.nsfw-collapse-icon');
        if (chevron) chevron.classList.remove('nsfw-expanded');
    }
}

function expandModuleFields(container: Element, moduleId: string): void {
    const rows = container.querySelectorAll('.nsfw-field-row[data-field^="' + moduleId + '_"]');
    for (let i = 0; i < rows.length; i++) {
        (rows[i] as HTMLElement).style.display = '';
    }
    // Also expand prompt_ rows if this is the prompts module
    if (moduleId === 'prompts') {
        const promptRows = container.querySelectorAll('.nsfw-field-row[data-field^="prompt_"]');
        for (let j = 0; j < promptRows.length; j++) {
            (promptRows[j] as HTMLElement).style.display = '';
        }
    }
    // Update header chevron
    const header = container.querySelector('.nsfw-module-header[data-module="' + moduleId + '"]');
    if (header) {
        const chevron = header.querySelector('.nsfw-collapse-icon');
        if (chevron) chevron.classList.add('nsfw-expanded');
    }
}
