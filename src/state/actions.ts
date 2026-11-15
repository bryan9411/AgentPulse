import {basename} from 'node:path';
import {DEFAULT_CONFIG, type Config} from '../config/config.ts';
import {projectKey, selectedIndex, visibleRows} from './selectors.ts';
import type {AppState, Project} from './types.ts';

export function initialState(config: Config = DEFAULT_CONFIG): AppState {
	return withSelection({
		config,
		projects: toProjects(config.projects),
		sessions: [],
		collapsed: [],
		selected: null,
		dialog: null,
		focus: 'list',
		zoomed: false,
		window: null,
		notice: null,
	});
}

function toProjects(paths: readonly string[]): Project[] {
	return paths.map(path => ({path, name: basename(path) || path}));
}

// Keep the cursor on a real row after the list changes underneath it.
function withSelection(state: AppState): AppState {
	const rows = visibleRows(state);
	if (rows.some(row => row.key === state.selected)) return state;
	return {...state, selected: rows[0]?.key ?? null};
}

export function setConfig(state: AppState, config: Config): AppState {
	return withSelection({...state, config, projects: toProjects(config.projects)});
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
	if (!state.dialog || state.dialog.busy) return state;
	return {...state, dialog: {...state.dialog, value: edit(state.dialog.value), error: null}};
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
