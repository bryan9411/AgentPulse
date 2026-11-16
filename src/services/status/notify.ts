import type {AgentState} from '../../agents/types.ts';
import {DEFAULT_LANG, strings, type Lang} from '../../i18n/strings.ts';

export const NOTIFY_DEDUPE_MS = 30_000;

export type NotifyLog = Map<string, number>;

export type NotifyCheck = {
	id: string;
	state: AgentState;
	now: number;
	viewing: boolean;
	enabled: boolean;
};

// 相同工作階段與狀態在 30 秒內只通知一次；使用者正在看該格時不通知
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
	lang: Lang = DEFAULT_LANG,
): {title: string; body: string} {
	const t = strings(lang).notify;
	const what = state === 'error' ? t.error : t.approval;
	return {title: `AgentPulse · ${projectName}`, body: `${session.branch} · ${session.agent} ${what}`};
}

export const RESUME_COOLDOWN_MS = 3000;

// 每個工作階段每 3 秒最多送一次 SIGCONT，避免畫面誤判時每秒觸發重畫
export function resumeAllowed(lastSent: Map<string, number>, id: string, now: number): boolean {
	const last = lastSent.get(id);
	if (last !== undefined && now - last < RESUME_COOLDOWN_MS) return false;
	lastSent.set(id, now);
	return true;
}
