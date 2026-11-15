import {describe, expect, test} from 'bun:test';
import {strings} from '../src/i18n/strings.ts';
import {helpLines, keyLabel, type HelpInput} from '../src/ui/helpLines.ts';
import {width} from '../src/ui/text.ts';
import {GLYPHS} from '../src/ui/theme.ts';

const base: HelpInput = {
	lang: 'en',
	glyphs: GLYPHS.unicode,
	backKey: 'C-q',
	configPath: '/Users/me/.config/agentpulse/config.json',
	logPath: '/Users/me/.config/agentpulse/agentpulse.log',
	color: false,
};

describe('keyLabel', () => {
	test('tmux names become readable', () => {
		expect(keyLabel('C-q')).toBe('ctrl+q');
		expect(keyLabel('M-x')).toBe('alt+x');
		expect(keyLabel('C-M-b')).toBe('ctrl+alt+b');
	});
	test('anything else is left alone', () => {
		expect(keyLabel('F12')).toBe('F12');
		expect(keyLabel('X-q')).toBe('X-q');
	});
});

describe('helpLines', () => {
	test('every list key from SPEC 4.2 is listed', () => {
		const text = helpLines(base).join('\n');
		for (const key of ['enter', 'z', 'n', 'w', 'm', 'x', 'd', 'o', '/', 'f', 'a', 't', '?', 'q']) {
			expect(text).toMatch(new RegExp(`^  ${key.replace(/[?/]/, c => `\\${c}`)} `, 'm'));
		}
	});
	test('the configured back key is shown, not a hard-coded one', () => {
		const text = helpLines({...base, backKey: 'C-b'}).join('\n');
		expect(text).toContain('ctrl+b');
		expect(text).not.toContain('ctrl+q');
	});
	test('descriptions line up in Chinese too', () => {
		for (const lang of ['en', 'zh-TW'] as const) {
			const t = strings(lang).help;
			const lines = helpLines({...base, lang});
			const descs = [t.back, t.toAi, ...t.keys.map(([, d]) => d)];
			const columns = descs.map(d => {
				const line = lines.find(l => l.endsWith(`   ${d}`));
				expect(line).toBeDefined();
				return width((line ?? '').slice(0, -d.length));
			});
			expect(new Set(columns).size).toBe(1);
		}
	});
	test('ascii glyphs and colour', () => {
		const plain = helpLines({...base, glyphs: GLYPHS.ascii});
		expect(plain).toContain('  *  working');
		const colored = helpLines({...base, color: true}).join('\n');
		expect(colored).toContain('\x1b[38;2;134;176;127m●\x1b[39m');
	});
});

describe('list hints', () => {
	test('the last lines still fit the 28-cell list', () => {
		for (const lang of ['en', 'zh-TW'] as const) {
			for (const line of strings(lang).hints.tail) expect(width(line)).toBeLessThanOrEqual(28);
		}
	});
});
