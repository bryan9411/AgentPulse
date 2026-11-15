import {describe, expect, test} from 'bun:test';
import {stripVTControlCharacters} from 'node:util';
import {HUD_ROWS} from '../src/config/layout.ts';
import {fitSegments, type Segment} from '../src/hud/fit.ts';
import {formatDuration, hudFrame, hudLines, topBarFormat, type HudDetails} from '../src/hud/hud.ts';
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

describe('fitSegments', () => {
	const seg = (text: string, rank: number, minWidth?: number): Segment => ({text, rank, color: '#000000', minWidth});
	const join = (s: Segment[]) => s.map(x => x.text).join(' · ');

	test('keeps everything when it fits', () => {
		const all = [seg('aaa', 1), seg('bb', 2)];
		expect(join(fitSegments(all, 8))).toBe('aaa · bb');
	});

	test('drops the least important first; a shrinkable field is cut before it goes', () => {
		const all = [seg('model-name', 1, 5), seg('MCP one, two', 2, 6), seg('skills 4', 4), seg('CLAUDE.md ✓', 3)];
		const full = join(all);
		expect(join(fitSegments(all, width(full)))).toBe(full);
		// One cell short: skills goes first, whole.
		expect(join(fitSegments(all, width(full) - 1))).toBe('model-name · MCP one, two · CLAUDE.md ✓');
		// Then the rules file, then the MCP list is cut down to its minimum.
		expect(join(fitSegments(all, 25))).toBe('model-name · MCP one, two');
		expect(join(fitSegments(all, 22))).toBe('model-name · MCP one,…');
		expect(join(fitSegments(all, 19))).toBe('model-name · MCP o…');
		expect(join(fitSegments(all, 18))).toBe('model-name');
		// Only the most important field is left, cut to the width.
		expect(join(fitSegments(all, 6))).toBe('model…');
	});

	test('handles CJK widths and never exceeds the size', () => {
		const all = [seg('feat/購物車-結帳', 1, 6), seg('+12 -3', 2), seg('up 3h05m', 5), seg(':3000', 3)];
		for (let size = 0; size <= 50; size++) {
			expect(width(join(fitSegments(all, size)))).toBeLessThanOrEqual(size);
		}
	});
});

describe('hud detail lines', () => {
	const project = {name: 'shop', path: '/w/shop'};
	const now = 10_000_000;
	const details: HudDetails = {
		model: 'claude-opus-5-5',
		effort: 'medium',
		mcp: ['github', 'postgres'],
		skills: 4,
		rules: {name: 'CLAUDE.md', present: true},
		git: {branch: 'fix/login-bug', added: 128, removed: 34, untracked: 2},
		ports: [3000, 5173],
		createdAt: now - 42 * 60_000,
		changedAt: now - 3000,
	};
	const session = {branch: 'main', agent: 'claude', cwd: '/w/shop', dead: false, exitStatus: null, state: 'idle' as const, details};

	test('lines 2 and 3 match SPEC 5.5', () => {
		const lines = plain(hudLines({tooSmall: false, project, session, now}, 100));
		expect(lines[1]?.trimEnd()).toBe(' claude-opus-5-5 [medium] · MCP github, postgres · skills 4 · CLAUDE.md ✓');
		expect(lines[2]?.trimEnd()).toBe(' fix/login-bug · +128 -34 · 2 untracked · up 42m · output 3s ago · :3000 :5173');
		expect(lines[3]?.trimEnd()).toBe(' /w/shop');
	});

	test('unknown fields show — and a clean tree says so', () => {
		const empty: HudDetails = {...details, model: null, effort: null, mcp: null, skills: null, rules: {name: 'GEMINI.md', present: false}, git: {branch: null, added: 0, removed: 0, untracked: 0}, ports: [], createdAt: null, changedAt: null};
		const lines = plain(hudLines({tooSmall: false, project, session: {...session, details: empty}, now}, 100));
		expect(lines[1]?.trimEnd()).toBe(' model — · MCP — · skills — · no GEMINI.md');
		expect(lines[2]?.trimEnd()).toBe(' main · clean');
		const before = plain(hudLines({tooSmall: false, project, session: {...session, details: undefined}, now}, 100));
		expect(before[2]?.trimEnd()).toBe(' main · —');
	});

	test('narrow panes drop fields in the SPEC order and keep the exact width', () => {
		const at = (size: number) => plain(hudLines({tooSmall: false, project, session, now}, size));
		expect(at(70)[2]?.trimEnd()).toBe(' fix/login-bug · +128 -34 · up 42m · output 3s ago · :3000 :5173');
		expect(at(60)[2]?.trimEnd()).toBe(' fix/login-bug · +128 -34 · output 3s ago · :3000 :5173');
		expect(at(50)[2]?.trimEnd()).toBe(' fix/login-bug · +128 -34 · :3000 :5173');
		expect(at(20)[2]?.trimEnd()).toBe(' fix/login-bug');
		expect(at(10)[2]?.trimEnd()).toBe(' fix/logi…');
		expect(at(50)[1]?.trimEnd()).toBe(' claude-opus-5-5 [medium] · MCP github, postgres');
		for (let size = 1; size <= 120; size++) {
			for (const line of at(size)) expect(width(line)).toBe(size);
		}
	});

	test('durations', () => {
		expect(formatDuration(45_000)).toBe('45s');
		expect(formatDuration(12 * 60_000)).toBe('12m');
		expect(formatDuration(3 * 3_600_000 + 5 * 60_000)).toBe('3h05m');
		expect(formatDuration(52 * 3_600_000)).toBe('2d4h');
	});

	test('top bar shows each account on the right', () => {
		const text = topBarFormat({
			sessions: 0,
			accounts: [{id: 'claude', signedIn: true}, {id: 'codex', signedIn: false}, {id: 'agy', signedIn: null}],
		});
		expect(text).toContain('#[align=right]');
		expect(text.replace(/#\[[^\]]*\]/g, '').endsWith('claude ●  codex ○ ')).toBe(true);
	});
});
