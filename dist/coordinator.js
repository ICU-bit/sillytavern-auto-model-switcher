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
 * NSFW 模型切换器 - 状态协调器 (Phase 4 Batch B)
 *
 * 单一持有 fetch 拦截 + Proxy 覆盖 + presetOverrides 三层副作用的开关,
 * 通过订阅 state.onTransition 自动驱动副作用, 收敛原本散落在 6 条路径的不对称。
 *
 * 设计参考: Oracle 评估 bg_69f81a9e
 *
 * 核心契约:
 * - state 变到 SWITCHED  → 自动 enable (用 lastApplied 数据)
 * - state 变到 IDLE      → 自动 disable
 * - state 变到 PENDING_* → 不动副作用 (等待下次 generation 时由 state 转换驱动)
 * - 异常路径 (safety timeout / plugin off / fetch fallback) → 主动调 disable(reason)
 *
 * 协调器对外暴露的方法：
 * - prepare(overrides): 在 onNsfwDetected 之前调用, 把待应用的预设数据缓存
 *                       供 onTransition hook 触发 enable 时使用
 * - disable(reason):    主动关闭三层 (不修改 state, 用于异常路径)
 * - onPayloadCaptured(): Path A 替代 — ST 格式化完毕后只关 Proxy,
 *                       保留 fetch 拦截以应对同生成内的重试/多请求
 * - getRuntimeState():  暴露 discriminated union 状态供 UI/调试
 */
