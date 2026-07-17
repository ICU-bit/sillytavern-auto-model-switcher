// SPDX-License-Identifier: AGPL-3.0-only

/**
 * NSFW 模型切换器 - 设置面板 HTML 构建器
 *
 * 纯函数集合：输入参数，返回 HTML 字符串。
 * 零副作用，零外部依赖（仅依赖字符串拼接）。
 */

/** 构建表单输入字段 HTML (label + input) */
export function buildInputFieldHtml(id: string, labelText: string, type: string, placeholder?: string, required?: boolean): string {
    const reqMark = required ? ' <span class="required">*</span>' : '';
    return '<div class="nsfw-field-group">' +
        '<label class="nsfw-field-label" for="' + id + '">' +
        labelText + reqMark + '</label>' +
        '<input type="' + type + '" id="' + id + '" class="nsfw-input"' +
        (placeholder ? ' placeholder="' + placeholder + '"' : '') + '>' +
        '</div>';
}

/** 构建复选框字段 HTML */
export function buildCheckboxFieldHtml(id: string, labelText: string, checked?: boolean): string {
    return '<label class="nsfw-checkbox-row" for="' + id + '">' +
        '<input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '>' +
        '<span>' + labelText + '</span>' +
        '</label>';
}

/** 构建带图标的区块标题 HTML */
export function buildSectionTitleHtml(iconClass: string, titleText: string): string {
    return '<div class="nsfw-section-title">' +
        '<i class="' + iconClass + '"></i>' + titleText +
        '</div>';
}

/** 状态指示器区域 */
export function buildStatusSectionHtml(): string {
    return '<div class="nsfw-status-bar">' +
        '<div class="nsfw-status-indicator" id="nsfw_switcher_status_indicator" data-state="incomplete"></div>' +
        '<span class="nsfw-status-text">状态:</span> ' +
        '<span class="nsfw-status-text" id="nsfw_switcher_status_text">启动中...</span>' +
        '<span class="nsfw-state-text" id="nsfw_switcher_state_text"></span>' +
        '</div>';
}

/** 启用插件开关 */
export function buildEnableSectionHtml(): string {
    return '<div class="nsfw-settings-section">' +
        buildSectionTitleHtml('fa-solid fa-toggle-on', '启用插件') +
        '<label class="nsfw-checkbox-row" for="nsfw_switcher_enabled">' +
        '<input type="checkbox" id="nsfw_switcher_enabled" checked>' +
        '<span>启用NSFW检测</span>' +
        '</label></div>';
}

/** 轻量化检测模型配置 */
export function buildDetectionModelSectionHtml(): string {
    return '<div class="nsfw-settings-section">' +
        buildSectionTitleHtml('fa-solid fa-microscope', '轻量化检测模型（判断NSFW）') +
        buildInputFieldHtml('nsfw_switcher_api_url', 'API地址', 'text', 'https://api.example.com/v1/chat/completions', true) +
        buildInputFieldHtml('nsfw_switcher_api_key', 'API密钥', 'password', 'sk-... (可选)', false) +
        buildInputFieldHtml('nsfw_switcher_model_name', '模型名称', 'text', 'nsfw-detector', false) +
        '</div>';
}

/** 切换目标模型配置 */
export function buildTargetModelSectionHtml(): string {
    return '<div class="nsfw-settings-section">' +
        buildSectionTitleHtml('fa-solid fa-arrow-right-arrow-left', '切换目标模型（NSFW场景使用）') +
        buildInputFieldHtml('nsfw_switcher_model_a', '目标模型名称', 'text', 'gpt-4', true) +
        buildInputFieldHtml('nsfw_switcher_model_a_api_url', '目标模型API地址', 'text', 'https://api.example.com/v1/chat/completions', true) +
        buildInputFieldHtml('nsfw_switcher_model_a_api_key', '目标模型API密钥', 'password', 'sk-... (可选)', false) +
        '</div>';
}

/** 选项设置 */
export function buildOptionsSectionHtml(): string {
    return '<div class="nsfw-settings-section">' +
        buildCheckboxFieldHtml('nsfw_switcher_show_notification', '显示切换通知', true) +
        buildCheckboxFieldHtml('nsfw_switcher_debug_mode', '调试模式（显示详细日志）', false) +
        '<div class="nsfw-field-group">' +
        '<label class="nsfw-field-label" for="nsfw_switcher_debug_level">日志级别</label>' +
        '<select id="nsfw_switcher_debug_level" class="nsfw-select">' +
        '<option value="debug">Debug（详细调试）</option>' +
        '<option value="info" selected>Info（一般信息）</option>' +
        '<option value="warn">Warn（警告）</option>' +
        '<option value="error">Error（仅错误）</option>' +
        '</select></div></div>';
}

