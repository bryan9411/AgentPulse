import {basename} from 'node:path';
import {DEFAULT_CONFIG, type Config} from '../config/config.ts';
import {ALERT_STATES, type SessionStatus} from '../services/status/machine.ts';
import {acceptsText, isViewing, projectKey, selectedIndex, selectedProjectPath, selectedRow, sessionKey, visibleRows} from './selectors.ts';
import type {AccountMark} from '../services/accounts.ts';
import type {Conflict} from '../services/conflictRadar.ts';
import type {SessionDetails} from '../services/details.ts';
import type {MergeCheck, MergeOutcome} from '../services/worktree.ts';
import type {Lang, Message} from '../i18n/strings.ts';
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
		flash: null,
		statuses: {},
		attention: [],
		blinkOn: true,
		filter: {text: '', editing: false},
		attentionOnly: false,
		details: {},
		accounts: [],
		conflicts: {},
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
	// Details of closed sessions are dropped with them.
	const details = Object.fromEntries(Object.entries(state.details).filter(([id]) => sessions.some(s => s.id === id)));
	const next = withSelection(
		{...state, sessions, details, sessionsLoaded: true, projects: toProjects(state.config.projects, sessions)},
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
	if (!d || d.busy || !acceptsText(d)) return state;
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
	if (!d || d.busy || (d.kind !== 'new-session' && d.kind !== 'worktree' && d.kind !== 'open-url')) return state;
	const count = d.kind === 'open-url' ? d.ports.length : d.options.length;
	if (count === 0) return state;
	const index = Math.min(count - 1, Math.max(0, d.index + delta));
	return index === d.index ? state : {...state, dialog: {...d, index, error: null}};
}

// w works from a group row or any of its session rows, like n.
export function openWorktree(state: AppState, options: AgentOption[]): AppState {
	const project = selectedProjectPath(state);
	if (!project) return state;
	const index = Math.max(0, options.findIndex(o => o.installed));
	return {...state, dialog: {kind: 'worktree', project, base: null, value: '', options, index, error: null, busy: false}};
}

export function setWorktreeBase(state: AppState, project: string, base: string): AppState {
	const d = state.dialog;
	if (d?.kind !== 'worktree' || d.project !== project || d.base === base) return state;
	return {...state, dialog: {...d, base}};
}

// Opens busy: the checks of SPEC 5.9 run before anything is offered.
export function openMerge(state: AppState): AppState {
	const row = selectedRow(state);
	if (row?.kind !== 'session') return state;
	return {
		...state,
		dialog: {kind: 'merge', session: row.session, plan: null, blocked: null, value: '', outcome: null, error: null, busy: true},
	};
}

export function setMergeCheck(state: AppState, id: string, check: MergeCheck): AppState {
	const d = state.dialog;
	if (d?.kind !== 'merge' || d.session.id !== id) return state;
	return {
		...state,
		dialog: check.ok ? {...d, plan: check.plan, blocked: null, busy: false} : {...d, plan: null, blocked: check.error, error: null, busy: false},
	};
}

export function setMergeOutcome(state: AppState, id: string, outcome: MergeOutcome): AppState {
	const d = state.dialog;
	if (d?.kind !== 'merge' || d.session.id !== id) return state;
	return {...state, dialog: {...d, outcome, error: null, busy: false}};
}

export function openUrlChoice(state: AppState, ports: number[]): AppState {
	return {...state, dialog: {kind: 'open-url', ports, index: 0, error: null, busy: false}};
}

export function openCloseSession(state: AppState): AppState {
	const row = selectedRow(state);
	if (row?.kind !== 'session') return state;
	return {...state, dialog: {kind: 'close-session', session: row.session, error: null, busy: false}};
}

export function openRemoveProject(state: AppState): AppState {
	const row = selectedRow(state);
	if (row?.kind !== 'project') return state;
	const sessionCount = state.sessions.filter(s => s.project === row.project.path).length;
	return {...state, dialog: {kind: 'remove-project', project: row.project, sessionCount, error: null, busy: false}};
}

