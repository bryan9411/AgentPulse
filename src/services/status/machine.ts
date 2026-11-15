import type {AgentState, ScreenState} from '../../agents/types.ts';

// SPEC 5.3. One record per session, rebuilt every second from a fresh
// capture plus the previous record.
export type SessionStatus = {
	state: AgentState;
	// Hash of the last captured screen; null for a dead pane.
	screen: string | null;
	// When the screen last changed (ms).
	changedAt: number;
	// When `state` last changed (ms).
	since: number;
};

export type Observation = {
	dead: boolean;
	exitStatus: number | null;
	// What the adapter made of the screen (ignored for a dead pane).
	screenState: ScreenState | null;
	screen: string | null;
	now: number;
	// The session is on screen in the AI pane and the keyboard is there.
	seen: boolean;
};

// An unrecognised screen that changed this recently counts as busy.
export const CHANGE_WINDOW_MS = 2000;
export const STALL_MS = 180_000;

function decide(prev: SessionStatus | null, obs: Observation, changedAt: number): AgentState {
	if (obs.dead) return obs.exitStatus === 0 ? 'done' : 'error';
	const s = obs.screenState;
	if (s === 'error' || s === 'needs-approval' || s === 'running') return s;
	if (s === null && prev && obs.now - changedAt < CHANGE_WINDOW_MS) return 'running';
	// A finished turn stays "done" until the user has looked at it.
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

// The HUD shows "stalled?" only for a running session whose screen froze.
export function isStalled(status: SessionStatus, now: number): boolean {
	return status.state === 'running' && now - status.changedAt > STALL_MS;
}

export const ALERT_STATES: readonly AgentState[] = ['needs-approval', 'error'];

// Entering one of these is what notifications and the blinking glyph are
// about. The first observation after a restart is not an entry.
export function enteredAlert(prev: SessionStatus | null, next: SessionStatus): boolean {
	return prev !== null && prev.state !== next.state && ALERT_STATES.includes(next.state);
}
