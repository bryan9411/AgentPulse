import React from 'react';
import {describe, expect, test} from 'bun:test';
import {renderToString} from 'ink';
import {messageText, msg, strings, type Lang} from '../src/i18n/strings.ts';
import {hostFs} from '../src/infra/fsx.ts';
import {agentChoices} from '../src/services/sessions.ts';
import {defaultAgentIndex} from '../src/state/actions.ts';
import {diffPopupCommand, helpPopupCommand} from '../src/services/diff.ts';
import type {CloseSessionDialog as CloseDialogType, NewSessionDialog as NewSessionDialogType, OpenUrlDialog, SessionSummary} from '../src/state/types.ts';
import {GroupRow} from '../src/ui/GroupRow.tsx';
import {KeyHints} from '../src/ui/KeyHints.tsx';
import {SessionRow} from '../src/ui/SessionRow.tsx';
import {CloseSessionDialog, CLOSE_SESSION_DIALOG_ROWS} from '../src/ui/dialogs/CloseSessionDialog.tsx';
import {NewSessionDialog, newSessionDialogRows} from '../src/ui/dialogs/NewSessionDialog.tsx';
import {openUrlLines} from '../src/ui/dialogs/openUrlLines.ts';
import {fieldLine, lineWidth, marked, wrapped, type Line} from '../src/ui/lineParts.ts';
import {width} from '../src/ui/text.ts';
import {agentColor, COLORS, GLYPHS, stateGlyph} from '../src/ui/theme.ts';

const LANGS: readonly Lang[] = ['en', 'zh-TW'];
const WIDTH = 28;
const text = (lines: Line[]) => lines.map(l => l.spans.map(s => s.text).join('').trimEnd());
const fits = (lines: Line[], width = WIDTH) => {
	for (const l of lines) expect(lineWidth(l)).toBeLessThanOrEqual(width);
};

const session: SessionSummary = {
	id: 'agentpulse-s1', project: '/w/商店-api', cwd: '/w/商店-api', branch: 'dev',
	agent: 'claude', dead: false, exitStatus: null, created: 0, agentSession: '',
};

describe('line parts', () => {
	test('wrapped text indents its continuation lines', () => {
		expect(text(wrapped('5 delete branch feat/a-rather-long-name', 20, '#fff', '  '))).toEqual(['5 delete branch', '  feat/a-rather-long', '  -name']);
		expect(text(wrapped('short', 20))).toEqual(['short']);
	});

	test('a marked line keeps its mark on the first line only', () => {
		const lines = marked('Commit failed for a reason that is long', 20, '#f00');
		expect(lines.map(l => l.spans[0]?.text)).toEqual(['! ', '  ', '  ']);
		fits(lines, 20);
	});

	test('a field shows the end of what was typed and fills the row', () => {
		const field = fieldLine('feat/a-very-long-branch-name-that-does-not-fit', WIDTH);
		expect(lineWidth(field)).toBe(WIDTH);
		expect(field.spans[0]?.text.endsWith('does-not-fit')).toBe(true);
		expect(lineWidth(fieldLine('', WIDTH))).toBe(WIDTH);
	});
});

describe('new-session and group row rendering', () => {
	test('GroupRow renders live branch and keeps exact row width even with long names', () => {
		const plain = renderToString(
			React.createElement(GroupRow, {
				name: '商店-api',
				branch: 'dev',
				count: 2,
				expanded: true,
				selected: false,
				width: WIDTH,
				glyphs: GLYPHS.unicode,
			}),
		);
		expect(plain).toContain('商店-api');
		expect(plain).toContain('(dev)');
		expect(width(plain)).toBe(WIDTH);

		const long = renderToString(
			React.createElement(GroupRow, {
				name: 'very-long-project-folder-name',
				branch: 'feature/very-long-branch',
				count: 1,
				expanded: false,
				selected: true,
				width: WIDTH,
				glyphs: GLYPHS.ascii,
			}),
		);
		expect(long.trimEnd().endsWith('1')).toBe(true);
		expect(width(long)).toBe(WIDTH);
	});

	test('SessionRow and KeyHints keep exact width and expose provider/state semantic colors', () => {
		expect(agentColor('claude')).toBe(COLORS.claude);
		expect(agentColor('claude #2')).toBe(COLORS.claude);
		expect(agentColor('codex')).toBe(COLORS.codex);
		expect(agentColor('agy')).toBe(COLORS.agy);
		expect(agentColor('other')).toBe(COLORS.dim);
		expect(stateGlyph('done', GLYPHS.unicode).color).toBe(COLORS.done);

		for (const selected of [false, true]) {
			for (const glyphs of [GLYPHS.unicode, GLYPHS.ascii]) {
				const rendered = renderToString(
					React.createElement(SessionRow, {
						session,
						branch: 'feat/購物車',
						label: 'claude',
						state: 'done',
						hidden: false,
						selected,
						width: WIDTH,
						glyphs,
					}),
				);
				expect(width(rendered)).toBe(WIDTH);
				if (selected) expect(rendered.startsWith(glyphs.cursor)).toBe(true);
				expect(rendered).toContain(glyphs.guide);
			}
		}

		const hints = renderToString(
			React.createElement(KeyHints, {
				lines: ['↑↓ move · ←→ fold', 'enter / n new AI', 'type to filter'],
				width: WIDTH,
			}),
		);
		const renderedHints = hints.split('\n');
		expect(renderedHints).toEqual(['↑↓ move · ←→ fold', 'enter / n new AI', 'type to filter']);
		for (const lineText of renderedHints) expect(width(lineText)).toBeLessThanOrEqual(WIDTH);
	});

	test('NewSessionDialog shows detected branch, sign-in hint, and missing-AI guidance', () => {
		const dialog: NewSessionDialogType = {
			kind: 'new-session',
			project: '/w/商店-api',
			branch: 'dev',
			index: 0,
			error: null,
			busy: false,
			options: [
				{id: 'claude', name: 'Claude Code', installed: true, signedIn: true},
				{id: 'codex', name: 'Codex CLI', installed: false, signedIn: null},
				{id: 'agy', name: 'Antigravity', installed: true, signedIn: false},
			],
		};
		expect(newSessionDialogRows(dialog)).toBe(7);
		const out = renderToString(React.createElement(NewSessionDialog, {dialog, projectName: '商店-api', width: WIDTH, lang: 'zh-TW'}));
		expect(out).toContain('商店-api (dev)');
		expect(out).toContain('未安裝');
		expect(out).toContain('未登入');

		const none: NewSessionDialogType = {
			...dialog,
			options: dialog.options.map(o => ({...o, installed: false})),
		};
		expect(newSessionDialogRows(none)).toBe(8);
		for (const lang of LANGS) {
			const noAiOut = renderToString(React.createElement(NewSessionDialog, {dialog: none, projectName: '商店-api', width: WIDTH, lang}));
			expect(noAiOut).toContain(strings(lang).newSession.noAiHint);
		}
	});
});

