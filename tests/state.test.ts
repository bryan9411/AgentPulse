import {describe, expect, test} from 'bun:test';
import {handleListKey, type ListKeyController} from '../src/app/useKeys.ts';
import {DEFAULT_CONFIG} from '../src/config/config.ts';
import * as A from '../src/state/actions.ts';
import {
	acceptsText,
	filterActive,
	isBlinking,
	isViewing,
	liveSessionBranch,
	projectBranch,
	projectKey,
	selectedRow,
	selectedSession,
	agentLabel,
	sessionKey,
	sessionSeq,
	sessionState,
	statusCounts,
	visibleRows,
	windowTooSmall,
} from '../src/state/selectors.ts';
import type {SessionStatus} from '../src/services/status/machine.ts';
import {width} from '../src/ui/text.ts';
import {listHints} from '../src/ui/KeyHints.tsx';
import type {AppState, SessionSummary} from '../src/state/types.ts';

const config = {...DEFAULT_CONFIG, projects: ['/w/alpha', '/w/beta']};
const session = (id: string, project: string, branch: string, agent = 'claude'): SessionSummary => ({
	id, project, cwd: project, branch, agent, dead: false, exitStatus: null, created: 0, agentSession: '',
});
const SESSIONS = [
	session('a1', '/w/alpha', 'main'),
	session('a2', '/w/alpha', 'feat/x', 'codex'),
	session('b1', '/w/beta', 'main'),
];
const withSessions = (s: AppState): AppState => ({...s, sessions: SESSIONS, sessionsLoaded: true});

