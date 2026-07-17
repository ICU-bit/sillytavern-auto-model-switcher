// SPDX-License-Identifier: AGPL-3.0-only

/**
 * NSFW 模型切换器 - SillyTavern 事件处理器
 *
 * Phase 4 Batch C Step C3: 从 index.ts 抽出
 *
 * 包含的事件处理器:
 * - onMessageRendered:  CHARACTER_MESSAGE_RENDERED → NSFW 检测
 * - onGenerationStarted: GENERATION_STARTED → 触发 switch / restore (状态驱动)
 * - onMessageSent:       MESSAGE_SENT → 调试日志
 * - onSettingsLoaded:    EXTENSION_SETTINGS_LOADED → 同步设置到 DOM
 *
 * 暴露 registerEventHandlers(deps) 工厂函数, 由 index.ts 注入运行时依赖
 * (state / coordinator / isReady 引用 + currentDetectionId 闭包状态)。
 */

import { eventSource, event_types } from '../../../../../script.js';
import { addLog, addDebugLog } from './logger.js';
import { loadSettings, applySettingsToDom, updateStatusIndicator, getActivePreset, getSettingsRoot, type PresetModuleEnabledMap } from './settings.js';
import { detectNSFW, getLastAiMessageText, getMessageTextById } from './detector.js';
import { isInterceptEnabled } from './direct-api.js';
import type { ModelStateMachine } from './state.js';
import type { SwitcherCoordinator } from './coordinator.js';
import { extractGenParams } from './preset-proxy.js';
/**
 * 事件处理器运行时依赖
 *
 * 由 index.ts 在 jQuery ready 阶段实例化, 注入到 registerEventHandlers。
 */
export interface EventHandlerDeps {
    /** 状态机实例 */
    state: ModelStateMachine;
    /** 协调器实例 */
    coordinator: SwitcherCoordinator;
    /** 获取 isReady (闭包形式, 因为 ready 状态会在 onSettingsLoaded 中由 false 变 true) */
    getIsReady: () => boolean;
    /** 设置 isReady (由 onSettingsLoaded 在加载完毕时调用) */
    setIsReady: (v: boolean) => void;
}

/**
 * 内部 detection 闭包状态 (swipe 取消用)
 *
 * 此模块内的局部状态, 不需要从 index.ts 注入。
 */
let currentDetectionId = 0;
let detectionAbortController: AbortController | null = null;

/**
 * 当前已注册的 listener 引用 (用于 unregisterEventHandlers / 幂等检查)
 *
 * H3 修复: 保存引用, 让重复 registerEventHandlers 调用 (热重载场景) 能先 off 再 on,
 * 避免同一 handler 多次注册 → detect 重复触发 → 状态错乱。
 */
interface RegisteredHandlers {
    onMessageRendered: (messageId: number, type?: string) => void | Promise<void>;
    onGenerationStarted: (type?: string, params?: unknown, dryRun?: boolean) => void | Promise<void>;
    onMessageSent: (messageId: number) => void | Promise<void>;
    onSettingsLoaded: () => void;
}
let registered: RegisteredHandlers | null = null;

/**
 * 注册所有 SillyTavern 事件监听 (幂等)
 *
 * 如果已注册, 先 unregister 再 register (热重载安全)。
 */
export function registerEventHandlers(deps: EventHandlerDeps): void {
    if (registered) {
        unregisterEventHandlers();
    }

    const handlers: RegisteredHandlers = {
        onMessageRendered: (messageId: number, type?: string) => onMessageRendered(messageId, type, deps),
        onGenerationStarted: (type?: string, params?: unknown, dryRun?: boolean) => onGenerationStarted(type, params, dryRun, deps),
        onMessageSent: (messageId: number) => onMessageSent(messageId, deps),
        onSettingsLoaded: () => onSettingsLoaded(deps),
    };

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, handlers.onMessageRendered);
    eventSource.on(event_types.GENERATION_STARTED, handlers.onGenerationStarted);
    eventSource.on(event_types.MESSAGE_SENT, handlers.onMessageSent);
    eventSource.on(event_types.EXTENSION_SETTINGS_LOADED, handlers.onSettingsLoaded);

    registered = handlers;
}

/**
 * 移除所有 SillyTavern 事件监听
 *
 * 安全幂等: 未注册时 no-op。
 */
export function unregisterEventHandlers(): void {
    if (!registered) return;
    eventSource.removeListener(event_types.CHARACTER_MESSAGE_RENDERED, registered.onMessageRendered);
    eventSource.removeListener(event_types.GENERATION_STARTED, registered.onGenerationStarted);
    eventSource.removeListener(event_types.MESSAGE_SENT, registered.onMessageSent);
    eventSource.removeListener(event_types.EXTENSION_SETTINGS_LOADED, registered.onSettingsLoaded);
    registered = null;
}