import { State } from './state.js';
import { activateOverrides, deactivateOverrides } from './preset-proxy.js';
import { setInterceptEnabled, setPresetOverrides } from './direct-api.js';
import { addLog, addDebugLog } from './logger.js';
// ===== Coordinator =====
export class SwitcherCoordinator {
    state;
    /** 当前运行时状态 */
    runtime = { kind: 'idle' };
    /**
     * 下次 enable 时使用的覆盖数据
     *
     * 由 index.ts 在调用 state.onNsfwDetected() 之前通过 prepare() 注入,
     * 这样状态转换 hook 触发 enable 时不需要外部再传数据。
     *
     * 注意: 这是 "pending" 数据, 与 runtime.applied 不同——
     * - lastPrepared 是 *将要* 应用的
     * - runtime.applied 是 *已经* 应用的
     */
    lastPrepared = null;
    /** state.onTransition 取消订阅函数 (供 dispose 用) */
    unsubscribe = null;
    constructor(state) {
        this.state = state;
    }
    /**
     * 订阅状态机转换事件, 启动自动驱动。
     * 应在插件初始化时调用一次。
     */
    attach() {
        if (this.unsubscribe)
            return; // 幂等
        this.unsubscribe = this.state.onTransition((ctx) => this.handleTransition(ctx));
        addDebugLog('SwitcherCoordinator attached to state machine');
    }
    /** 解除订阅 (供测试和热重载) */
    dispose() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }
    /**
     * 暴露运行时状态 (UI/调试)
     */
    getRuntimeState() {
        return this.runtime;
    }
    /**
     * 是否当前任何副作用激活中 (fetch 或 Proxy)
     */
    isActive() {
        return this.runtime.kind !== 'idle';
    }
    /**
     * 预备下次 enable 使用的数据 (由 index.ts 在 NSFW 检测时调用)
     *
     * 这避免了 state.onTransition hook 触发 enable 时需要外部传参,
     * 也意味着 BUG-1 (PENDING_RESTORE → SWITCHED 回退) 会自动复用最近一次
     * 准备好的预设。
     */
    prepare(overrides) {
        this.lastPrepared = overrides;
    }
    /**
     * 主动关闭三层副作用 (异常路径)
     *
     * - 不修改状态机 (除非 reason 暗示需要)
     * - 幂等: 已 idle 时是 no-op
     */
    disable(reason) {
        if (this.runtime.kind === 'idle')
            return;
        // 关闭三层 (顺序: fetch → Proxy → presetOverrides, 与 Path B 一致)
        this.applyDisable();
        addLog('协调器停用: ' + reason, 'info');
        // 根据 reason 决定是否要通知 state
        // - restore / manual: state 自己已经转换, 不重复通知
        // - safety_timeout / plugin_off: 异常路径, state 仍在 SWITCHED, 需要回到 IDLE
        // - fetch_fallback: 飞行中竞态, 不影响 state
        switch (reason) {
            case 'safety_timeout':
            case 'plugin_off':
                // 把 PENDING_* / SWITCHED 强制回到 IDLE
                this.state.onOperationAborted();
                // SWITCHED 状态不会被 onOperationAborted 处理, 单独走 manual restore
                if (this.state.getStatus() === State.SWITCHED) {
                    this.state.onManualRestore();
                }
                break;
            case 'fetch_fallback':
                // 不通知 state, 因为这是飞行中的兜底; 真正的状态变更由用户操作驱动
                break;
            case 'restore':
            case 'manual':
                // state 已经自己转换过了, 这里只是确认副作用关闭
                break;
        }
    }
    /**
     * Path A 替代: ST 已格式化完毕, 请求被接管, 关 Proxy 但保留 fetch
     *
     * 这是 disable() 的局部变体, 仅停 Proxy 防止后续读取污染,
     * fetch 拦截保持开启以应对同生成内的重试 / 多请求场景。
     *
     * Oracle 注: ST 的 swipe 会触发新 onGenerationStarted, 不复用同一次 fetch。
     * 但 streaming reconnect / function-call follow-up 会在同一次生成内再 fetch。
     */
    onPayloadCaptured() {
        if (this.runtime.kind !== 'switched')
            return;
        // 只关 Proxy, 不动 fetch
        deactivateOverrides();
        this.runtime = { kind: 'partial', applied: this.runtime.applied };
        addDebugLog('协调器: payload 已捕获, Proxy 已停用 (fetch 仍拦截)');
    }
    // ===== 内部 =====
    /**
     * 处理状态转换事件 (核心自动驱动逻辑)
     */
    handleTransition(ctx) {
        // 进入 SWITCHED: enable 副作用
        if (ctx.to === State.SWITCHED) {
            this.tryEnable();
            return;
        }
        // 进入 IDLE: disable 副作用 (但只有 restore 路径才走这里, 异常路径走 disable())
        if (ctx.to === State.IDLE) {
            // 检查是否有副作用需要关 (避免与 disable() 重复)
            if (this.runtime.kind !== 'idle') {
                this.applyDisable();
                addDebugLog('协调器: 因状态进入 IDLE 自动停用');
            }
            return;
        }
        // PENDING_SWITCH / PENDING_RESTORE: 不动副作用 (等下次生成 hook 推进)
    }
    /**
     * 尝试启用三层副作用
     */
    tryEnable() {
        // 如果 partial 状态, 升级回 switched (重新激活 Proxy)
        if (this.runtime.kind === 'partial') {
            const applied = this.runtime.applied;
            activateOverrides(applied.presetData, applied.mods);
            this.runtime = { kind: 'switched', applied };
            addDebugLog('协调器: 从 partial 升级回 switched (重新激活 Proxy)');
            return;
        }
        // 已 switched: 幂等 no-op
        if (this.runtime.kind === 'switched')
            return;
        // idle → switched: 需要 lastPrepared 数据
        if (!this.lastPrepared) {
            addLog('协调器: 状态进入 SWITCHED 但无预备数据, 跳过 enable (调用方应先调 prepare)', 'warning');
            return;
        }
        const applied = this.lastPrepared;
        try {
            activateOverrides(applied.presetData, applied.mods);
            setPresetOverrides(applied.genParams);
            setInterceptEnabled(true);
            this.runtime = { kind: 'switched', applied };
            addDebugLog('协调器: 自动启用 (fetch + Proxy + presetOverrides)');
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            addLog('协调器: enable 失败: ' + msg, 'error');
            // 回退 state
            this.state.onOperationAborted();
        }
    }
    /**
     * 实际关闭三层副作用 (无状态机交互)
     */
    applyDisable() {
        try {
            setInterceptEnabled(false);
            deactivateOverrides();
            setPresetOverrides(null);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            addLog('协调器: disable 期间副作用抛错: ' + msg, 'error');
        }
        this.runtime = { kind: 'idle' };
    }
}
/**
 * 创建并返回一个新的协调器实例 (单例由 index.ts 持有)
 */
export function createCoordinator(state) {
    return new SwitcherCoordinator(state);
}
//# sourceMappingURL=coordinator.js.map