describe('state', () => {
	test('initial selection is the first project', () => {
		const s = A.initialState(config);
		expect(s.selected).toBe(projectKey('/w/alpha'));
		expect(s.projects.map(p => p.name)).toEqual(['alpha', 'beta']);
	});

	test('rows list groups then their sessions', () => {
		const rows = visibleRows(withSessions(A.initialState(config)));
		expect(rows.map(r => r.key)).toEqual(['p:/w/alpha', 's:a1', 's:a2', 'p:/w/beta', 's:b1']);
		expect(rows[0]).toMatchObject({kind: 'project', count: 2, expanded: true});
	});

	test('moving clamps at both ends', () => {
		let s = withSessions(A.initialState(config));
		s = A.moveSelection(s, -1);
		expect(s.selected).toBe('p:/w/alpha');
		s = A.moveSelection(s, 3);
		expect(s.selected).toBe('p:/w/beta');
		s = A.moveSelection(s, 10);
		expect(s.selected).toBe('s:b1');
	});

	test('collapsing hides sessions; left on a session jumps to its group', () => {
		let s = withSessions(A.initialState(config));
		s = A.moveSelection(s, 2);
		expect(s.selected).toBe(sessionKey('a2'));
		s = A.collapseSelected(s);
		expect(s.selected).toBe(projectKey('/w/alpha'));
		expect(visibleRows(s).map(r => r.key)).toEqual(['p:/w/alpha', 'p:/w/beta', 's:b1']);
		s = A.moveSelection(s, 1);
		expect(s.selected).toBe('p:/w/beta');
		s = A.moveSelection(A.expandSelected(A.moveSelection(s, -1)), 1);
		expect(s.selected).toBe('s:a1');
	});

	test('enter toggles a group only on group rows', () => {
		let s = withSessions(A.initialState(config));
		s = A.toggleSelected(s);
		expect(s.collapsed).toEqual(['/w/alpha']);
		s = A.toggleSelected(s);
		expect(s.collapsed).toEqual([]);
		const onSession = A.moveSelection(s, 1);
		expect(A.toggleSelected(onSession)).toBe(onSession);
	});

	test('removing the selected project moves the cursor to a real row', () => {
		let s = A.selectProject(A.initialState(config), '/w/beta');
		s = A.setConfig(s, {...config, projects: ['/w/alpha']});
		expect(s.selected).toBe('p:/w/alpha');
		s = A.setConfig(s, {...config, projects: []});
		expect(s.selected).toBeNull();
		expect(selectedRow(s)).toBeNull();
		expect(A.moveSelection(s, 1)).toBe(s);
	});

	test('dialog editing clears the error and is frozen while busy', () => {
		let s = A.openAddProject(A.initialState(config));
		s = A.editDialog(s, v => v + '~/x');
		s = A.setDialogError(s, {key: 'folderNotFound'});
		s = A.editDialog(s, v => v + 'y');
		expect(s.dialog).toMatchObject({value: '~/xy', error: null});
		s = A.setDialogBusy(s, true);
		expect(A.editDialog(s, v => v + 'z')).toBe(s);
		expect(A.closeDialog(s).dialog).toBeNull();
	});

	test('window too small below 70x16', () => {
		const s = A.initialState(config);
		expect(windowTooSmall(s)).toBe(false);
		expect(windowTooSmall(A.setWindow(s, 69, 40))).toBe(true);
		expect(windowTooSmall(A.setWindow(s, 120, 15))).toBe(true);
		expect(windowTooSmall(A.setWindow(s, 70, 16))).toBe(false);
	});

	test('first session load lands on a session; later loads keep the cursor', () => {
		let s = A.setSessions(A.initialState(config), SESSIONS);
		expect(s.selected).toBe(sessionKey('a1'));
		s = A.selectProject(s, '/w/beta');
		expect(A.setSessions(s, [...SESSIONS])).toBe(s);
		expect(A.setSessions(s, SESSIONS.slice(0, 2)).selected).toBe('p:/w/beta');
	});

	test('a closed session moves the cursor to its neighbour, not the top', () => {
		let s = A.selectSession(A.setSessions(A.initialState(config), SESSIONS), 'a2');
		s = A.setSessions(s, [SESSIONS[0]!, SESSIONS[2]!]);
		expect(s.selected).toBe('p:/w/beta');
	});

	test('a session of an unregistered project still gets a group', () => {
		const s = A.setSessions(A.initialState(config), [session('z1', '/w/gone', 'main')]);
		expect(s.projects.map(p => p.path)).toEqual(['/w/alpha', '/w/beta', '/w/gone']);
		expect(selectedSession(s)?.id).toBe('z1');
	});

	test('selecting a session in a folded group unfolds it', () => {
		let s = A.collapseSelected(withSessions(A.initialState(config)));
		s = A.selectSession(s, 'a2');
		expect(s.collapsed).toEqual([]);
		expect(selectedSession(s)?.id).toBe('a2');
	});

	test('new-session dialog picks signed-in AI first (claude priority), then first installed, and clamps', () => {
		const unsignedFirst = [
			{id: 'claude', name: 'Claude Code', installed: true, signedIn: false},
			{id: 'codex', name: 'Codex CLI', installed: false, signedIn: null},
			{id: 'agy', name: 'Antigravity', installed: true, signedIn: true},
		];
		expect(A.defaultAgentIndex(unsignedFirst)).toBe(2);

		const options = [
			{id: 'claude', name: 'Claude Code', installed: false, signedIn: false},
			{id: 'codex', name: 'Codex CLI', installed: true, signedIn: null},
		];
		let s = A.openNewSession(A.moveSelection(withSessions(A.initialState(config)), 1), options);
		expect(s.dialog).toMatchObject({kind: 'new-session', project: '/w/alpha', index: 1});
		s = A.moveDialogChoice(s, 5);
		expect(s.dialog).toMatchObject({index: 1});
		s = A.moveDialogChoice(s, -1);
		expect(s.dialog).toMatchObject({index: 0});
		expect(A.editDialog(s, v => v + 'x')).toBe(s);
	});

	test('close dialog only opens on a session row', () => {
		const s = withSessions(A.initialState(config));
		expect(A.openCloseSession(s)).toBe(s);
		const onSession = A.openCloseSession(A.moveSelection(s, 1));
		expect(onSession.dialog).toMatchObject({kind: 'close-session', session: {id: 'a1'}});
	});

	test('remove project dialog only opens on a project row', () => {
		const s = withSessions(A.initialState(config));
		const onProject = A.openRemoveProject(s);
		expect(onProject.dialog).toMatchObject({kind: 'remove-project', project: {name: 'alpha'}, sessionCount: 2});
		const onSession = A.moveSelection(s, 1);
		expect(A.openRemoveProject(onSession)).toBe(onSession);
	});

	test('key hints follow focus, row kind and dialog', () => {
		expect(listHints({focus: 'ai', dialog: null, row: 'session'})).toEqual(['ctrl+q back']);
		expect(listHints({focus: 'list', dialog: null, row: 'session'}).join(' ')).toContain('enter type');
		expect(listHints({focus: 'list', dialog: null, row: 'session', isDead: true}).join(' ')).toContain('enter restart');
		expect(listHints({focus: 'list', dialog: null, row: 'session', isDead: true}, 'zh-TW').join(' ')).toContain('enter 重新啟動');
		expect(listHints({focus: 'list', dialog: null, row: 'project'}).join(' ')).toContain('fold');
		expect(listHints({focus: 'list', dialog: null, row: 'project', isEmptyProject: true}).join(' ')).toContain('enter / n');
		expect(listHints({focus: 'list', dialog: null, row: 'project', isEmptyProject: true}, 'zh-TW').join(' ')).toContain('enter / n');
		for (const filtered of [false, true]) {
			for (const lang of ['en', 'zh-TW'] as const) {
				expect(listHints({focus: 'list', dialog: null, row: 'session', filtered}, lang)).toHaveLength(6);
				expect(listHints({focus: 'list', dialog: null, row: 'session', isDead: true, filtered}, lang)).toHaveLength(6);
				expect(listHints({focus: 'list', dialog: null, row: 'project', filtered}, lang)).toHaveLength(6);
				expect(listHints({focus: 'list', dialog: null, row: 'project', isEmptyProject: true, filtered}, lang)).toHaveLength(6);
			}
		}
		expect(listHints({focus: 'list', dialog: null, row: 'session', editingFilter: true}).join(' ')).toContain('esc clear');
		expect(listHints({focus: 'list', dialog: 'close-session', row: 'session'})).toEqual(['enter close · esc cancel']);
		expect(listHints({focus: 'list', dialog: 'remove-project', row: 'project'})).toEqual(['enter remove · esc cancel']);
		for (const lang of ['en', 'zh-TW'] as const) {
			for (const row of ['session', 'project'] as const) {
				for (const filtered of [false, true]) {
					for (const editingFilter of [false, true]) {
						for (const isEmptyProject of [false, true]) {
							for (const line of listHints({focus: 'list', dialog: null, row, isEmptyProject, filtered, editingFilter}, lang)) {
								expect(width(line)).toBeLessThanOrEqual(28);
							}
						}
					}
				}
			}
			for (const dialog of ['add-project', 'remove-project', 'new-session', 'close-session', 'open-url'] as const) {
				for (const line of listHints({focus: 'list', dialog, row: null}, lang)) {
					expect(width(line)).toBeLessThanOrEqual(28);
				}
			}
			for (const line of listHints({focus: 'ai', dialog: null, row: null}, lang)) expect(width(line)).toBeLessThanOrEqual(28);
		}
	});

	test('key hints switch language and name the other one', () => {
		expect(listHints({focus: 'ai', dialog: null, row: 'session'}, 'zh-TW')).toEqual(['ctrl+q 回到左邊']);
		expect(listHints({focus: 'list', dialog: null, row: 'session'}, 'en').at(-1)).toBe('? help · t 中文');
		expect(listHints({focus: 'list', dialog: null, row: 'session'}, 'zh-TW').at(-1)).toBe('? 說明 · t English');
	});

	test('language changes only the config field, and notices compare by content', () => {
		const s = A.initialState(config);
		const zh = A.setLanguage(s, 'zh-TW');
		expect(zh.config).toEqual({...s.config, language: 'zh-TW'});
		expect(A.setLanguage(zh, 'zh-TW')).toBe(zh);
		const noticed = A.setNotice(s, {key: 'cannotShow'});
		expect(A.setNotice(noticed, {key: 'cannotShow'})).toBe(noticed);
		expect(A.setNotice(noticed, {key: 'notInstalled', arg: 'codex'}).notice).toEqual({key: 'notInstalled', arg: 'codex'});
	});
});

