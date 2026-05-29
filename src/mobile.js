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
