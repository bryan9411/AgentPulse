import type {AgentState} from '../agents/types.ts';
import {MIN_WINDOW} from '../config/layout.ts';
import {ALERT_STATES} from '../services/status/machine.ts';
import type {AppState, Project, Row, SessionSummary} from './types.ts';

export const projectKey = (path: string) => `p:${path}`;
export const sessionKey = (id: string) => `s:${id}`;

// Before the first capture a live session counts as idle.
export function sessionState(state: AppState, session: SessionSummary): AgentState {
	return state.statuses[session.id]?.state ?? (session.dead ? (session.exitStatus === 0 ? 'done' : 'error') : 'idle');
}

export function needsUser(state: AppState, session: SessionSummary): boolean {
	return ALERT_STATES.includes(sessionState(state, session));
}

export function filterActive(state: AppState): boolean {
	return state.attentionOnly || state.filter.text.trim() !== '';
}

const contains = (text: string, needle: string) => text.toLowerCase().includes(needle);

// SPEC 5.8: the keyword matches the project name, branch or AI; `f` keeps
// only sessions waiting on the user. Both apply together.
function sessionVisible(state: AppState, project: Project, session: SessionSummary): boolean {
	const needle = state.filter.text.trim().toLowerCase();
	if (needle && !contains(project.name, needle) && !contains(session.branch, needle) && !contains(session.agent, needle)) {
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
		// While filtering, an empty group is only kept when its own name matched.
		if (filtering && sessions.length === 0 && (state.attentionOnly || !needle || !contains(project.name, needle))) continue;
		const expanded = !state.collapsed.includes(project.path);
		rows.push({kind: 'project', key: projectKey(project.path), project, count: sessions.length, expanded});
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

export function selectedSession(state: AppState): SessionSummary | null {
	const row = selectedRow(state);
	return row?.kind === 'session' ? row.session : null;
}

// The session is in the AI pane and the keyboard is there: the user sees it
// (SPEC 5.3 "seen", 5.4 no notification).
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