const status = (state: SessionStatus['state']): SessionStatus => ({state, screen: 'x', changedAt: 0, since: 0});

describe('telling apart AIs on the same branch', () => {
	test('the second and later of the same project, branch and AI get #2, #3 by creation', () => {
		const twin = (id: string, created: number, over: Partial<SessionSummary> = {}) => ({...session(id, '/w/alpha', 'dev'), created, ...over});
		const all = [twin('c', 30), twin('a', 10), twin('b', 20), twin('x', 15, {agent: 'agy'}), twin('y', 5, {project: '/w/beta'})];
		const s = A.setSessions(A.initialState(config), all);
		const label = (id: string) => agentLabel(s, s.sessions.find(x => x.id === id)!);
		expect(['a', 'b', 'c', 'x', 'y'].map(label)).toEqual(['claude', 'claude #2', 'claude #3', 'agy', 'claude']);
		expect(sessionSeq(s, s.sessions.find(x => x.id === 'x')!)).toBe(0);
		const closed = A.setSessions(s, all.filter(x => x.id !== 'a'));
		expect(agentLabel(closed, closed.sessions.find(x => x.id === 'b')!)).toBe('claude');
		expect(agentLabel(closed, closed.sessions.find(x => x.id === 'c')!)).toBe('claude #2');
	});
});

