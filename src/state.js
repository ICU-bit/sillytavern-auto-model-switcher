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
    constructor() {
        /** @type {string} 当前状态 */
        this._state = State.IDLE;
        /** @type {boolean} 是否已保存原模型信息 */
        this._hasOriginalSnapshot = false;
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

    /** @returns {boolean} 原始模型快照是否已保存 */
    get hasOriginalSnapshot() { return this._hasOriginalSnapshot; }

    /**
     * 标记原始模型已保存
     */
    markOriginalSaved() {
        this._hasOriginalSnapshot = true;
    }

    /**
     * 检测到 NSFW → 标记待切换
     * @returns {boolean} 是否发生了状态转换
     */
    onNsfwDetected() {
        if (this._state === State.IDLE) {
            this._state = State.PENDING_SWITCH;
            return true;
        }
        // 如果已经在 SWITCHED 状态，保持切换状态
        return false;
    }

    /**
     * 检测到正常内容 → 如果需要恢复则标记
     * @returns {boolean} 是否标记了待恢复
     */
    onCleanDetected() {
        if (this._state === State.SWITCHED || this._state === State.PENDING_RESTORE) {
            this._state = State.PENDING_RESTORE;
            return true;
        }
        return false;
    }

    /**
     * 检测失败或未检测到 → 根据当前状态决定
     * @returns {boolean} 是否需要恢复
     */
    onDetectionFailed() {
        // 如果已切换但检测失败，保守地等待恢复
        if (this._state === State.SWITCHED) {
            this._state = State.PENDING_RESTORE;
            return true;
        }
        return false;
    }

    /**
     * 生成开始：如果待切换则切换到已切换
     * @returns {'switch'|'restore'|'none'} 需要执行的动作
     */
    onGenerationStarted() {
        if (this._state === State.PENDING_SWITCH) {
            this._state = State.SWITCHED;
            return 'switch';
        }
        if (this._state === State.PENDING_RESTORE) {
            this._state = State.IDLE;
            this._hasOriginalSnapshot = false;
            return 'restore';
        }
        return 'none';
    }

    /**
     * 手动恢复了模型 → 回到空闲
     */
    onManualRestore() {
        this._state = State.IDLE;
        this._hasOriginalSnapshot = false;
    }

    /**
     * 重置到空闲状态
     */
    reset() {
        this._state = State.IDLE;
        this._hasOriginalSnapshot = false;
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