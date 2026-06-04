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
 * NSFW 模型切换器 - 通用工具函数
 *
 * Phase 4 Batch C Step C1: 从 index.ts 抽出
 * - escapeHtml: HTML 转义 (防 XSS)
 * - extractGenParams: 从预设提取生成参数
 * - getSettingsRoot: 类型化访问 extension_settings 入口
 */

import { extension_settings } from '../../../../extensions.js';
import { EXTENSION_NAME, type NsfwSwitcherSettings, type PresetData } from './settings.js';

/**
 * 类型化访问 extension_settings[EXTENSION_NAME]
 *
 * ST 的 extension_settings 类型是 unknown index, 需要断言到具体形状。
 * 收口在这里, 调用方不再散写 `extension_settings as unknown as ...`。
 */
export function getSettingsRoot(): NsfwSwitcherSettings {
    return (extension_settings as unknown as Record<string, NsfwSwitcherSettings>)[EXTENSION_NAME];
}

/**
 * 转义 HTML 特殊字符 (防 XSS)
 *
 * 注: 与 logger.ts 内部的 escapeHtml 重复, 但 logger 用于日志, 此处用于
 * UI 模板。它们逻辑相同但语义不同, 暂保持分离。
 */
export function escapeHtml(str: unknown): string {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * 从预设中提取生成参数 (temperature/top_p 等)
 *
 * 返回值用于:
 * - coordinator.prepare 时填入 AppliedOverrides.genParams
 * - direct-api 的 setPresetOverrides 写入请求 body
 */
const GEN_PARAM_KEYS = [
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_p',
    'top_k',
    'top_a',
    'min_p',
    'repetition_penalty',
    'openai_max_context',
    'openai_max_tokens',
    'stream_openai',
] as const;

export function extractGenParams(preset: PresetData | null | undefined): Record<string, unknown> | null {
    if (!preset) return null;
    const params: Record<string, unknown> = {};
    for (const key of GEN_PARAM_KEYS) {
        if (preset[key] !== undefined) params[key] = preset[key];
    }
    return Object.keys(params).length ? params : null;
}
