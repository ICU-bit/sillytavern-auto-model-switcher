// SPDX-License-Identifier: AGPL-3.0-only
/**
 * NSFW 模型切换器 - 状态机模块
 *
 * 管理插件的运行状态，替代原来的 isTemporarySwitch 布尔值。
 *
 * 状态流转：
 *   IDLE ──(检测到NSFW)──→ PENDING_SWITCH
 *   PENDING_SWITCH ──(生成开始已切换)──→ SWITCHED
 *   SWITCHED ──(检测到正常内容)──→ PENDING_RESTORE
 *   PENDING_RESTORE ──(生成开始已恢复)──→ IDLE
 *   (任何状态) ──(手动恢复)──→ IDLE
 *
 * Phase 4 Batch B (Step 1):
 *   状态机引入 onTransition hook, 允许 SwitcherCoordinator 订阅状态变更,
 *   自动驱动 fetch 拦截/Proxy 激活的 enable/disable。
 *   所有内部状态变更现在统一通过 private transition() 调用, 保证所有路径
 *   都会触发 hook。
 */
import { addLog } from './logger.js';
/** 状态常量 */
export const State = Object.freeze({
    /** 空闲状态，无待处理动作 */
    IDLE: 'idle',
    /** 待切换：下一次生成时切换到目标模型 */
    PENDING_SWITCH: 'pending_switch',
    /** 已切换：当前正在使用目标模型 */
    SWITCHED: 'switched',
    /** 待恢复：下一次生成时恢复原模型 */
    PENDING_RESTORE: 'pending_restore',
});
export class ModelStateMachine {
    /** 当前状态 */
    _state = State.IDLE;
    /** transition 订阅者列表 */
    _listeners = [];
    /** 当前状态 */
    get state() { return this._state; }
    /**
     * 字面量类型 getter (Oracle 建议: 避免暴露 string)
     * 返回与 State 常量等价的字面量联合, 调用方可安全 switch。
     */
    getStatus() { return this._state; }
    /** 当前是否处于「已切换」相关状态 */
    get isSwitchedOrPending() {
        return this._state === State.SWITCHED
            || this._state === State.PENDING_RESTORE;
    }
    /** 当前是否正在使用切换后的模型 */
    get isUsingSwitchedModel() {
        return this._state === State.SWITCHED;
    }
    /** 是否有待切换动作 */
    get shouldSwitch() {
        return this._state === State.PENDING_SWITCH;
    }
    /** 是否有待恢复动作 */
    get shouldRestore() {
        return this._state === State.PENDING_RESTORE;
    }
    /**
     * 注册状态转换订阅者
     *
     * 订阅者在每次成功的状态转换后被同步调用 (无状态变化时不触发)。
     * Hook 内抛错会被 catch 并降级 (Oracle 建议: 避免污染 FSM)。
     *
     * @returns 取消订阅的函数
     */
    onTransition(listener) {
        this._listeners.push(listener);
        return () => {
            const idx = this._listeners.indexOf(listener);
            if (idx !== -1)
                this._listeners.splice(idx, 1);
        };
    }
    /**
     * 统一的状态转换入口 (内部使用)
     *
     * - 记录日志
     * - 同步通知所有订阅者
     * - 订阅者抛错时 try/catch + console.error, 不影响 FSM 自身
     */
    transition(next, reason) {
        const from = this._state;
        if (from === next)
            return;
        this._state = next;
        addLog(`状态转换: ${from} → ${next} (${reason})`, 'info', 'debug');
        // 通知订阅者
        const ctx = { from, to: next, reason };
        for (let i = 0; i < this._listeners.length; i++) {
            try {
                this._listeners[i](ctx);
            }
            catch (e) {
                const msg = e instanceof Error ? e.stack || e.message : String(e);
                console.error('[NSFW模型切换器] onTransition listener threw:', msg);
            }
        }
    }
    /**
     * 只读检查：当前状态需要生成时执行什么动作
     */
    getPendingAction() {
        if (this._state === State.PENDING_SWITCH)
            return 'switch';
        if (this._state === State.PENDING_RESTORE)
            return 'restore';
        return 'none';
    }
    /**
     * 检测到 NSFW → 标记待切换
     * @returns 是否发生了状态转换
     */
    onNsfwDetected() {
        if (this._state === State.IDLE) {
            this.transition(State.PENDING_SWITCH, '检测到NSFW内容');
            return true;
        }
        if (this._state === State.PENDING_RESTORE) {
            this.transition(State.SWITCHED, '恢复期间再次检测到NSFW，取消恢复');
            return true;
        }
        // 已切换状态或待切换状态：保持不变
        return false;
    }
    /**
     * 检测到正常内容 → 如果需要恢复则标记
     * @returns 是否标记了待恢复
     */
    onCleanDetected() {
        if (this._state === State.SWITCHED || this._state === State.PENDING_RESTORE) {
            // PENDING_RESTORE 是 no-op (相同状态, transition 内部短路)
            this.transition(State.PENDING_RESTORE, '检测到正常内容，准备恢复');
            return true;
        }
        if (this._state === State.PENDING_SWITCH) {
            this.transition(State.IDLE, '切换期间检测到正常内容，取消切换');
            return true;
        }
        return false;
    }
    /**
     * 检测失败或未检测到 → 根据当前状态决定
     * @returns 是否需要恢复
     */
    onDetectionFailed() {
        if (this._state === State.SWITCHED) {
            this.transition(State.PENDING_RESTORE, '检测失败，准备恢复原模型');
            return true;
        }
        return false;
    }
    /**
     * 切换操作成功执行后确认转换
     */
    onSwitchApplied() {
        if (this._state === State.PENDING_SWITCH) {
            this.transition(State.SWITCHED, '切换操作已执行');
            return true;
        }
        return false;
    }
    /**
     * 恢复操作成功执行后确认转换
     */
    onRestoreApplied() {
        if (this._state === State.PENDING_RESTORE) {
            this.transition(State.IDLE, '恢复操作已执行');
            return true;
        }
        return false;
    }
    /**
     * 操作失败时回退到空闲状态
     *
     * 为 SwitcherCoordinator 预留: safety_timeout / plugin_off 等异常路径
     * 由协调器主动调用以保持状态机一致 (Oracle 建议)。
     */
    onOperationAborted() {
        if (this._state === State.PENDING_SWITCH || this._state === State.PENDING_RESTORE) {
            this.transition(State.IDLE, '操作失败，回退到空闲');
        }
    }
    /**
     * 手动恢复了模型 → 回到空闲
     */
    onManualRestore() {
        // 即使当前已 IDLE 也走 transition (内部短路), 保证日志一致
        if (this._state !== State.IDLE) {
            this.transition(State.IDLE, '手动恢复');
        }
    }
    /**
     * 获取状态描述（供日志显示）
     */
    getStateDescription() {
        const labels = {
            [State.IDLE]: '空闲',
            [State.PENDING_SWITCH]: '待切换',
            [State.SWITCHED]: '已切换(NSFW模型)',
            [State.PENDING_RESTORE]: '待恢复',
        };
        return labels[this._state] || this._state;
    }
}
/**
 * 创建并返回一个单例状态机
 */
export function createStateMachine() {
    return new ModelStateMachine();
}
//# sourceMappingURL=state.js.map