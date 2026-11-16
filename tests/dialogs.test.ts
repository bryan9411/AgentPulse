import {describe, expect, test} from 'bun:test';
import {messageText, msg, strings, type Lang, type Message} from '../src/i18n/strings.ts';
import {diffPopupCommand, helpPopupCommand} from '../src/services/diff.ts';
import type {MergeOutcome, MergePlan} from '../src/services/worktree.ts';
import type {MergeDialog, OpenUrlDialog, SessionSummary, WorktreeDialog} from '../src/state/types.ts';
import {conflictLines} from '../src/ui/conflictLines.ts';
import {mergeLines} from '../src/ui/dialogs/mergeLines.ts';
import {openUrlLines} from '../src/ui/dialogs/openUrlLines.ts';
import {worktreeLines} from '../src/ui/dialogs/worktreeLines.ts';
import {fieldLine, lineWidth, marked, wrapped, type Line} from '../src/ui/lineParts.ts';

const LANGS: readonly Lang[] = ['en', 'zh-TW'];
const WIDTH = 28;
const text = (lines: Line[]) => lines.map(l => l.spans.map(s => s.text).join('').trimEnd());
const flat = (lines: Line[]) => text(lines).join(' ').replace(/\s+/g, ' ');
const fits = (lines: Line[], width = WIDTH) => {
	for (const l of lines) expect(lineWidth(l)).toBeLessThanOrEqual(width);
};

const session: SessionSummary = {
	id: 'agentpulse-w1', project: '/w/商店-api', cwd: '/w/商店-api.worktrees/feat/checkout', branch: 'feat/checkout',
	agent: 'claude', dead: false, exitStatus: null, created: 0, agentSession: '', worktree: true, base: 'main',
};
const plan: MergePlan = {branch: 'feat/checkout', base: 'main', project: session.project, path: session.cwd, dirty: 0, ignored: []};
const merge = (over: Partial<MergeDialog>): MergeDialog => ({
	kind: 'merge', session, plan, blocked: null, value: '', outcome: null, error: null, busy: false, ...over,
});

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
		kind: 'worktree', project: '/w/商店-api', base: 'main', value: 'feat/購物車', index: 0, error: null, busy: false,
		options: [
			{id: 'claude', name: 'Claude Code', installed: true},
			{id: 'codex', name: 'Codex CLI', installed: false},
		],
	};
	const ctx = {projectName: '商店-api', path: '/w/商店-api.worktrees/feat/購物車'};

	test('shows where it branches from, the folder it will create and the AIs', () => {
		const lines = text(worktreeLines(dialog, ctx, 'en', WIDTH));
		expect(lines[0]).toBe('New worktree');
		expect(lines.join('\n')).toContain('from main');
		expect(lines).toContain('› claude');
		expect(lines.some(l => l.startsWith('  codex') && l.endsWith('not installed'))).toBe(true);
		expect(lines.some(l => l.endsWith('worktrees/feat/購物車'))).toBe(true);
		expect(text(worktreeLines({...dialog, base: null}, ctx, 'zh-TW', WIDTH)).join('\n')).toContain('從 … 分出');
	});

	test('fits the sidebar in both languages, with an error and while busy', () => {
		const errors: Array<Message | null> = [null, msg('branchExists', 'feat/購物車'), msg('folderExists', ctx.path), msg('worktreeNoAi')];
		for (const lang of LANGS) {
			for (const error of errors) fits(worktreeLines({...dialog, error}, ctx, lang, WIDTH));
			fits(worktreeLines({...dialog, busy: true}, ctx, lang, WIDTH));
			const typed = worktreeLines(dialog, ctx, lang, WIDTH).length;
			expect(worktreeLines({...dialog, value: ''}, {...ctx, path: '/w/商店-api.worktrees/'}, lang, WIDTH)).toHaveLength(typed);
		}
	});
});

