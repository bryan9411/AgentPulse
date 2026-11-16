import type {AgentState} from '../agents/types.ts';
import {MIN_WINDOW} from '../config/layout.ts';
import {ALERT_STATES} from '../services/status/machine.ts';
import type {AddProjectDialog, AppState, Dialog, Project, Row, SessionSummary} from './types.ts';

export const projectKey = (path: string) => `p:${path}`;
export const sessionKey = (id: string) => `s:${id}`;

// 第一次畫面擷取尚未完成前，活著的工作階段暫視為 idle
export function sessionState(state: AppState, session: SessionSummary): AgentState {
	return state.statuses[session.id]?.state ?? (session.dead ? (session.exitStatus === 0 ? 'done' : 'error') : 'idle');
}

export function needsUser(state: AppState, session: SessionSummary): boolean {
	return ALERT_STATES.includes(sessionState(state, session));
}

export function filterActive(state: AppState): boolean {
	return state.attentionOnly || state.filter.text.trim() !== '';
}

export function projectBranch(state: AppState, projectPath: string): string | null {
	return state.projectBranches[projectPath] ?? null;
}

// 優先顯示即時偵測到的分支，讓外部切換分支時側欄與 HUD 同步切換
export function liveSessionBranch(state: AppState, session: SessionSummary): string {
	return state.details[session.id]?.git?.branch ?? state.projectBranches[session.project] ?? session.branch;
}

const contains = (text: string, needle: string) => text.toLowerCase().includes(needle);

function sessionVisible(state: AppState, project: Project, session: SessionSummary): boolean {
	const needle = state.filter.text.trim().toLowerCase();
	const branch = liveSessionBranch(state, session);
	if (needle && !contains(project.name, needle) && !contains(branch, needle) && !contains(session.agent, needle)) {
		return false;
	}
	return !state.attentionOnly || needsUser(state, session);
}

export function visibleRows(state: AppState): Row[] {
	const rows: Row[] = [];
	const filtering = filterActive(state);
	const needle = state.filter.text.trim().toLowerCase();
	for (const project of state.projects) {
		const sessions = state.sessions.filter(s => s.project === project.path && sessionVisible(state, project, s));
		// 篩選時若專案本身沒有符合的工作階段，只有專案名稱符合關鍵字才保留該群組列
		if (filtering && sessions.length === 0 && (state.attentionOnly || !needle || !contains(project.name, needle))) continue;
		const expanded = !state.collapsed.includes(project.path);
		rows.push({
			kind: 'project',
			key: projectKey(project.path),
			project,
			branch: projectBranch(state, project.path),
			count: sessions.length,
			expanded,
		});
		if (!expanded) continue;
		for (const session of sessions) rows.push({kind: 'session', key: sessionKey(session.id), session});
	}
	return rows;
}

export function selectedIndex(state: AppState, rows = visibleRows(state)): number {
	return rows.findIndex(row => row.key === state.selected);
}

export function selectedRow(state: AppState): Row | null {
	const rows = visibleRows(state);
	return rows[selectedIndex(state, rows)] ?? null;
}

export function sessionCount(state: AppState): number {
	return state.sessions.length;
}

export function windowTooSmall(state: AppState): boolean {
	const w = state.window;
	return w !== null && (w.columns < MIN_WINDOW.columns || w.rows < MIN_WINDOW.rows);
}

// 同專案、同分支且同 AI 有多個工作階段時依建立時間排序編號，從第 2 個起顯示 "#2"
export function sessionSeq(state: AppState, session: SessionSummary): number {
	const targetBranch = liveSessionBranch(state, session);
	const twins = state.sessions
		.filter(s => s.project === session.project && liveSessionBranch(state, s) === targetBranch && s.agent === session.agent)
		.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
	return twins.length < 2 ? 0 : twins.findIndex(s => s.id === session.id) + 1;
}

export function agentLabel(state: AppState, session: SessionSummary): string {
	const seq = sessionSeq(state, session);
	return seq >= 2 ? `${session.agent} #${seq}` : session.agent;
}

export function selectedSession(state: AppState): SessionSummary | null {
	const row = selectedRow(state);
	return row?.kind === 'session' ? row.session : null;
}

// 畫面正顯示在右側且焦點也在 AI 窗格時，視為使用者已經看到該工作階段
export function isViewing(state: AppState, id: string): boolean {
	return state.focus === 'ai' && selectedSession(state)?.id === id;
}

export function isBlinking(state: AppState, id: string): boolean {
	return state.attention.includes(id) && !isViewing(state, id);
}

export type StatusCounts = Record<AgentState, number>;

export function statusCounts(state: AppState): StatusCounts {
	const counts: StatusCounts = {running: 0, 'needs-approval': 0, idle: 0, done: 0, error: 0};
	for (const session of state.sessions) counts[sessionState(state, session)]++;
	return counts;
}

export function selectedProjectPath(state: AppState): string | null {
	const row = selectedRow(state);
	if (!row) return null;
	return row.kind === 'project' ? row.project.path : row.session.project;
}

export function acceptsText(dialog: Dialog): dialog is AddProjectDialog {
	return dialog.kind === 'add-project';
}
