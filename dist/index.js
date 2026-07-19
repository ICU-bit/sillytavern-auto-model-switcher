console.log('NSFW_MODULE_LOADED');
import { saveSettingsDebounced } from '../../../../../script.js';
import { extension_settings } from '../../../../extensions.js';
import { addLog, getLogs, initLogs, setLogMaxEntries } from './logger.js';
import { EXTENSION_NAME, DEFAULT_SETTINGS, loadSettings, getSettingsRoot } from './settings.js';
import { createStateMachine } from './state.js';
import { createCoordinator } from './coordinator.js';
import { initFetchInterceptor, isInterceptEnabled, setOnRequestRedirected } from './direct-api.js';
import { initPresetOverrides } from './preset-proxy.js';
import { prefersReducedMotion, initAccordion } from './mobile.js';
import { createSettingsHtml } from './ui-builder.js';
import { setupLogRendering, bindSettingsListeners } from './ui-bindings.js';
import { registerEventHandlers, callOnSettingsLoadedNow } from './event-handlers.js';
console.log('ALL_IMPORTS_OK');
addLog('所有模块导入成功', 'info', 'debug');
// ===== 模块级状态 =====
let state;
let coordinator;
let isReady = false;
// ---------------------------------------------------------------------------
//  初始化入口
// ---------------------------------------------------------------------------
$(() => {
    console.log('JQUERY_READY');
    setupLogRendering();
    initLogs();
    addLog('jQuery 就绪', 'info', 'debug');
    // 首次初始化: seed 默认值
    {
        const extAsAny = extension_settings;
        extAsAny[EXTENSION_NAME] = { ...DEFAULT_SETTINGS, ...(extAsAny[EXTENSION_NAME] || {}) };
    }
    // Legacy 单预设 → 多预设迁移
    (function () {
        const settings = getSettingsRoot();
        if (settings.nsfwPresetData && Object.keys(settings.nsfwPresets || {}).length === 0) {
            const legacy = settings.nsfwPresetData;
            const name = legacy.name || legacy.display_name || '默认预设';
            settings.nsfwPresets = {};
            settings.nsfwPresets[name] = {
                data: settings.nsfwPresetData,
                modules: settings.nsfwPresetModules || {},
            };
            settings.activePresetName = name;
            saveSettingsDebounced();
        }
    })();
    // 同步日志上限到 logger 模块（避免循环依赖 settings.ts）
    setLogMaxEntries(getSettingsRoot().logMaxEntries || 200);
    state = createStateMachine();
    coordinator = createCoordinator(state);
    isReady = false;
    initPresetOverrides();
    initFetchInterceptor();
    setOnRequestRedirected(() => coordinator.onPayloadCaptured());
    coordinator.attach();
    const $panel = $('<div id="nsfw_switcher_panel">' + createSettingsHtml() + '</div>').appendTo('#extensions_settings');
    bindSettingsListeners($panel, { state, coordinator });
    // 移动端手风琴模式
    if (prefersReducedMotion()) {
        $panel.addClass('nsfw-reduced-motion');
    }
    initAccordion('#nsfw_switcher_panel');
    const eventDeps = {
        state,
        coordinator,
        getIsReady: () => isReady,
        setIsReady: (v) => { isReady = v; },
    };
    registerEventHandlers(eventDeps);
    if (getSettingsRoot())
        callOnSettingsLoadedNow(eventDeps);
    console.log('INIT_COMPLETE');
    addLog('初始化完成', 'success');
});
// =============================================================================
// 调试入口
// =============================================================================
window.__nsfwDebug = function () {
    const s = loadSettings();
    const logs = getLogs();
    console.log('======== NSFW 模型切换器 诊断信息 ========');
    console.log('插件已加载:', isReady);
    console.log('状态机:', state ? state.getStateDescription() : 'N/A');
    console.log('拦截器:', isInterceptEnabled() ? '启用' : '禁用');
    const presetName = s.nsfwPresetData ? (s.nsfwPresetData.name || '已导入') : '无';
    console.log('NSFW 预设:', presetName);
    console.log('最近日志 (' + logs.length + ' 条):');
    logs.slice(0, 20).forEach(function (log) {
        console.log('  [' + log.timestamp + '] [' + log.type + '] ' + log.message);
    });
    console.log('==========================================');
};
// =============================================================================
// 导出自 preset-modules.ts（Phase 4 Batch C Step C2）
// =============================================================================
// PresetModuleDef / PRESET_MODULES / renderPresetModulesHtml / buildDefaultEnabledModules
// 已迁移到 src/preset-modules.ts，避免 index.ts 与 ui-bindings.ts 循环依赖。
export { PRESET_MODULES, renderPresetModulesHtml, buildDefaultEnabledModules } from './preset-modules.js';
//# sourceMappingURL=index.js.map