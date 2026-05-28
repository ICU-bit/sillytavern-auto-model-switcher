import { addStateTransitionLog } from './logger.js';
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
 */

/** 状态常量 */
var State = Object.freeze({
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
    constructor() {
        /** @type {string} 当前状态 */
        this._state = State.IDLE;
    }

    /** @returns {string} 当前状态 */
    get state() { return this._state; }

    /** @returns {boolean} 当前是否处于「已切换」相关状态 */
    get isSwitchedOrPending() {
        return this._state === State.SWITCHED
            || this._state === State.PENDING_RESTORE;
    }

    /** @returns {boolean} 当前是否正在使用切换后的模型 */
    get isUsingSwitchedModel() {
        return this._state === State.SWITCHED;
    }

    /** @returns {boolean} 是否有待处理的动作 */
    get hasPendingAction() {
        return this._state === State.PENDING_SWITCH
            || this._state === State.PENDING_RESTORE;
    }

    /** @returns {boolean} 是否有待切换动作 */
    get shouldSwitch() {
        return this._state === State.PENDING_SWITCH;
    }

    /** @returns {boolean} 是否有待恢复动作 */
    get shouldRestore() {
        return this._state === State.PENDING_RESTORE;
    }

    /**
     * 只读检查：当前状态需要生成时执行什么动作
     * @returns {'switch'|'restore'|'none'}
     */
    getPendingAction() {
        if (this._state === State.PENDING_SWITCH) return 'switch';
        if (this._state === State.PENDING_RESTORE) return 'restore';
        return 'none';
    }

    /**
     * 检测到 NSFW → 标记待切换
     * @returns {boolean} 是否发生了状态转换
     */
    onNsfwDetected() {
        if (this._state === State.IDLE) {
            const oldState = this._state;
            this._state = State.PENDING_SWITCH;
            addStateTransitionLog(oldState, this._state, '检测到NSFW内容');
            return true;
        }
        if (this._state === State.PENDING_RESTORE) {
            const oldState = this._state;
            this._state = State.SWITCHED;
            addStateTransitionLog(oldState, this._state, '恢复期间再次检测到NSFW，取消恢复');
            return true;
        }
        // 已切换状态或待切换状态：保持不变
        return false;
    }

    /**
     * 检测到正常内容 → 如果需要恢复则标记
     * @returns {boolean} 是否标记了待恢复
     */
    onCleanDetected() {
        if (this._state === State.SWITCHED || this._state === State.PENDING_RESTORE) {
            const oldState = this._state;
            this._state = State.PENDING_RESTORE;
            addStateTransitionLog(oldState, this._state, '检测到正常内容，准备恢复');
            return true;
        }
        if (this._state === State.PENDING_SWITCH) {
            const oldState = this._state;
            this._state = State.IDLE;
            addStateTransitionLog(oldState, this._state, '切换期间检测到正常内容，取消切换');
            return true;
        }
        return false;
    }

    /**
     * 检测失败或未检测到 → 根据当前状态决定
     * @returns {boolean} 是否需要恢复
     */
    onDetectionFailed() {
        if (this._state === State.SWITCHED) {
            const oldState = this._state;
            this._state = State.PENDING_RESTORE;
            addStateTransitionLog(oldState, this._state, '检测失败，准备恢复原模型');
            return true;
        }
        return false;
    }

    /**
     * 切换操作成功执行后确认转换
     * @returns {boolean}
     */
    onSwitchApplied() {
        if (this._state === State.PENDING_SWITCH) {
            const oldState = this._state;
            this._state = State.SWITCHED;
            addStateTransitionLog(oldState, this._state, '切换操作已执行');
            return true;
        }
        return false;
    }

    /**
     * 恢复操作成功执行后确认转换
     * @returns {boolean}
     */
    onRestoreApplied() {
        if (this._state === State.PENDING_RESTORE) {
            const oldState = this._state;
            this._state = State.IDLE;
            addStateTransitionLog(oldState, this._state, '恢复操作已执行');
            return true;
        }
        return false;
    }

    /**
     * 操作失败时回退到空闲状态
     */
    onOperationAborted() {
        if (this._state === State.PENDING_SWITCH || this._state === State.PENDING_RESTORE) {
            const oldState = this._state;
            this._state = State.IDLE;
            addStateTransitionLog(oldState, this._state, '操作失败，回退到空闲');
        }
    }

    /**
     * 手动恢复了模型 → 回到空闲
     */
    onManualRestore() {
        const oldState = this._state;
        this._state = State.IDLE;
        addStateTransitionLog(oldState, this._state, '手动恢复');
    }

    /**
     * 获取状态描述（供日志显示）
     * @returns {string}
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
 * @returns {ModelStateMachine}
 */
export function createStateMachine() {
    return new ModelStateMachine();
}