describe('close session dialog', () => {
	test('renders session branch and warning cleanly', () => {
		const dlg: CloseDialogType = {kind: 'close-session', session, error: null, busy: false};
		expect(CLOSE_SESSION_DIALOG_ROWS).toBe(4);
		const out = renderToString(React.createElement(CloseSessionDialog, {dialog: dlg, branch: 'main', width: WIDTH, lang: 'en'}));
		expect(out).toContain('main · claude');
		expect(out).toContain('The AI will be stopped.');
	});
});

describe('open-url dialog', () => {
	test('one line per port', () => {
		const dialog: OpenUrlDialog = {kind: 'open-url', ports: [3000, 5173], index: 1, error: null, busy: false};
		expect(text(openUrlLines(dialog, 'en', WIDTH))).toEqual(['Open in browser', '  localhost:3000', '› localhost:5173']);
		for (const lang of LANGS) fits(openUrlLines({...dialog, error: msg('openFailed')}, lang, WIDTH));
	});
});

describe('messages and popup commands', () => {
	test('arguments are filled in and odd characters in them are kept as they are', () => {
		expect(messageText('en', msg('agentProjectExists', 'claude'))).toBe('claude is already running in this project');
		expect(messageText('zh-TW', msg('agentProjectExists', 'claude'))).toBe('此專案已有相同的 AI（claude）');
		expect(messageText('en', msg('notInstalled', '$&{1}'))).toBe('$&{1} is not installed');
		expect(msg('noPorts')).toEqual({key: 'noPorts'});
		expect(msg('unknownAgent', 'x')).toEqual({key: 'unknownAgent', arg: 'x'});
	});

	test('both dictionaries have the same shape of hints', () => {
		for (const key of Object.keys(strings('en').hints) as Array<keyof ReturnType<typeof strings>['hints']>) {
			const en = strings('en').hints[key];
			const zh = strings('zh-TW').hints[key];
			expect(Array.isArray(zh) ? zh.length : 1).toBe(Array.isArray(en) ? en.length : 1);
		}
	});

	test('diff and help popup commands invoke self with escaped arguments', () => {
		const diffCmd = diffPopupCommand("/w/it's here/商店", 'zh-TW', '商店 (feat/a)');
		expect(diffCmd).toContain('--role=diff');
		expect(diffCmd).toContain('--cwd');
		expect(diffCmd).toContain('商店');
		expect(diffCmd).toContain('--lang');
		expect(diffCmd).toContain('zh-TW');
		expect(diffCmd).toContain('--title');

		const helpCmd = helpPopupCommand('en');
		expect(helpCmd).toContain('--role=help');
		expect(helpCmd).toContain('--lang');
		expect(helpCmd).toContain('en');
	});

	test('agentChoices reports sign-in state cleanly even when no CLI is on PATH', () => {
		const fs = hostFs('/nonexistent-home', {GEMINI_API_KEY: 'test-key'});
		const choices = agentChoices(fs, '');
		expect(choices.map(c => c.id)).toEqual(['claude', 'codex', 'agy']);
		expect(choices.find(c => c.id === 'agy')?.signedIn).toBe(true);
		expect(defaultAgentIndex(choices.map(c => ({...c, installed: false})))).toBe(0);
	});
});