export function setDialogBusy(state: AppState, busy: boolean): AppState {
	return state.dialog ? {...state, dialog: {...state.dialog, busy}} : state;
}

export function setDialogError(state: AppState, error: Message): AppState {
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

export function setNotice(state: AppState, notice: Message | null): AppState {
	const same = state.notice === notice || (state.notice !== null && notice !== null && state.notice.key === notice.key && state.notice.arg === notice.arg);
	return same ? state : {...state, notice};
}

export function setFlash(state: AppState, flash: Message | null): AppState {
	return state.flash === flash ? state : {...state, flash};
}

export function setLanguage(state: AppState, language: Lang): AppState {
	return state.config.language === language ? state : {...state, config: {...state.config, language}};
}

function sameStatus(a: SessionStatus | undefined, b: SessionStatus): boolean {
	return a !== undefined && a.state === b.state && a.screen === b.screen && a.changedAt === b.changedAt && a.since === b.since;
}

// `entered` lists sessions that just moved into needs-approval or error.
// A session leaves `attention` once it is out of those states or viewed.
export function applyStatuses(state: AppState, statuses: Record<string, SessionStatus>, entered: readonly string[]): AppState {
	const ids = Object.keys(statuses);
	const unchanged = ids.length === Object.keys(state.statuses).length && ids.every(id => sameStatus(state.statuses[id], statuses[id]!));
	const attention = [...new Set([...state.attention, ...entered])].filter(id => {
		const status = statuses[id];
		return status !== undefined && ALERT_STATES.includes(status.state) && !isViewing(state, id);
	});
	const sameAttention = attention.length === state.attention.length && attention.every((id, i) => state.attention[i] === id);
	if (unchanged && sameAttention) return state;
	const next = {...state, statuses: unchanged ? state.statuses : statuses, attention};
	// Under `f`, a session that stopped needing the user drops out of the list.
	return state.attentionOnly ? withSelection(next, state) : next;
}

export function setBlink(state: AppState, on: boolean): AppState {
	return state.blinkOn === on ? state : {...state, blinkOn: on};
}

export function startFilter(state: AppState): AppState {
	return {...state, filter: {...state.filter, editing: true}};
}

export function editFilter(state: AppState, edit: (value: string) => string): AppState {
	if (!state.filter.editing) return state;
	return withSelection({...state, filter: {text: edit(state.filter.text), editing: true}}, state);
}

// enter keeps the keyword and goes back to moving through the list.
export function endFilter(state: AppState): AppState {
	return state.filter.editing ? {...state, filter: {...state.filter, editing: false}} : state;
}

export function clearFilter(state: AppState): AppState {
	if (!state.filter.editing && state.filter.text === '') return state;
	return withSelection({...state, filter: {text: '', editing: false}}, state);
}

export function toggleAttentionOnly(state: AppState): AppState {
	return withSelection({...state, attentionOnly: !state.attentionOnly}, state);
}

// Pollers fill in one part at a time; an identical result changes nothing,
// so the HUD is not repainted for it.
export function setDetails(state: AppState, id: string, patch: Partial<SessionDetails>): AppState {
	if (!state.sessions.some(s => s.id === id)) return state;
	const before = state.details[id] ?? {};
	const after = {...before, ...patch};
	if (JSON.stringify(before) === JSON.stringify(after)) return state;
	return {...state, details: {...state.details, [id]: after}};
}

export function setAccounts(state: AppState, accounts: AccountMark[]): AppState {
	return JSON.stringify(state.accounts) === JSON.stringify(accounts) ? state : {...state, accounts};
}

export function setConflicts(state: AppState, conflicts: Record<string, Conflict[]>): AppState {
	return JSON.stringify(state.conflicts) === JSON.stringify(conflicts) ? state : {...state, conflicts};
}
