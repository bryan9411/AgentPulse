import {describe, expect, test} from 'bun:test';
import {DEFAULT_CONFIG} from '../src/config/config.ts';
import * as A from '../src/state/actions.ts';
import {projectKey, selectedRow, sessionKey, visibleRows, windowTooSmall} from '../src/state/selectors.ts';
import type {AppState} from '../src/state/types.ts';

const config = {...DEFAULT_CONFIG, projects: ['/w/alpha', '/w/beta']};
const withSessions = (s: AppState): AppState => ({
	...s,
	sessions: [
		{id: 'a1', project: '/w/alpha', branch: 'main', agent: 'claude'},
		{id: 'a2', project: '/w/alpha', branch: 'feat/x', agent: 'codex'},
		{id: 'b1', project: '/w/beta', branch: 'main', agent: 'claude'},
	],
});

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
		s = A.setDialogError(s, 'Folder not found');
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
});
