import React from 'react';
import {describe, expect, test} from 'bun:test';
import {renderToString} from 'ink';
import {messageText, msg, strings, type Lang, type Message} from '../src/i18n/strings.ts';
import {diffPopupCommand, helpPopupCommand} from '../src/services/diff.ts';
import type {CloseSessionDialog as CloseDialogType, OpenUrlDialog, SessionSummary, WorktreeDialog} from '../src/state/types.ts';
import {conflictLines} from '../src/ui/conflictLines.ts';
import {CloseSessionDialog, closeSessionDialogRows} from '../src/ui/dialogs/CloseSessionDialog.tsx';
import {openUrlLines} from '../src/ui/dialogs/openUrlLines.ts';
import {worktreeLines} from '../src/ui/dialogs/worktreeLines.ts';
import {fieldLine, lineWidth, marked, wrapped, type Line} from '../src/ui/lineParts.ts';

const LANGS: readonly Lang[] = ['en', 'zh-TW'];
const WIDTH = 28;
const text = (lines: Line[]) => lines.map(l => l.spans.map(s => s.text).join('').trimEnd());
const fits = (lines: Line[], width = WIDTH) => {
	for (const l of lines) expect(lineWidth(l)).toBeLessThanOrEqual(width);
};

const session: SessionSummary = {
	id: 'agentpulse-w1', project: '/w/商店-api', cwd: '/w/商店-api.worktrees/feat/checkout', branch: 'feat/checkout',
	agent: 'claude', dead: false, exitStatus: null, created: 0, agentSession: '', worktree: true,
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

describe('worktree dialog', () => {
	const dialog: WorktreeDialog = {
		kind: 'worktree',
		project: '/w/商店-api',
		step: 'branch',
		base: 'dev',
		branches: [
			{branch: 'main', status: 'existing'},
			{branch: 'feat/open', status: 'worktree'},
		],
		branchesLoaded: true,
		value: 'feat/購物車',
		branchIndex: 0,
		selectedBranch: null,
		index: 0,
		error: null,
		busy: false,
		options: [
			{id: 'claude', name: 'Claude Code', installed: true},
			{id: 'codex', name: 'Codex CLI', installed: false},
		],
	};
	const ctx = {projectName: '商店-api', path: '/w/商店-api.worktrees/feat/購物車'};

	test('branch step lists typed new branch alongside existing branches and previews folder', () => {
		const lines = text(worktreeLines(dialog, ctx, 'en', WIDTH));
		expect(lines[0]).toBe('Branch workspace');
		expect(lines.some(l => l.startsWith('› feat/購物車') && l.endsWith('from dev'))).toBe(true);
		expect(lines.some(l => l.endsWith('worktrees/feat/購物車'))).toBe(true);

		const existingPick = text(worktreeLines({...dialog, value: ''}, {...ctx, path: '/w/商店-api.worktrees/main'}, 'zh-TW', WIDTH));
		expect(existingPick.some(l => l.startsWith('› main') && l.endsWith('既有'))).toBe(true);
		expect(existingPick.some(l => l.startsWith('  feat/open') && l.endsWith('已開'))).toBe(true);
	});

	test('agent step lists AIs cleanly and handles errors within sidebar width', () => {
		const agentDialog: WorktreeDialog = {
			...dialog,
			step: 'agent',
			selectedBranch: {branch: 'main', mode: 'existing'},
		};
		const lines = text(worktreeLines(agentDialog, {...ctx, path: '/w/商店-api.worktrees/main'}, 'en', WIDTH));
		expect(lines).toContain('› claude');
		expect(lines.some(l => l.startsWith('  codex') && l.endsWith('not installed'))).toBe(true);

		const errors: Array<Message | null> = [
			null,
			msg('branchInMain', 'dev'),
			msg('branchInUse', 'main', '/w/other/main'),
			msg('folderExists', ctx.path),
			msg('worktreeNoAi'),
		];
		for (const lang of LANGS) {
			for (const error of errors) {
				fits(worktreeLines({...dialog, error}, ctx, lang, WIDTH));
				fits(worktreeLines({...agentDialog, error}, ctx, lang, WIDTH));
			}
			fits(worktreeLines({...dialog, busy: true}, ctx, lang, WIDTH));
			fits(worktreeLines({...agentDialog, busy: true}, ctx, lang, WIDTH));
		}
	});
});

describe('close session dialog', () => {
	test('renders plain close or worktree folder choice cleanly', () => {
		const plain: CloseDialogType = {kind: 'close-session', session: {...session, worktree: false}, canRemoveWorktree: false, index: 0, error: null, busy: false};
		expect(closeSessionDialogRows(plain)).toBe(4);
		expect(renderToString(React.createElement(CloseSessionDialog, {dialog: plain, width: WIDTH, lang: 'en'}))).toContain('The AI will be stopped.');

		const wt: CloseDialogType = {kind: 'close-session', session, canRemoveWorktree: true, index: 1, error: null, busy: false};
		expect(closeSessionDialogRows(wt)).toBe(6);
		const out = renderToString(React.createElement(CloseSessionDialog, {dialog: wt, width: WIDTH, lang: 'zh-TW'}));
		expect(out).toContain('只關閉 AI（保留資料夾）');
		expect(out).toContain('› 同時移除 worktree 資料夾');
		expect(out).toContain('不會刪除 Git 分支本身。');
	});
});

describe('open-url dialog and conflict note', () => {
	test('one line per port', () => {
		const dialog: OpenUrlDialog = {kind: 'open-url', ports: [3000, 5173], index: 1, error: null, busy: false};
		expect(text(openUrlLines(dialog, 'en', WIDTH))).toEqual(['Open in browser', '  localhost:3000', '› localhost:5173']);
		for (const lang of LANGS) fits(openUrlLines({...dialog, error: msg('openFailed')}, lang, WIDTH));
	});

	test('the note has a heading with the branch count and at most a few files', () => {
		expect(conflictLines([], 'en', WIDTH)).toEqual([]);
		const two = [
			{file: 'src/cart.ts', branches: ['feat/a', 'main']},
			{file: 'src/api.ts', branches: ['feat/a', 'feat/b']},
		];
		expect(text(conflictLines(two, 'en', WIDTH))).toEqual(['! conflict · 3 branches', '  src/cart.ts', '  src/api.ts']);
		expect(text(conflictLines(two, 'zh-TW', WIDTH))[0]).toBe('! 3 個分支改到同一個檔案');
		const many = Array.from({length: 9}, (_, i) => ({file: `src/很長的資料夾名稱/子資料夾/檔案-${i}.ts`, branches: ['a', 'b']}));
		const lines = conflictLines(many, 'en', WIDTH);
		expect(text(lines).at(-1)).toBe('  +6 more');
		expect(lines).toHaveLength(5);
		expect(conflictLines(many.slice(0, 4), 'en', WIDTH)).toHaveLength(5);
		for (const lang of LANGS) fits(conflictLines(many, lang, WIDTH));
	});
});

describe('messages and the diff command', () => {
	test('two arguments are filled in, and odd characters in them are kept as they are', () => {
		expect(messageText('en', msg('branchInUse', 'feat/a', '/w/other'))).toBe('feat/a is already open in /w/other');
		expect(messageText('zh-TW', msg('branchInUse', 'feat/a', '/w/other'))).toBe('feat/a 已在另一個資料夾開啟：/w/other');
		expect(messageText('en', msg('branchInUse', '$&{1}', 'main'))).toBe('$&{1} is already open in main');
		expect(msg('noPorts')).toEqual({key: 'noPorts'});
		expect(msg('branchInMain', 'x')).toEqual({key: 'branchInMain', arg: 'x'});
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
});
