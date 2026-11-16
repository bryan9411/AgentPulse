import React from 'react';
import {afterAll, describe, expect, test} from 'bun:test';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {render, renderToString} from 'ink';
import {createPopupInput, readFlag} from '../src/app/runPopups.tsx';
import {
	deltaArgs,
	loadDiffFiles,
	loadFileDiff,
	normalizeAnsiOutput,
	parseNumstatZ,
} from '../src/services/diff.ts';
import {DiffPopup} from '../src/ui/DiffPopup.tsx';
import {fileTabLabels, formatBuiltinDiff, layoutFileStrip, statusBadge} from '../src/ui/diffFormat.ts';
import {MouseWheelProvider, splitMouseEvents, useMouseWheel, WHEEL_STEP} from '../src/ui/mouseWheel.tsx';
import {formatScrollRange, nextScrollOffset} from '../src/ui/popupScroll.ts';

const tmpDirs: string[] = [];

function makeTempRepo(): string {
	const dir = mkdtempSync('/tmp/ap-diff-test-');
	tmpDirs.push(dir);
	Bun.spawnSync(['git', 'init'], {cwd: dir});
	Bun.spawnSync(['git', 'config', 'user.email', 'test@example.com'], {cwd: dir});
	Bun.spawnSync(['git', 'config', 'user.name', 'Test User'], {cwd: dir});
	return dir;
}

afterAll(() => {
	for (const d of tmpDirs) rmSync(d, {recursive: true, force: true});
});

describe('diff service helpers', () => {
	test('parseNumstatZ handles added, deleted, binary, and renames', () => {
		const raw = [
			'12\t3\tsrc/app.ts',
			'-\t-\tassets/logo.png',
			'4\t2\t',
			'src/old.ts',
			'src/new.ts',
			'',
		].join('\0');
		const map = parseNumstatZ(raw);
		expect(map.get('src/app.ts')).toEqual({added: 12, removed: 3, binary: false});
		expect(map.get('assets/logo.png')).toEqual({added: 0, removed: 0, binary: true});
		expect(map.get('src/new.ts')).toEqual({added: 4, removed: 2, binary: false});
		expect(map.has('src/old.ts')).toBe(false);
	});

	test('deltaArgs enables dark mode, line numbers by default, and side-by-side when toggled', () => {
		expect(deltaArgs(100, false)).toEqual(['--paging=never', '--dark', '--width=100', '--line-numbers']);
		expect(deltaArgs(25, true)).toEqual(['--paging=never', '--dark', '--width=40', '--side-by-side']);
	});

	test('normalizeAnsiOutput expands tabs and trims only final newline', () => {
		expect(normalizeAnsiOutput('a\tb\r\nc\n')).toEqual(['a    b', 'c']);
	});

	test('readFlag parses both --key value and --key=value', () => {
		const args = ['--role=diff', '--cwd', '/tmp/a b', '--lang=zh-TW'];
		expect(readFlag(args, 'role')).toBe('diff');
		expect(readFlag(args, 'cwd')).toBe('/tmp/a b');
		expect(readFlag(args, 'lang')).toBe('zh-TW');
		expect(readFlag(args, 'missing')).toBeUndefined();
	});
});

