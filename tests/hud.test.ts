import {describe, expect, test} from 'bun:test';
import {stripVTControlCharacters} from 'node:util';
import {HUD_ROWS} from '../src/config/layout.ts';
import {hudFrame, hudLines, topBarFormat} from '../src/hud/hud.ts';
import {width} from '../src/ui/text.ts';

const plain = (lines: string[]) => lines.map(l => stripVTControlCharacters(l));

describe('hud', () => {
	test('always four lines, each exactly the pane width', () => {
		for (const size of [1, 10, 40, 120]) {
			for (const project of [null, {name: '商店-api', path: '/Users/me/文件/商店-api'}]) {
				const lines = plain(hudLines({tooSmall: false, project}, size));
				expect(lines).toHaveLength(HUD_ROWS);
				for (const line of lines) expect(width(line)).toBe(size);
			}
		}
	});

	test('shows the project name and the end of its path', () => {
		const [first] = plain(hudLines({tooSmall: false, project: {name: 'shop', path: '/very/long/path/to/shop'}}, 20));
		expect(first).toBe(' shop · …ath/to/shop');
	});

	test('session lines keep the exact width and show an exit status', () => {
		const project = {name: '商店-api', path: '/w/商店-api'};
		for (const dead of [false, true]) {
			const session = {branch: 'feat/購物車', agent: 'claude', cwd: '/w/商店-api', dead, exitStatus: dead ? 1 : null};
			for (const size of [1, 5, 12, 13, 40, 120]) {
				for (const line of plain(hudLines({tooSmall: false, project, session}, size))) expect(width(line)).toBe(size);
			}
		}
		const [first] = plain(
			hudLines({tooSmall: false, project, session: {branch: 'main', agent: 'claude', cwd: '/w', dead: true, exitStatus: 0}}, 40),
		);
		expect(first?.trimEnd()).toMatch(/^ main · 商店-api · claude +exited \(0\)$/);
	});

	test('line 1 ends with the live state, and stalled? when frozen', () => {
		const project = {name: 'shop', path: '/w/shop'};
		const base = {branch: 'main', agent: 'claude', cwd: '/w/shop', dead: false, exitStatus: null};
		const first = (session: object, size = 50) => plain(hudLines({tooSmall: false, project, session: {...base, ...session}}, size))[0] ?? '';
		expect(first({state: 'needs-approval'}).trimEnd()).toMatch(/◐ needs approval$/);
		expect(first({state: 'running', stalled: true}).trimEnd()).toMatch(/● running · stalled\?$/);
		expect(first({state: null}).trimEnd()).toBe(' main · shop · claude');
		// Too narrow for the status: dropped whole, never cut.
		expect(first({state: 'needs-approval'}, 16)).not.toContain('◐');
		for (const size of [1, 10, 16, 17, 30, 80]) {
			for (const state of ['running', 'needs-approval', 'idle', 'done', 'error'] as const) {
				for (const line of plain(hudLines({tooSmall: false, project, session: {...base, state, stalled: true}}, size))) {
					expect(width(line)).toBe(size);
				}
			}
		}
	});

	test('blank while the window is too small', () => {
		const lines = plain(hudLines({tooSmall: true, project: {name: 'x', path: '/x'}}, 30));
		expect(lines.every(l => l.trim() === '')).toBe(true);
	});

	test('frame homes the cursor and clears leftovers', () => {
		const frame = hudFrame(['a', 'b']);
		expect(frame.startsWith('\x1b[?25l\x1b[H')).toBe(true);
		expect(frame.endsWith('\x1b[J')).toBe(true);
		expect(frame).toContain('a\x1b[K\r\nb\x1b[K');
	});

	test('top bar counts sessions', () => {
		expect(topBarFormat({sessions: 0})).toContain('0 sessions');
		expect(topBarFormat({sessions: 1})).toContain('1 session');
		expect(topBarFormat({sessions: 1})).not.toContain('1 sessions');
	});

	test('top bar lists the states worth a glance, skipping zeros', () => {
		const counts = {running: 2, 'needs-approval': 1, idle: 3, done: 0, error: 1};
		const text = topBarFormat({sessions: 7, counts}).replace(/#\[[^\]]*\]/g, '');
		expect(text).toBe(' AgentPulse  7 sessions · ◐ 1 needs approval · ✕ 1 error · ● 2 running');
	});
});
