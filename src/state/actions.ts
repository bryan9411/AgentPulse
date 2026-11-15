import {basename} from 'node:path';
import {DEFAULT_CONFIG, type Config} from '../config/config.ts';
import {projectKey, selectedIndex, selectedRow, sessionKey, visibleRows} from './selectors.ts';
import type {AgentOption, AppState, Project, SessionSummary} from './types.ts';

export function initialState(config: Config = DEFAULT_CONFIG): AppState {
	return withSelection({
		config,
		projects: toProjects(config.projects),
		sessions: [],
		sessionsLoaded: false,
		collapsed: [],
		selected: null,
		dialog: null,
		focus: 'list',
		zoomed: false,
		window: null,
		notice: null,
	});
}

// A session whose project was removed from config.json still has to be
// reachable, so its project is listed after the configured ones.
function toProjects(paths: readonly string[], sessions: readonly SessionSummary[] = []): Project[] {
	const all = [...paths];
	for (const session of sessions) if (!all.includes(session.project)) all.push(session.project);
	return all.map(path => ({path, name: basename(path) || path}));
}

// Keep the cursor on a real row after the list changes underneath it,
// staying near where it was rather than jumping to the top.
function withSelection(state: AppState, before?: AppState): AppState {
	const rows = visibleRows(state);
	if (rows.some(row => row.key === state.selected)) return state;
	const was = before ? selectedIndex(before) : -1;
	const index = Math.min(Math.max(0, was), rows.length - 1);
	return {...state, selected: rows[index]?.key ?? null};
}

export function setConfig(state: AppState, config: Config): AppState {
	return withSelection({...state, config, projects: toProjects(config.projects, state.sessions)}, state);
}

function sameSessions(a: readonly SessionSummary[], b: readonly SessionSummary[]): boolean {
	return a.length === b.length && a.every((s, i) => JSON.stringify(s) === JSON.stringify(b[i]));
}

export function setSessions(state: AppState, sessions: SessionSummary[]): AppState {
	if (state.sessionsLoaded && sameSessions(state.sessions, sessions)) return state;
	const next = withSelection(
		{...state, sessions, sessionsLoaded: true, projects: toProjects(state.config.projects, sessions)},
		state,
	);
	// After a restart, land on a running AI rather than on a group header.
	const first = sessions[0];
	if (!state.sessionsLoaded && first && selectedRow(next)?.kind !== 'session') {
		return selectSession(next, first.id);
	}
	return next;
}

export function selectSession(state: AppState, id: string): AppState {
	const session = state.sessions.find(s => s.id === id);
	if (!session) return state;
	const expanded = setCollapsed(state, session.project, false);
	return {...expanded, selected: sessionKey(id)};
}

export function moveSelection(state: AppState, delta: number): AppState {
	const rows = visibleRows(state);
	if (rows.length === 0) return state;
	const current = Math.max(0, selectedIndex(state, rows));
	const next = Math.min(rows.length - 1, Math.max(0, current + delta));
	return {...state, selected: rows[next]?.key ?? null};
}

export function selectProject(state: AppState, path: string): AppState {
	return withSelection({...state, selected: projectKey(path)});
}

function setCollapsed(state: AppState, path: string, collapsed: boolean): AppState {
	const has = state.collapsed.includes(path);
	if (has === collapsed) return state;
	return {
		...state,
		collapsed: collapsed ? [...state.collapsed, path] : state.collapsed.filter(p => p !== path),
	};
}

// On a session row, collapsing folds its group and moves the cursor up to it.
export function collapseSelected(state: AppState): AppState {
	const row = visibleRows(state)[selectedIndex(state)];
	if (!row) return state;
	const path = row.kind === 'project' ? row.project.path : row.session.project;
	return {...setCollapsed(state, path, true), selected: projectKey(path)};
}

export function expandSelected(state: AppState): AppState {
	const row = visibleRows(state)[selectedIndex(state)];
	if (row?.kind !== 'project') return state;
	return setCollapsed(state, row.project.path, false);
}

export function toggleSelected(state: AppState): AppState {
	const row = visibleRows(state)[selectedIndex(state)];
	if (row?.kind !== 'project') return state;
	return setCollapsed(state, row.project.path, row.expanded);
}

export function openAddProject(state: AppState): AppState {
	return {...state, dialog: {kind: 'add-project', value: '', error: null, busy: false}};
}

export function editDialog(state: AppState, edit: (value: string) => string): AppState {
	const d = state.dialog;
	if (d?.kind !== 'add-project' || d.busy) return state;
	return {...state, dialog: {...d, value: edit(d.value), error: null}};
}

// n works from a group row or any of its session rows.
export function openNewSession(state: AppState, options: AgentOption[]): AppState {
	const row = selectedRow(state);
	if (!row) return state;
	const project = row.kind === 'project' ? row.project.path : row.session.project;
	const index = Math.max(0, options.findIndex(o => o.installed));
	return {...state, dialog: {kind: 'new-session', project, options, index, error: null, busy: false}};
}

export function moveDialogChoice(state: AppState, delta: number): AppState {
	const d = state.dialog;
	if (d?.kind !== 'new-session' || d.busy || d.options.length === 0) return state;
	const index = Math.min(d.options.length - 1, Math.max(0, d.index + delta));
	return index === d.index ? state : {...state, dialog: {...d, index, error: null}};
}

export function openCloseSession(state: AppState): AppState {
	const row = selectedRow(state);
	if (row?.kind !== 'session') return state;
	return {...state, dialog: {kind: 'close-session', session: row.session, error: null, busy: false}};
}

export function setDialogBusy(state: AppState, busy: boolean): AppState {
	return state.dialog ? {...state, dialog: {...state.dialog, busy}} : state;
}

export function setDialogError(state: AppState, error: string): AppState {
	return state.dialog ? {...state, dialog: {...state.dialog, error, busy: false}} : state;
}

export function closeDialog(state: AppState): AppState {
	return state.dialog ? {...state, dialog: null} : state;
}

export function setWindow(state: AppState, columns: number, rows: number): AppState {
	const w = state.window;
	if (w && w.columns === columns && w.rows === rows) return state;
	return {...state, window: {columns, rows}};
}

export function setFocus(state: AppState, focus: AppState['focus'], zoomed: boolean): AppState {
	if (state.focus === focus && state.zoomed === zoomed) return state;
	return {...state, focus, zoomed};
}

export function setNotice(state: AppState, notice: string | null): AppState {
	return state.notice === notice ? state : {...state, notice};
}
