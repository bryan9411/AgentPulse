import {describe, expect, test} from 'bun:test';
import {DEFAULT_CONFIG} from '../src/config/config.ts';
import * as A from '../src/state/actions.ts';
import {
	acceptsText,
	filterActive,
	isBlinking,
	isViewing,
	mergeSettled,
	projectKey,
	selectedConflicts,
	selectedRow,
	selectedSession,
	agentLabel,
	sessionKey,
	sessionSeq,
	sessionState,
	statusCounts,
	visibleRows,
	windowTooSmall,
	worktreeDialogPath,
} from '../src/state/selectors.ts';
import type {SessionStatus} from '../src/services/status/machine.ts';
import {width} from '../src/ui/text.ts';
import {listHints} from '../src/ui/KeyHints.tsx';
import type {AppState, SessionSummary} from '../src/state/types.ts';

const config = {...DEFAULT_CONFIG, projects: ['/w/alpha', '/w/beta']};
const session = (id: string, project: string, branch: string, agent = 'claude'): SessionSummary => ({
	id, project, cwd: project, branch, agent, dead: false, exitStatus: null, created: 0, agentSession: '', worktree: false, base: '',
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

	test('new-session dialog starts on the first installed AI and clamps', () => {
		const options = [
			{id: 'claude', name: 'Claude Code', installed: false},
			{id: 'codex', name: 'Codex CLI', installed: true},
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

	test('key hints follow focus, row kind and dialog', () => {
		expect(listHints({focus: 'ai', dialog: null, row: 'session'})).toEqual(['ctrl+q back']);
		expect(listHints({focus: 'list', dialog: null, row: 'session'}).join(' ')).toContain('enter type');
		expect(listHints({focus: 'list', dialog: null, row: 'project'}).join(' ')).toContain('fold');
		for (const filtered of [false, true]) {
			for (const lang of ['en', 'zh-TW'] as const) {
				expect(listHints({focus: 'list', dialog: null, row: 'session', filtered}, lang)).toHaveLength(7);
				expect(listHints({focus: 'list', dialog: null, row: 'project', filtered}, lang)).toHaveLength(7);
			}
		}
		expect(listHints({focus: 'list', dialog: null, row: 'session', editingFilter: true}).join(' ')).toContain('esc clear');
		expect(listHints({focus: 'list', dialog: 'close-session', row: 'session'})).toEqual(['enter close · esc cancel']);
		// The sidebar is 30 columns with one column of padding on each side.
		for (const lang of ['en', 'zh-TW'] as const) {
			for (const row of ['session', 'project'] as const) {
				for (const filtered of [false, true]) {
					for (const editingFilter of [false, true]) {
						for (const line of listHints({focus: 'list', dialog: null, row, filtered, editingFilter}, lang)) expect(width(line)).toBeLessThanOrEqual(28);
					}
				}
			}
			for (const dialog of ['add-project', 'new-session', 'close-session', 'worktree', 'merge', 'open-url'] as const) {
				for (const mergeSettled of [false, true]) {
					for (const line of listHints({focus: 'list', dialog, row: null, mergeSettled}, lang)) expect(width(line)).toBeLessThanOrEqual(28);
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
		// Closing the first moves the rest up.
		const closed = A.setSessions(s, all.filter(x => x.id !== 'a'));
		expect(agentLabel(closed, closed.sessions.find(x => x.id === 'b')!)).toBe('claude');
		expect(agentLabel(closed, closed.sessions.find(x => x.id === 'c')!)).toBe('claude #2');
	});
});

describe('worktree, merge and open dialogs', () => {
	const options = [
		{id: 'claude', name: 'Claude Code', installed: true},
		{id: 'codex', name: 'Codex CLI', installed: false},
		{id: 'agy', name: 'Antigravity', installed: true},
	];
	const plan = {branch: 'feat/x', base: 'main', project: '/w/alpha', path: '/w/alpha.worktrees/feat/x', dirty: 0, ignored: []};
	const onWorktree = (): AppState => {
		const wt = {...session('w1', '/w/alpha', 'feat/x'), cwd: '/w/alpha.worktrees/feat/x', worktree: true, base: 'main'};
		return A.selectSession(A.setSessions(A.initialState(config), [...SESSIONS, wt]), 'w1');
	};

	test('w opens for the project under the cursor, from a group or a session row', () => {
		const onSession = A.openWorktree(A.moveSelection(withSessions(A.initialState(config)), 4), options);
		expect(onSession.dialog).toMatchObject({kind: 'worktree', project: '/w/beta', base: null, value: '', index: 0});
		const onGroup = A.openWorktree(A.initialState(config), options);
		expect(onGroup.dialog).toMatchObject({kind: 'worktree', project: '/w/alpha'});
		const empty = A.initialState({...config, projects: []});
		expect(A.openWorktree(empty, options)).toBe(empty);
	});

	test('typing goes to the branch name while the arrows pick the AI', () => {
		let s = A.openWorktree(A.initialState(config), options);
		expect(s.dialog && acceptsText(s.dialog)).toBe(true);
		s = A.editDialog(s, v => v + 'feat/購物車');
		s = A.moveDialogChoice(s, 2);
		expect(s.dialog).toMatchObject({value: 'feat/購物車', index: 2});
		expect(A.moveDialogChoice(s, 5)).toBe(s);
		if (s.dialog?.kind !== 'worktree') throw new Error('expected the worktree dialog');
		expect(worktreeDialogPath(s.dialog)).toBe('/w/alpha.worktrees/feat/購物車');
		expect(worktreeDialogPath({...s.dialog, value: ' '})).toBe('/w/alpha.worktrees/');
	});

	test('the base branch arrives later and only for the dialog that asked', () => {
		const s = A.openWorktree(A.initialState(config), options);
		expect(A.setWorktreeBase(s, '/w/alpha', 'main').dialog).toMatchObject({base: 'main'});
		expect(A.setWorktreeBase(s, '/w/beta', 'main')).toBe(s);
		expect(A.setWorktreeBase(A.closeDialog(s), '/w/alpha', 'main').dialog).toBeNull();
	});

	test('merge opens busy, then shows the plan or the reason it cannot go ahead', () => {
		const group = A.initialState(config);
		expect(A.openMerge(group)).toBe(group);
		let s = A.openMerge(onWorktree());
		expect(s.dialog).toMatchObject({kind: 'merge', busy: true, plan: null, blocked: null, outcome: null});
		expect(s.dialog && acceptsText(s.dialog)).toBe(false);
		// A check for some other session must not land in this dialog.
		expect(A.setMergeCheck(s, 'other', {ok: true, plan})).toBe(s);
		const refused = A.setMergeCheck(s, 'w1', {ok: false, error: {key: 'aiRunning'}});
		expect(refused.dialog).toMatchObject({busy: false, blocked: {key: 'aiRunning'}});
		if (refused.dialog?.kind !== 'merge') throw new Error('expected the merge dialog');
		expect(mergeSettled(refused.dialog)).toBe(true);
		s = A.setMergeCheck(s, 'w1', {ok: true, plan});
		expect(s.dialog).toMatchObject({busy: false, plan: {branch: 'feat/x'}});
		// Nothing to commit: no text field, typing is ignored.
		expect(A.editDialog(s, v => v + 'x')).toBe(s);
	});

	test('a commit message is asked for only when there are changes to commit', () => {
		let s = A.setMergeCheck(A.openMerge(onWorktree()), 'w1', {ok: true, plan: {...plan, dirty: 3}});
		s = A.editDialog(s, v => v + '修正結帳');
		expect(s.dialog).toMatchObject({value: '修正結帳'});
		s = A.setMergeOutcome(s, 'w1', {kind: 'conflict', branch: 'feat/x', files: ['a.ts'], aborted: true, committed: true});
		expect(s.dialog).toMatchObject({busy: false, outcome: {kind: 'conflict'}});
		if (s.dialog?.kind !== 'merge') throw new Error('expected the merge dialog');
		expect(mergeSettled(s.dialog)).toBe(true);
		expect(acceptsText(s.dialog)).toBe(false);
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

	test('conflicts mark their group row and show for the project under the cursor', () => {
		const found = {'/w/beta': [{file: 'src/cart.ts', branches: ['feat/a', 'main']}]};
		let s = A.setConflicts(withSessions(A.initialState(config)), found);
		expect(A.setConflicts(s, {...found})).toBe(s);
		const rows = visibleRows(s);
		expect(rows.find(r => r.key === 'p:/w/alpha')).toMatchObject({conflict: false});
		expect(rows.find(r => r.key === 'p:/w/beta')).toMatchObject({conflict: true});
		expect(selectedConflicts(s)).toEqual([]);
		s = A.selectSession(s, 'b1');
		expect(selectedConflicts(s).map(c => c.file)).toEqual(['src/cart.ts']);
		expect(selectedConflicts(A.selectProject(s, '/w/beta'))).toHaveLength(1);
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
		// Looking at it in the AI pane stops the blink at once.
		const viewing = A.setFocus(A.selectSession(s, 'a1'), 'ai', false);
		expect(isViewing(viewing, 'a1')).toBe(true);
		expect(isBlinking(viewing, 'a1')).toBe(false);
		expect(A.applyStatuses(viewing, viewing.statuses, []).attention).toEqual([]);
		// Answered elsewhere: no longer an alert state.
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
});
