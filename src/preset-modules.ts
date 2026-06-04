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
 * NSFW 模型切换器 - 预设模块定义 + 渲染
 *
 * Phase 4 Batch C Step C2: 从 index.ts 抽出
 *
 * 包含:
 * - PresetModuleDef 类型 + PRESET_MODULES 元数据 (6 个模块: genParams /
 *   instruct / context / sysprompt / reasoning / prompts)
 * - renderPresetModulesHtml: 生成预设模块树 HTML
 * - buildDefaultEnabledModules: 为新导入的预设生成默认全开的模块字典
 */

import { escapeHtml } from './utils.js';
import type { PresetData, PresetModuleEnabledMap } from './settings.js';

/** 预设模块定义 */
export interface PresetModuleDef {
    id: string;
    name: string;
    fields: string[];
    test: (p: PresetData) => boolean;
}

/**
 * 6 个预设模块的元数据 (从原 index.ts L40-48 整体迁出)
 */
export const PRESET_MODULES: PresetModuleDef[] = [
    {
        id: 'genParams',
        name: '生成参数',
        fields: ['temperature', 'top_p', 'top_k', 'top_a', 'min_p', 'repetition_penalty', 'frequency_penalty', 'presence_penalty', 'openai_max_context', 'openai_max_tokens'],
        test: (p: PresetData) => ['temperature', 'top_p', 'top_k', 'repetition_penalty'].some((k) => p[k] !== undefined),
    },
    {
        id: 'instruct',
        name: 'Instruct 模板',
        fields: ['input_sequence', 'output_sequence', 'system_sequence', 'stop_sequence', 'wrap', 'names_behavior', 'activation_regex', 'output_suffix', 'input_suffix', 'system_suffix', 'first_output_sequence', 'last_output_sequence', 'system_same_as_user', 'sequences_as_stop_strings', 'skip_examples', 'macro', 'user_alignment_message', 'last_system_sequence', 'first_input_sequence', 'last_input_sequence', 'story_string_prefix', 'story_string_suffix'],
        test: (p: PresetData) => p.input_sequence !== undefined,
    },
    {
        id: 'context',
        name: 'Context 模板',
        fields: ['story_string', 'chat_start', 'example_separator', 'use_stop_strings', 'names_as_stop_strings', 'story_string_position', 'story_string_depth', 'story_string_role', 'always_force_name2', 'trim_sentences', 'single_line'],
        test: (p: PresetData) => p.story_string !== undefined,
    },
    {
        id: 'sysprompt',
        name: 'System Prompt',
        fields: ['content', 'post_history'],
        test: (p: PresetData) => p.content !== undefined && p.name !== undefined,
    },
    {
        id: 'reasoning',
        name: 'Reasoning 格式',
        fields: ['prefix', 'suffix', 'separator'],
        test: (p: PresetData) => p.prefix !== undefined && p.suffix !== undefined,
    },
    {
        id: 'prompts',
        name: '自定义提示词',
        fields: [],
        test: (p: PresetData) => Array.isArray(p.prompts) && p.prompts.length > 0,
    },
];

/**
 * 生成预设模块树的 HTML
 *
 * @param preset    预设数据 (null 时显示"未导入预设")
 * @param enabled   模块开关字典 (未提供时全开)
 */
export function renderPresetModulesHtml(
    preset: PresetData | null | undefined,
    enabled?: PresetModuleEnabledMap,
): string {
    if (!preset) return '<div class="nsfw-preset-status">未导入预设</div>';
    const name = preset.name || preset.display_name || '未命名预设';
    let html = '<div class="nsfw-preset-status">已导入: <span class="preset-name">' + name + '</span></div>';
    html += '<div class="nsfw-preset-modules">';
    for (const m of PRESET_MODULES) {
        if (!m.test(preset)) continue;
        const modOn = !enabled || enabled[m.id] !== false;
        html += '<div class="nsfw-module-header" data-module="' + m.id + '">' +
            '<input type="checkbox" class="nsfw-module-chk" data-module="' + m.id + '" ' + (modOn ? 'checked' : '') + '>' +
            m.name + '</div>';

        if (m.id === 'prompts' && Array.isArray(preset.prompts)) {
            const prompts = preset.prompts as Array<{ name?: string; content?: string }>;
            for (let pi = 0; pi < prompts.length; pi++) {
                const pp = prompts[pi];
                const pfId = 'prompt_' + pi;
                const pfOn = enabled && enabled[pfId] !== false;
                html += '<div class="nsfw-field-row" data-field="' + pfId + '">' +
                    '<input type="checkbox" class="nsfw-field-chk" data-field="' + pfId + '" ' + (pfOn ? 'checked' : '') + '>' +
                    '<span class="nsfw-field-value">' + escapeHtml(pp.name || '(未命名)') + '</span></div>';
            }
        } else if (m.fields) {
            for (const fk of m.fields) {
                if (preset[fk] !== undefined) {
                    const fId = m.id + '_' + fk;
                    const fOn = enabled && enabled[fId] !== false;
                    let val = String(preset[fk]);
                    if (val.length > 80) val = val.substring(0, 80) + '...';
                    html += '<div class="nsfw-field-row" data-field="' + fId + '" data-key="' + fk + '">' +
                        '<input type="checkbox" class="nsfw-field-chk" data-field="' + fId + '" ' + (fOn ? 'checked' : '') + '>' +
                        '<span class="nsfw-field-key">' + fk + ':</span>' +
                        '<span class="nsfw-field-value">' + escapeHtml(val) + '</span></div>';
                }
            }
        }
    }
    html += '</div>';
    return html;
}

/**
 * 为新导入的预设生成默认全开的模块字典
 *
 * 用于:
 * - 文件导入时 (用户首次拖入 JSON, 自动启用所有可识别的模块)
 * - "新建" 按钮 (基于当前激活预设复制)
 */
export function buildDefaultEnabledModules(preset: PresetData | null | undefined): PresetModuleEnabledMap {
    const enabled: PresetModuleEnabledMap = {};
    if (!preset) return enabled;
    for (const m of PRESET_MODULES) {
        if (!m.test(preset)) continue;
        enabled[m.id] = true;
        if (m.id === 'prompts' && Array.isArray(preset.prompts)) {
            const prompts = preset.prompts as unknown[];
            for (let pi = 0; pi < prompts.length; pi++) enabled['prompt_' + pi] = true;
        } else if (m.fields) {
            for (const f of m.fields) {
                if (preset[f] !== undefined) enabled[m.id + '_' + f] = true;
            }
        }
    }
    return enabled;
}