describe('dynamic branches and dialogs', () => {
	const options = [
		{id: 'claude', name: 'Claude Code', installed: true, signedIn: true},
		{id: 'codex', name: 'Codex CLI', installed: false, signedIn: null},
		{id: 'agy', name: 'Antigravity', installed: true, signedIn: false},
	];

	test('project and live session branches update dynamically across project rows, session rows, and open dialog', () => {
		let s = withSessions(A.initialState(config));
		s = A.setProjectBranches(s, {'/w/alpha': 'dev', '/w/beta': 'main'});
		expect(projectBranch(s, '/w/alpha')).toBe('dev');
		expect(liveSessionBranch(s, SESSIONS[0]!)).toBe('dev');
		expect(visibleRows(s)[0]).toMatchObject({kind: 'project', branch: 'dev'});
		expect(A.setProjectBranches(s, {'/w/alpha': 'dev'})).toBe(s);

		const opened = A.openNewSession(s, options);
		expect(opened.dialog).toMatchObject({kind: 'new-session', project: '/w/alpha', branch: 'dev', index: 0});
		const switched = A.setProjectBranches(opened, {'/w/alpha': 'release/1.0'});
		expect(switched.dialog).toMatchObject({kind: 'new-session', branch: 'release/1.0'});
		expect(liveSessionBranch(switched, SESSIONS[0]!)).toBe('release/1.0');
	});

	test('open-url lists the ports to choose from', () => {
		let s = A.openUrlChoice(A.initialState(config), [3000, 5173]);
		expect(s.dialog).toMatchObject({kind: 'open-url', index: 0});
		s = A.moveDialogChoice(s, 1);
		expect(s.dialog).toMatchObject({index: 1});
		expect(A.moveDialogChoice(s, 1)).toBe(s);
		expect(s.dialog && acceptsText(s.dialog)).toBe(false);
	});

	test('a flash replaces nothing and compares by identity', () => {
		const s = A.setFlash(A.setNotice(A.initialState(config), {key: 'configInvalid'}), {key: 'noPorts'});
		expect(s.flash).toEqual({key: 'noPorts'});
		expect(s.notice).toEqual({key: 'configInvalid'});
		expect(A.setFlash(s, null).flash).toBeNull();
		const none = A.initialState(config);
		expect(A.setFlash(none, null)).toBe(none);
	});
});

