import type {AgentState, ScreenState} from '../../agents/types.ts';

export type SessionStatus = {
	state: AgentState;
	screen: string | null;
	changedAt: number;
	since: number;
};

export type Observation = {
	dead: boolean;
	exitStatus: number | null;
	screenState: ScreenState | null;
	screen: string | null;
	now: number;
	seen: boolean;
};

// adapter 認不出畫面時，若畫面在 2 秒內有變動仍視為工作中
export const CHANGE_WINDOW_MS = 2000;
export const STALL_MS = 180_000;

function decide(prev: SessionStatus | null, obs: Observation, changedAt: number): AgentState {
	if (obs.dead) return obs.exitStatus === 0 ? 'done' : 'error';
	const s = obs.screenState;
	if (s === 'error' || s === 'needs-approval' || s === 'running') return s;
	if (s === null && prev && obs.now - changedAt < CHANGE_WINDOW_MS) return 'running';
	// 剛跑完一輪且使用者還沒切過去看時，維持顯示為 done
	if (!obs.seen && (prev?.state === 'running' || prev?.state === 'done')) return 'done';
	return 'idle';
}

export function nextStatus(prev: SessionStatus | null, obs: Observation): SessionStatus {
	const changed = prev !== null && prev.screen !== obs.screen;
	const changedAt = prev === null || changed ? obs.now : prev.changedAt;
	const state = decide(prev, obs, changedAt);
	const since = prev && prev.state === state ? prev.since : obs.now;
	return {state, screen: obs.screen, changedAt, since};
}

export function isStalled(status: SessionStatus, now: number): boolean {
	return status.state === 'running' && now - status.changedAt > STALL_MS;
}

export const ALERT_STATES: readonly AgentState[] = ['needs-approval', 'error'];

// 重啟後第一次觀測（prev 為 null）不觸發進入警告通知
export function enteredAlert(prev: SessionStatus | null, next: SessionStatus): boolean {
	return prev !== null && prev.state !== next.state && ALERT_STATES.includes(next.state);
}
