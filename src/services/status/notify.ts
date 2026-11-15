import type {AgentState} from '../../agents/types.ts';

export const NOTIFY_DEDUPE_MS = 30_000;

// Last notification time per `${session} ${state}`.
export type NotifyLog = Map<string, number>;

export type NotifyCheck = {
	id: string;
	state: AgentState;
	now: number;
	// On screen in the AI pane with the keyboard there: the user already sees it.
	viewing: boolean;
	enabled: boolean;
};

// SPEC 5.4. Call only for a session that just entered an alert state.
// Records the send in `log` when it returns true.
export function shouldNotify(log: NotifyLog, check: NotifyCheck): boolean {
	if (!check.enabled || check.viewing) return false;
	const key = `${check.id} ${check.state}`;
	const last = log.get(key);
	if (last !== undefined && check.now - last < NOTIFY_DEDUPE_MS) return false;
	log.set(key, check.now);
	return true;
}

export function notificationText(
	session: {branch: string; agent: string},
	projectName: string,
	state: AgentState,
): {title: string; body: string} {
	const what = state === 'error' ? 'stopped with an error' : 'needs your approval';
	return {title: `AgentPulse · ${projectName}`, body: `${session.branch} · ${session.agent} ${what}`};
}

export const RESUME_COOLDOWN_MS = 3000;

// SPEC 5.3: at most one SIGCONT per session every 3 s so a misdetected
// screen does not turn into a redraw every second.
export function resumeAllowed(lastSent: Map<string, number>, id: string, now: number): boolean {
	const last = lastSent.get(id);
	if (last !== undefined && now - last < RESUME_COOLDOWN_MS) return false;
	lastSent.set(id, now);
	return true;
}