describe('session status in state', () => {
	test('glyph state falls back to the exit status before the first capture', () => {
		const s = withSessions(A.initialState(config));
		expect(sessionState(s, SESSIONS[0]!)).toBe('idle');
		expect(sessionState(s, {...SESSIONS[0]!, dead: true, exitStatus: 0})).toBe('done');
		expect(sessionState(s, {...SESSIONS[0]!, dead: true, exitStatus: 2})).toBe('error');
		const next = A.applyStatuses(s, {a1: status('running')}, []);
		expect(sessionState(next, SESSIONS[0]!)).toBe('running');
		expect(statusCounts(next)).toMatchObject({running: 1, idle: 2});
	});

	test('an unchanged poll returns the same object so nothing redraws', () => {
		const s = A.applyStatuses(withSessions(A.initialState(config)), {a1: status('idle')}, []);
		expect(A.applyStatuses(s, {a1: status('idle')}, [])).toBe(s);
	});

	test('a session blinks after entering approval until it is viewed or answered', () => {
		let s = withSessions(A.initialState(config));
		s = A.applyStatuses(s, {a1: status('needs-approval'), a2: status('idle')}, ['a1']);
		expect(s.attention).toEqual(['a1']);
		expect(isBlinking(s, 'a1')).toBe(true);
		const viewing = A.setFocus(A.selectSession(s, 'a1'), 'ai', false);
		expect(isViewing(viewing, 'a1')).toBe(true);
		expect(isBlinking(viewing, 'a1')).toBe(false);
		expect(A.applyStatuses(viewing, viewing.statuses, []).attention).toEqual([]);
		expect(A.applyStatuses(s, {a1: status('running'), a2: status('idle')}, []).attention).toEqual([]);
	});

	test('/ matches project, branch or AI; f keeps approval and error', () => {
		let s = A.applyStatuses(withSessions(A.initialState(config)), {a1: status('needs-approval'), a2: status('running'), b1: status('error')}, []);
		const keys = (st: AppState) => visibleRows(st).map(r => r.key);
		s = A.startFilter(s);
		s = A.editFilter(s, () => 'codex');
		expect(keys(s)).toEqual(['p:/w/alpha', 's:a2']);
		s = A.editFilter(s, () => 'BETA');
		expect(keys(s)).toEqual(['p:/w/beta', 's:b1']);
		s = A.endFilter(s);
		expect(s.filter).toEqual({text: 'BETA', editing: false});
		expect(filterActive(s)).toBe(true);
		s = A.clearFilter(s);
		expect(filterActive(s)).toBe(false);
		s = A.toggleAttentionOnly(s);
		expect(keys(s)).toEqual(['p:/w/alpha', 's:a1', 'p:/w/beta', 's:b1']);
		s = A.startFilter(s);
		s = A.editFilter(s, () => 'nothing');
		expect(keys(s)).toEqual([]);
		expect(s.selected).toBeNull();
	});

	test('under f a session that stops needing the user drops out and the cursor stays put', () => {
		let s = A.applyStatuses(withSessions(A.initialState(config)), {a1: status('needs-approval'), a2: status('idle'), b1: status('error')}, []);
		s = A.selectSession(A.toggleAttentionOnly(s), 'b1');
		s = A.applyStatuses(s, {a1: status('needs-approval'), a2: status('idle'), b1: status('running')}, []);
		expect(visibleRows(s).map(r => r.key)).toEqual(['p:/w/alpha', 's:a1']);
		expect(s.selected).toBe('s:a1');
	});

	test('enter on an empty project opens new-session dialog, while non-empty project folds', () => {
		const enterKey = {
			upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
			pageDown: false, pageUp: false, home: false, end: false,
			return: true, escape: false, ctrl: false, shift: false,
			tab: false, backspace: false, delete: false, meta: false,
		} as Parameters<typeof handleListKey>[3];
		const calls: string[] = [];
		const ctrl: ListKeyController = {
			focusAi: async () => { calls.push('focusAi'); },
			zoomAi: async () => { calls.push('zoomAi'); },
			openNewSession: () => { calls.push('openNewSession'); },
			showDiff: async () => {},
			showHelp: async () => {},
			openWeb: async () => {},
			quit: async () => {},
			toggleLanguage: () => {},
		};
		let emptyState = A.initialState(config);
		const emptyStore = {get: () => emptyState, set: (fn: (s: AppState) => AppState) => { emptyState = fn(emptyState); }};
		handleListKey(emptyStore, ctrl, '', enterKey);
		expect(calls).toEqual(['openNewSession']);
		expect(emptyState.collapsed).toEqual([]);

		let populatedState = withSessions(A.initialState(config));
		const populatedStore = {get: () => populatedState, set: (fn: (s: AppState) => AppState) => { populatedState = fn(populatedState); }};
		handleListKey(populatedStore, ctrl, '', enterKey);
		expect(calls).toEqual(['openNewSession']);
		expect(populatedState.collapsed).toEqual(['/w/alpha']);

		populatedState = A.selectSession(populatedState, 'a1');
		handleListKey(populatedStore, ctrl, '', enterKey);
		expect(calls).toEqual(['openNewSession', 'focusAi']);
	});
});