describe('merge dialog', () => {
	test('lists every step in order; the commit step only when there is something to commit', () => {
		const clean = text(mergeLines(merge({}), 'en', WIDTH));
		expect(clean[0]).toBe('Merge and clean up?');
		expect(clean[1]).toBe('feat/checkout → main');
		expect(clean.filter(l => /^\d /.test(l))).toEqual(['1 merge into main', '2 close this AI', '3 remove the branch folder', '4 delete branch']);
		expect(clean[clean.indexOf('4 delete branch') + 1]).toBe('  feat/checkout');
		expect(flat(mergeLines(merge({}), 'en', WIDTH))).toContain('nothing deleted');
		expect(clean.join(' ')).not.toContain('Commit message');

		const dirty = text(mergeLines(merge({plan: {...plan, dirty: 3}, value: 'fix cart'}), 'en', WIDTH));
		expect(dirty.filter(l => /^\d /.test(l))[0]).toBe('1 commit 3 changed files');
		expect(dirty.filter(l => /^\d /.test(l))).toHaveLength(5);
		expect(dirty).toContain('Commit message:');
		expect(dirty.some(l => l.startsWith('fix cart'))).toBe(true);
		expect(text(mergeLines(merge({plan: {...plan, dirty: 1}}), 'en', WIDTH))).toContain('1 commit 1 changed file');
	});

	test('names ignored files that go with the folder', () => {
		const lines = flat(mergeLines(merge({plan: {...plan, ignored: ['.env', 'node_modules/', 'dist/', '.cache/', 'tmp/']}}), 'en', WIDTH));
		expect(lines).toContain('! Not in git');
		expect(lines).toContain('.env, node_modules/, dist/ +2 more');
		expect(text(mergeLines(merge({plan: {...plan, ignored: ['.env']}}), 'zh-TW', WIDTH)).join('')).toContain('.env');
	});

	test('while checking and when refused it says so instead of offering steps', () => {
		expect(text(mergeLines(merge({plan: null, busy: true}), 'en', WIDTH))).toEqual(['Merge and clean up?', 'Checking…']);
		const refused = mergeLines(merge({plan: null, blocked: msg('mainNotOnBase', 'main', 'feat/x')}), 'zh-TW', WIDTH);
		expect(text(refused)[0]).toBe('現在還不能合併');
		expect(flat(refused)).toContain('要先切回 main（現在在 feat/x）');
		expect(flat(refused)).not.toContain('enter');
	});

	test('a conflict names the files and says nothing was deleted', () => {
		const files = Array.from({length: 9}, (_, i) => `src/深/層/路徑/很長的檔案名稱-${i}.ts`);
		const outcome: MergeOutcome = {kind: 'conflict', branch: 'feat/checkout', files, aborted: true, committed: true};
		const lines = text(mergeLines(merge({outcome}), 'en', WIDTH));
		expect(lines[0]).toBe('! Conflict: merge undone');
		expect(lines.filter(l => l.endsWith('.ts'))).toHaveLength(5);
		expect(lines).toContain('  +4 more');
		expect(lines.join(' ')).toContain('Nothing was deleted.');
		expect(lines.join(' ')).toContain('committed on feat/checkout');
		const notUndone = text(mergeLines(merge({outcome: {...outcome, files: ['a.ts'], aborted: false, committed: false}}), 'en', WIDTH)).join(' ');
		expect(notUndone).toContain('git merge --abort failed');
		expect(notUndone).not.toContain('committed on');
	});

	test('every phase fits the sidebar in both languages', () => {
		const long = '致命錯誤: 無法建立提交，因為某個非常長的原因說明文字一直延伸下去而且沒有空白可以折行 and then some English words follow';
		const outcomes: MergeOutcome[] = [
			{kind: 'conflict', branch: '功能/非常長的分支名稱-checkout-flow', files: ['a.ts', 'src/很深/的/路徑/檔案.ts'], aborted: false, committed: true},
			{kind: 'commit-failed', detail: long},
			{kind: 'merge-failed', branch: 'feat/checkout', detail: long, committed: true},
			{kind: 'cleanup-failed', step: 'close', base: 'main', detail: ''},
			{kind: 'cleanup-failed', step: 'folder', base: 'main', detail: long},
			{kind: 'cleanup-failed', step: 'branch', base: '主線/很長的名稱', detail: long},
		];
		const blocked: Message[] = [msg('aiRunning'), msg('mainDirty'), msg('mainMerging'), msg('mainNotOnBase', 'main', '功能/很長的分支名稱'), msg('worktreeMissing', session.cwd)];
		const longPlan = {...plan, branch: '功能/非常長的分支名稱-checkout-flow', base: 'release/2026-11', dirty: 12, ignored: ['.env', 'node_modules/', 'dist/', 'x/']};
		for (const lang of LANGS) {
			for (const outcome of outcomes) {
				const lines = mergeLines(merge({outcome}), lang, WIDTH);
				expect(lines.length).toBeGreaterThan(1);
				fits(lines);
			}
			for (const reason of blocked) fits(mergeLines(merge({plan: null, blocked: reason}), lang, WIDTH));
			fits(mergeLines(merge({plan: longPlan, value: '很長的提交訊息'.repeat(6), error: msg('needMessage')}), lang, WIDTH));
			fits(mergeLines(merge({plan: longPlan, busy: true}), lang, WIDTH));
			fits(mergeLines(merge({plan: null, busy: true}), lang, WIDTH));
			fits(mergeLines(merge({plan: longPlan}), lang, 18), 18);
		}
		expect(mergeLines(merge({plan: {...plan, dirty: 2}}), 'zh-TW', WIDTH).length).toBeLessThanOrEqual(12);
		expect(mergeLines(merge({plan: {...plan, dirty: 2}}), 'en', WIDTH).length).toBeLessThanOrEqual(13);
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
		expect(messageText('en', msg('merged', 'feat/a', 'main'))).toBe('Merged feat/a into main');
		expect(messageText('zh-TW', msg('merged', 'feat/a', 'main'))).toBe('已把 feat/a 合併到 main');
		expect(messageText('en', msg('merged', '$&{1}', 'main'))).toBe('Merged $&{1} into main');
		expect(msg('noPorts')).toEqual({key: 'noPorts'});
		expect(msg('branchExists', 'x')).toEqual({key: 'branchExists', arg: 'x'});
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