describe('diff repository loaders', () => {
	test('loadDiffFiles & loadFileDiff cover modified, renamed, untracked text, untracked empty, and binary files', async () => {
		const dir = makeTempRepo();
		writeFileSync(join(dir, 'tracked.ts'), 'const a = 1;\nconst b = 2;\n');
		writeFileSync(join(dir, 'oldname.txt'), 'hello\n');
		Bun.spawnSync(['git', 'add', '.'], {cwd: dir});
		Bun.spawnSync(['git', 'commit', '-m', 'init'], {cwd: dir});

		writeFileSync(join(dir, 'tracked.ts'), 'const a = 1;\nconst b = 3;\nconst c = 4;\n');
		Bun.spawnSync(['git', 'mv', 'oldname.txt', 'renamed.txt'], {cwd: dir});
		writeFileSync(join(dir, 'new.ts'), 'export const hi = 1;\nexport const yo = 2;\n');
		writeFileSync(join(dir, 'empty.ts'), '');
		writeFileSync(join(dir, 'img.bin'), Buffer.from([0x89, 0x50, 0x00, 0x01]));

		const files = await loadDiffFiles(dir);
		expect(files).not.toBeNull();
		const byPath = new Map((files ?? []).map(f => [f.path, f]));

		expect(byPath.get('tracked.ts')).toMatchObject({added: 2, removed: 1, binary: false, untracked: false});
		expect(byPath.get('renamed.txt')).toMatchObject({from: 'oldname.txt', untracked: false});
		expect(byPath.get('new.ts')).toMatchObject({added: 2, removed: 0, binary: false, untracked: true});
		expect(byPath.get('empty.ts')).toMatchObject({added: 0, removed: 0, binary: false, untracked: true});
		expect(byPath.get('img.bin')).toMatchObject({binary: true, untracked: true});

		const trackedDiff = await loadFileDiff(dir, byPath.get('tracked.ts')!, {width: 80, sideBySide: false, delta: null});
		expect(trackedDiff.kind).toBe('raw');
		if (trackedDiff.kind === 'raw') {
			expect(trackedDiff.rawDiff).toContain('-const b = 2;');
			expect(trackedDiff.rawDiff).toContain('+const c = 4;');
		}

		const newDiff = await loadFileDiff(dir, byPath.get('new.ts')!, {width: 80, sideBySide: false, delta: null});
		expect(newDiff.kind).toBe('raw');
		if (newDiff.kind === 'raw') {
			expect(newDiff.rawDiff).toContain('+export const hi = 1;');
		}

		const binDiff = await loadFileDiff(dir, byPath.get('img.bin')!, {width: 80, sideBySide: false, delta: null});
		expect(binDiff.kind).toBe('binary');
	});
});

describe('diff formatting & popup helpers', () => {
	test('formatBuiltinDiff preserves indentation, line numbers, and colors', () => {
		const sample = [
			'diff --git a/src/a.ts b/src/a.ts',
			'index 111..222 100644',
			'--- a/src/a.ts',
			'+++ b/src/a.ts',
			'@@ -10,3 +10,3 @@ function demo()',
			'   keep();',
			'-    oldIndent();',
			'+    newIndent();',
		].join('\n');
		const lines = formatBuiltinDiff(sample, 80);
		const text = lines.map(l => l.spans.map(s => s.text).join('')).join('\n');
		expect(text).toContain('@@ -10 +10 @@ function demo()');
		expect(text).toContain('  10   10 │     keep();');
		expect(text).toContain('  11      │ -     oldIndent();');
		expect(text).toContain('       11 │ +     newIndent();');
	});

	test('fileTabLabels disambiguates matching filenames', () => {
		expect(fileTabLabels(['src/index.ts', 'tests/index.ts', 'README.md'])).toEqual([
			'src/index.ts',
			'tests/index.ts',
			'README.md',
		]);
	});

	test('layoutFileStrip keeps selected item visible and reports overflow arrows', () => {
		const labels = ['alpha.ts', 'bravo.ts', 'charlie.ts', 'delta.ts', 'echo.ts'];
		const mid = layoutFileStrip(labels, 2, 26);
		expect(mid.items.some(item => item.index === 2 && item.active)).toBe(true);
		expect(mid.moreLeft || mid.moreRight).toBe(true);
	});

	test('statusBadge maps git status codes', () => {
		expect(statusBadge('??').tag).toBe('??');
		expect(statusBadge(' M').tag).toBe('M');
		expect(statusBadge('R ').tag).toBe('R');
		expect(statusBadge(' D').tag).toBe('D');
	});

	test('scroll helpers clamp and format ranges accurately', () => {
		const keyBase = {upArrow: false, downArrow: false, pageUp: false, pageDown: false, ctrl: false};
		expect(nextScrollOffset(0, 20, 10, 'j', keyBase)).toBe(1);
		expect(nextScrollOffset(0, 20, 10, 'k', keyBase)).toBe(0);
		expect(nextScrollOffset(0, 20, 10, ' ', keyBase)).toBe(8);
		expect(nextScrollOffset(10, 20, 10, 'b', keyBase)).toBe(2);
		expect(nextScrollOffset(0, 20, 10, 'G', keyBase)).toBe(20);
		expect(nextScrollOffset(20, 20, 10, 'g', keyBase)).toBe(0);
		expect(nextScrollOffset(0, 20, 10, 'q', keyBase)).toBeNull();
		expect(formatScrollRange(0, 10, 50)).toBe('1-10 / 50 (20%)');
		expect(formatScrollRange(0, 10, 8)).toBe('8 / 8');
	});

	test('DiffPopup renders header, file tabs, stats, and footer cleanly', () => {
		const out = renderToString(
			React.createElement(DiffPopup, {
				lang: 'zh-TW',
				title: 'AgentPulse (dev)',
				deltaAvailable: false,
				initialFiles: [
					{path: 'src/a.ts', code: ' M', added: 5, removed: 2, binary: false, untracked: false},
					{path: 'src/b.ts', code: '??', added: 10, removed: 0, binary: false, untracked: true},
				],
				loadFile: async () => ({kind: 'raw' as const, rawDiff: '@@ -1,1 +1,1 @@\n-old\n+new\n', usedDelta: false as const}),
				reloadFiles: async () => [],
				onClose: () => {},
			}),
		);
		expect(out).toContain('檔案修改');
		expect(out).toContain('src/a.ts');
		expect(out).toContain('1/2');
		expect(out).toContain('+5');
		expect(out).toContain('-2');
	});
});