async function onMessageRendered(messageId: number, type: string | undefined, deps: EventHandlerDeps): Promise<void> {
    // H4 修复: 整个 handler 包 try/catch 防止异常逃逸到 eventSource 事件循环。
    // - AbortError 静默 (swipe 取消属于正常路径, 不应污染日志)
    // - 其他异常记录后吞掉, 保护下一次事件分发不被中断
    try {
        if (!deps.getIsReady()) return;
        const settings = loadSettings();
        if (!settings.enabled || type === 'user') return;
        if (detectionAbortController) detectionAbortController.abort();
        detectionAbortController = new AbortController();
        const thisDetectionId = ++currentDetectionId;
        const content = getMessageTextById(messageId) || getLastAiMessageText();
        if (!content) {
            if (settings.debugMode) addDebugLog('未找到 AI 消息内容');
            return;
        }
        if (settings.debugMode) addDebugLog('检测 AI 回复中... (长度: ' + content.length + ' 字)');
        const nsfwResult = await detectNSFW(content, detectionAbortController.signal);
        if (thisDetectionId !== currentDetectionId) return;

        if (nsfwResult === true) {
            // Phase 4 Batch B Step 7 (BUG-1 修复):
            // 检测到 NSFW 时, 先 prepare 让 coordinator 缓存最新预设。
            // - 若状态从 IDLE → PENDING_SWITCH: 数据等下次 generation 启用时用
            // - 若状态从 PENDING_RESTORE → SWITCHED: handleTransition 触发 tryEnable,
            //   用刚 prepare 的最新数据自动 re-enable (BUG-1 自动修复)
            const activePresetForNsfw = getActivePreset();
            if (activePresetForNsfw && activePresetForNsfw.data) {
                const root = getSettingsRoot();
                const mods: PresetModuleEnabledMap = root.nsfwPresetModules || {};
                const genParams = extractGenParams(activePresetForNsfw.data);
                deps.coordinator.prepare({
                    presetData: activePresetForNsfw.data,
                    mods,
                    genParams,
                });
            }
            if (deps.state.onNsfwDetected()) addLog('检测结果: NSFW → 下次生成将切换模型', 'warning');
        } else if (nsfwResult === false) {
            if (deps.state.onCleanDetected()) addLog('检测结果: 正常 → 下次生成将恢复原模型', 'info');
            else if (settings.debugMode) addDebugLog('检测结果: 正常，保持当前模型');
        } else {
            if (deps.state.onDetectionFailed()) addLog('检测失败 → 下次生成将恢复原模型', 'warning');
        }
        const $c = $('#nsfw_switcher_state_text');
        if ($c.length) $c.text('状态机: ' + deps.state.getStateDescription() + (isInterceptEnabled() ? ' [拦截中]' : ''));
    } catch (e) {
        // AbortError = swipe 取消导致 detectNSFW 中断, 正常路径, 静默
        if (e instanceof Error && e.name === 'AbortError') return;
        const msg = e instanceof Error ? (e.stack || e.message) : String(e);
        addLog('onMessageRendered 异常: ' + msg, 'error');
    }
}

async function onGenerationStarted(_type: string | undefined, _params: unknown, dryRun: boolean | undefined, deps: EventHandlerDeps): Promise<void> {
    if (!deps.getIsReady() || dryRun) return;
    const settings = loadSettings();
    if (!settings.enabled) return;
    const action = deps.state.getPendingAction();

    // Phase 4 Batch B Step 7: 接管 switch / restore 路径
    // 旧实现: 同步三连调用 activate/setIntercept/setPresetOverrides + state.onXxxApplied
    // 新实现: prepare(overrides) → state.onSwitchApplied 触发 transition →
    //          coordinator.handleTransition 自动 enable; restore 同理走 IDLE 自动 disable
    if (action === 'switch') {
        addLog('生成开始 → 启用拦截（上次回复为 NSFW）', 'info');
        const activePreset = getActivePreset();
        if (activePreset && activePreset.data) {
            const root = getSettingsRoot();
            const mods: PresetModuleEnabledMap = root.nsfwPresetModules || {};
            const genParams = extractGenParams(activePreset.data);
            // 先 prepare, 让 state 转换 hook 触发 enable 时能用
            deps.coordinator.prepare({
                presetData: activePreset.data,
                mods,
                genParams,
            });
        }
        // state 转换驱动副作用 (PENDING_SWITCH → SWITCHED → handleTransition → tryEnable)
        deps.state.onSwitchApplied();
    } else if (action === 'restore') {
        addLog('生成开始 → 禁用拦截（上次回复正常）', 'info');
        // state 转换驱动副作用 (PENDING_RESTORE → IDLE → handleTransition → applyDisable)
        deps.state.onRestoreApplied();
    } else {
        if (settings.debugMode) addDebugLog('生成开始 → 无需操作');
    }
    const $c = $('#nsfw_switcher_state_text');
    if ($c.length) $c.text('状态机: ' + deps.state.getStateDescription() + (isInterceptEnabled() ? ' [拦截中]' : ''));
}

async function onMessageSent(messageId: number, deps: EventHandlerDeps): Promise<void> {
    if (!deps.getIsReady()) return;
    const settings = loadSettings();
    if (!settings.enabled || !settings.debugMode) return;
    addLog('用户发送消息 messageId=' + messageId, 'info');
}

function onSettingsLoaded(deps: EventHandlerDeps): void {
    const settings = loadSettings();
    addLog('设置已加载', 'info');
    const $panel = $('#nsfw_switcher_state_text').closest('.inline-drawer');
    if ($panel.length) {
        applySettingsToDom(settings, $panel);
        updateStatusIndicator(settings, $panel);
        $panel.find('#nsfw_switcher_state_text').text('状态机: ' + deps.state.getStateDescription() + (isInterceptEnabled() ? ' [拦截中]' : ''));
    }
    deps.setIsReady(true);
    addLog('插件就绪，开始监听事件', 'success');
}

/**
 * 暴露 onSettingsLoaded 给 index.ts 在初始化时手动调用一次
 * (ST 的 EXTENSION_SETTINGS_LOADED 事件未必早于插件 ready, 需要手动触发)
 */
export function callOnSettingsLoadedNow(deps: EventHandlerDeps): void {
    onSettingsLoaded(deps);
}
