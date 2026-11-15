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
});