describe('mouse wheel proxy & parser', () => {
	test('splitMouseEvents extracts SGR & X10 wheel events while passing normal keys untouched', () => {
		expect(splitMouseEvents('\x1b[<64;12;8M')).toEqual({passthrough: '', wheelDelta: -WHEEL_STEP, remainder: ''});
		expect(splitMouseEvents('\x1b[<65;12;8M\x1b[<69;12;8M')).toEqual({
			passthrough: '',
			wheelDelta: WHEEL_STEP * 2,
			remainder: '',
		});
		expect(splitMouseEvents('\x1b[<66;1;1M\x1b[<0;1;1M\x1b[<0;1;1mq')).toEqual({
			passthrough: 'q',
			wheelDelta: 0,
			remainder: '',
		});
		expect(splitMouseEvents('\x1b')).toEqual({passthrough: '\x1b', wheelDelta: 0, remainder: ''});
		expect(splitMouseEvents('\x1b[A')).toEqual({passthrough: '\x1b[A', wheelDelta: 0, remainder: ''});

		const first = splitMouseEvents('x\x1b[<64;10;');
		expect(first).toEqual({passthrough: 'x', wheelDelta: 0, remainder: '\x1b[<64;10;'});
		const second = splitMouseEvents(`${first.remainder}5M\x1b[B`);
		expect(second).toEqual({passthrough: '\x1b[B', wheelDelta: -WHEEL_STEP, remainder: ''});

		expect(splitMouseEvents(`\x1b[M${String.fromCharCode(96)}!!`)).toEqual({
			passthrough: '',
			wheelDelta: -WHEEL_STEP,
			remainder: '',
		});
		expect(splitMouseEvents(`\x1b[M${String.fromCharCode(97)}!!`)).toEqual({
			passthrough: '',
			wheelDelta: WHEEL_STEP,
			remainder: '',
		});
	});

	test('createPopupInput delivers mouse wheel events to Ink components while keeping keyboard input working', async () => {
		const raw = new PassThrough() as PassThrough & {isTTY: boolean; setRawMode: (m: boolean) => unknown};
		raw.isTTY = true;
		raw.setRawMode = () => raw;
		const out = new PassThrough() as unknown as NodeJS.WriteStream & {columns: number; rows: number};
		out.columns = 80;
		out.rows = 24;

		const {stdin, wheelSource, dispose} = createPopupInput(raw);
		const deltas: number[] = [];
		let closed = false;
		const lines = Array.from({length: 40}, (_, i) => `+line ${i + 1}`).join('\n');

		function WheelTap() {
			useMouseWheel(d => deltas.push(d));
			return React.createElement(DiffPopup, {
				lang: 'en',
				title: 'repo',
				deltaAvailable: false,
				initialFiles: [{path: 'a.ts', code: ' M', added: 40, removed: 0, binary: false, untracked: false}],
				loadFile: async () => ({kind: 'raw' as const, rawDiff: `@@ -1,0 +1,40 @@\n${lines}\n`, usedDelta: false as const}),
				reloadFiles: async () => [],
				onClose: () => {
					closed = true;
				},
			});
		}

		const app = render(React.createElement(MouseWheelProvider, {source: wheelSource, children: React.createElement(WheelTap)}), {
			stdin,
			stdout: out,
			exitOnCtrlC: false,
		});
		await new Promise(r => setTimeout(r, 30));
		raw.write('\x1b[<65;10;10M');
		raw.write('\x1b[<65;10;10M');
		raw.write('\x1b[<64;10;10M');
		await new Promise(r => setTimeout(r, 20));
		raw.write('q');
		await new Promise(r => setTimeout(r, 20));
		app.unmount();
		dispose();

		expect(deltas).toEqual([WHEEL_STEP, WHEEL_STEP, -WHEEL_STEP]);
		expect(closed).toBe(true);
	});
});