/** 高级设置 */
export function buildAdvancedSectionHtml(): string {
    return '<div class="nsfw-settings-section">' +
        '<div class="nsfw-section-title"><i class="fa-solid fa-gear"></i>高级设置</div>' +
        '<div class="nsfw-field-group">' +
        '<label class="nsfw-field-label" for="nsfw_switcher_api_timeout">API 超时时间（秒）</label>' +
        '<input type="number" id="nsfw_switcher_api_timeout" class="nsfw-input" min="10" max="300" value="60">' +
        '<small style="color:var(--SmartThemeEmColor);opacity:0.7;">目标 API 的最大等待时间，thinking 模型建议 60-120 秒</small>' +
        '</div>' +
        '<div class="nsfw-field-group">' +
        '<label class="nsfw-field-label" for="nsfw_switcher_api_retries">失败重试次数</label>' +
        '<input type="number" id="nsfw_switcher_api_retries" class="nsfw-input" min="0" max="5" value="1">' +
        '<small style="color:var(--SmartThemeEmColor);opacity:0.7;">超时/网络错误时自动重试次数（0 = 不重试）</small>' +
        '</div>' +
        '<div class="nsfw-field-group">' +
        '<label class="nsfw-field-label" for="nsfw_switcher_log_entries">日志条数上限</label>' +
        '<input type="number" id="nsfw_switcher_log_entries" class="nsfw-input" min="50" max="1000" value="200">' +
        '</div>' +
        '<div class="nsfw-field-group">' +
        '<label class="nsfw-field-label" for="nsfw_switcher_safety_timeout">安全超时（秒）</label>' +
        '<input type="number" id="nsfw_switcher_safety_timeout" class="nsfw-input" min="10" max="300" value="30">' +
        '<small style="color:var(--SmartThemeEmColor);opacity:0.7;">预设覆盖的最大保持时间，超时自动恢复</small>' +
        '</div>' +
        '</div>';
}

/** 预设管理区域 */
export function buildPresetSectionHtml(): string {
    return '<div class="nsfw-preset-area">' +
        '<div class="nsfw-preset-header" data-toggle="preset">' +
        '<div class="nsfw-section-title">' +
        '<i class="fa-solid fa-file-import"></i>NSFW 预设</div>' +
        '<div class="nsfw-preset-header-right">' +
        '<div class="nsfw-preset-actions">' +
        '<div id="nsfw_preset_import_btn" class="menu_button menu_button_icon" title="导入预设"><i class="fa-solid fa-file-import"></i></div>' +
        '<div id="nsfw_preset_export_btn" class="menu_button menu_button_icon" title="导出预设"><i class="fa-solid fa-file-export"></i></div>' +
        '<div id="nsfw_preset_delete_btn" class="menu_button menu_button_icon" title="删除预设"><i class="fa-solid fa-trash"></i></div>' +
        '</div>' +
        '<i class="fa-solid fa-chevron-down nsfw-collapse-icon"></i>' +
        '</div></div>' +
        '<div class="nsfw-preset-content" style="display:none;">' +
        '<div class="nsfw-preset-selector-row">' +
        '<select id="nsfw_preset_selector" class="nsfw-select"></select>' +
        '<div id="nsfw_preset_save_btn" class="menu_button menu_button_icon" title="保存当前预设"><i class="fa-solid fa-save"></i></div>' +
        '<div id="nsfw_preset_rename_btn" class="menu_button menu_button_icon" title="重命名预设"><i class="fa-solid fa-pen"></i></div>' +
        '<div id="nsfw_preset_new_btn" class="menu_button menu_button_icon" title="新建预设"><i class="fa-solid fa-plus"></i></div>' +
        '</div>' +
        '<div class="nsfw-preset-status" id="nsfw_switcher_preset_status">未导入预设</div>' +
        '</div></div>';
}

/** 操作按钮区域 */
export function buildActionButtonsHtml(): string {
    return '<div class="nsfw-button-row">' +
        '<button id="nsfw_switcher_test_btn" class="nsfw-btn nsfw-btn-primary">' +
        '<i class="fa-solid fa-play"></i> 测试API</button>' +
        '<button id="nsfw_switcher_restore_btn" class="nsfw-btn nsfw-btn-secondary">' +
        '<i class="fa-solid fa-rotate-left"></i> 恢复原模型</button>' +
        '</div>';
}

/** 运行日志区域 */
export function buildLogsSectionHtml(): string {
    return '<div class="nsfw-log-section">' +
        '<div class="nsfw-log-header" data-toggle="logs">' +
        '<div class="nsfw-section-title">' +
        '<i class="fa-solid fa-scroll"></i>运行日志</div>' +
        '<div class="nsfw-log-header-right">' +
        '<div class="nsfw-log-toolbar">' +
        '<select id="nsfw_switcher_log_level_filter" class="nsfw-select">' +
        '<option value="debug">全部</option>' +
        '<option value="info">Info+</option>' +
        '<option value="warn">Warn+</option>' +
        '<option value="error">仅Error</option>' +
        '</select>' +
        '<button id="nsfw_switcher_clear_logs_btn" class="nsfw-log-btn">' +
        '<i class="fa-solid fa-trash"></i> 清空</button>' +
        '</div>' +
        '<i class="fa-solid fa-chevron-down nsfw-collapse-icon"></i>' +
        '</div></div>' +
        '<div class="nsfw-log-content" style="display:none;">' +
        '<div class="nsfw-log-viewer" id="nsfw_switcher_logs">' +
        '<div class="nsfw-log-empty">暂无日志</div>' +
        '</div></div></div>';
}

/** 组装完整设置面板 HTML */
export function createSettingsHtml(): string {
    return '<div class="inline-drawer">' +
        '<div class="inline-drawer-toggle inline-drawer-header">' +
        '<b><i class="fa-solid fa-shield-halved"></i>NSFW模型切换器</b>' +
        '<div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>' +
        '</div>' +
        '<div class="inline-drawer-content">' +
        buildStatusSectionHtml() +
        buildEnableSectionHtml() +
        buildDetectionModelSectionHtml() +
        buildTargetModelSectionHtml() +
        buildOptionsSectionHtml() +
        buildAdvancedSectionHtml() +
        buildPresetSectionHtml() +
        buildActionButtonsHtml() +
        buildLogsSectionHtml() +
        '</div></div>';
}
