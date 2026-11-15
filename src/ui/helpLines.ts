import {strings, type Lang} from '../i18n/strings.ts';
import {COLORS, type Glyphs} from './theme.ts';
import {padEnd, width} from './text.ts';

export type HelpInput = {
	lang: Lang;
	glyphs: Glyphs;
	// tmux key name from the config, e.g. "C-q".
	backKey: string;
	configPath: string;
	logPath: string;
	// false for tests and for terminals without colour.
	color: boolean;
};

// tmux spells keys "C-q" / "M-x"; the user reads "ctrl+q" (CLAUDE.md).
export function keyLabel(tmuxKey: string): string {
	const names: Record<string, string> = {C: 'ctrl', M: 'alt', S: 'shift'};
	const parts = tmuxKey.split('-');
	const last = parts.pop() ?? '';
	if (last === '' || parts.length === 0 || parts.some(p => !(p in names))) return tmuxKey;
	return [...parts.map(p => names[p]), last.toLowerCase()].join('+');
}

function paint(text: string, hex: string, on: boolean): string {
	if (!on) return text;
	const [r, g, b] = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

// SPEC 4: the text paged by `less` in the ? popup. Pure, so it can be tested.
export function helpLines(input: HelpInput): string[] {
	const t = strings(input.lang).help;
	const g = input.glyphs;
	const back = keyLabel(input.backKey);
	const rows: [string, string][] = [...t.keys];
	const keyWidth = Math.max(width(back), width(t.everythingElse), ...rows.map(([k]) => width(k)));
	const row = (key: string, text: string) => `  ${padEnd(key, keyWidth)}   ${text}`;
	const states: [string, string, string][] = [
		[g.running, COLORS.running, t.states.running],
		[g.approval, COLORS.warn, t.states.approval],
		[g.idle, COLORS.text, t.states.idle],
		[g.done, COLORS.text, t.states.done],
		[g.error, COLORS.error, t.states.error],
	];
	return [
		t.title,
		'',
		t.symbols,
		...states.map(([glyph, hex, text]) => `  ${paint(glyph, hex, input.color)}  ${text}`),
		`  ${g.expanded} ${g.collapsed}  ${t.folded}`,
		'',
		t.aiSide,
		row(back, t.back),
		row(t.everythingElse, t.toAi),
		'',
		t.listSide,
		...rows.map(([key, text]) => row(key, text)),
		'',
		t.quitTitle,
		...t.quit(back).map(line => `  ${line}`),
		'',
		t.filesTitle,
		`  ${t.settings}${input.configPath}`,
		`  ${t.log}${input.logPath}`,
	];
}
