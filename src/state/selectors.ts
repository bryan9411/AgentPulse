import {MIN_WINDOW} from '../config/layout.ts';
import type {AppState, Row, SessionSummary} from './types.ts';

export const projectKey = (path: string) => `p:${path}`;
export const sessionKey = (id: string) => `s:${id}`;

export function visibleRows(state: AppState): Row[] {
	const rows: Row[] = [];
	for (const project of state.projects) {
		const sessions = state.sessions.filter(s => s.project === project.path);
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
