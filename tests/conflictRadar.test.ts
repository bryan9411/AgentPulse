import {afterAll, beforeAll, describe, expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {exec} from '../src/infra/exec.ts';
import {committedFiles, headCommit, parseStatusZ, statusEntries} from '../src/infra/git.ts';
import {findConflicts, folderFiles, involvedBranches, scanProject} from '../src/services/conflictRadar.ts';

describe('conflict intersection', () => {
	test('a file in two or more folders is a conflict', () => {
		const found = findConflicts([
			{cwd: '/w/shop', branch: 'main', files: ['src/cart.ts', 'README.md']},
			{cwd: '/w/shop.worktrees/a', branch: 'feat/a', files: ['src/cart.ts', 'src/a.ts', 'src/共用.ts']},
			{cwd: '/w/shop.worktrees/b', branch: 'feat/b', files: ['src/cart.ts', 'src/共用.ts', 'src/b.ts']},
		]);
		expect(found).toEqual([
			{file: 'src/cart.ts', branches: ['feat/a', 'feat/b', 'main']},
			{file: 'src/共用.ts', branches: ['feat/a', 'feat/b']},
		]);
		expect(involvedBranches(found)).toBe(3);
	});

	test('several AIs in one folder, or one folder alone, are not a conflict', () => {
		expect(findConflicts([
			{cwd: '/w/shop', branch: 'main', files: ['a.ts']},
			{cwd: '/w/shop', branch: 'main', files: ['a.ts']},
		])).toEqual([]);
		expect(findConflicts([{cwd: '/w/shop', branch: 'main', files: ['a.ts', 'a.ts']}])).toEqual([]);
		expect(findConflicts([])).toEqual([]);
		expect(involvedBranches([])).toBe(0);
	});

	test('status output: renames carry both paths, CJK names stay readable', () => {
		const text = 'R  new.ts\0old.ts\0?? 新檔.ts\0 M src/cart.ts\0UU both.ts\0';
		expect(parseStatusZ(text)).toEqual([
			{code: 'R ', path: 'new.ts', from: 'old.ts'},
			{code: '??', path: '新檔.ts'},
			{code: ' M', path: 'src/cart.ts'},
			{code: 'UU', path: 'both.ts'},
		]);
		expect(parseStatusZ('')).toEqual([]);
	});
});

describe('changed files from git', () => {
	const base = realpathSync(mkdtempSync(join(tmpdir(), 'ap-radar-')));
	const repo = join(base, '商店');
	const wtA = join(base, '商店.worktrees', 'feat', 'a');
	const wtB = join(base, '商店.worktrees', 'feat-b');
	const saved = process.env.GIT_CONFIG_GLOBAL;
	const git = async (dir: string, ...args: string[]) => {
		const r = await exec(['git', '-C', dir, ...args]);
		if (!r.ok) throw new Error(`git ${args.join(' ')}: ${r.message}`);
		return r.stdout.trim();
	};

	beforeAll(async () => {
		process.env.GIT_CONFIG_GLOBAL = '/dev/null';
		mkdirSync(join(repo, 'src'), {recursive: true});
		await git(repo, 'init', '-q', '-b', 'main');
		await git(repo, 'config', 'user.name', 'tester');
		await git(repo, 'config', 'user.email', 'tester@example.invalid');
		for (const name of ['cart.ts', 'api.ts', 'old.ts', '共用.ts']) writeFileSync(join(repo, 'src', name), `// ${name}\n`);
		await git(repo, 'add', '.');
		await git(repo, 'commit', '-qm', 'init');
		await git(repo, 'worktree', 'add', '-q', '-b', 'feat/a', wtA, 'main');
		await git(repo, 'worktree', 'add', '-q', '-b', 'feat-b', wtB, 'main');
	});

	afterAll(() => {
		if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL;
		else process.env.GIT_CONFIG_GLOBAL = saved;
		rmSync(base, {recursive: true, force: true});
	});

	test('nothing changed anywhere: no conflicts', async () => {
		expect(await scanProject(repo, [{cwd: repo, branch: 'main'}, {cwd: wtA, branch: 'feat/a'}, {cwd: wtB, branch: 'feat-b'}])).toEqual([]);
	});

	test('uncommitted and committed changes both count', async () => {
		writeFileSync(join(wtA, 'src', 'cart.ts'), '// a\n');
		await git(wtA, 'mv', 'src/old.ts', 'src/renamed.ts');
		await git(wtA, 'commit', '-qam', 'a');
		mkdirSync(join(wtA, 'docs'));
		writeFileSync(join(wtA, 'docs', '說明.md'), 'x\n');
		writeFileSync(join(wtB, 'src', 'cart.ts'), '// b\n');
		writeFileSync(join(wtB, 'src', '共用.ts'), '// b\n');

		const mainline = await headCommit(repo);
		expect(mainline).toMatch(/^[0-9a-f]{40}$/);
		expect((await committedFiles(wtA, mainline ?? '')) ?? []).toEqual(['src/cart.ts', 'src/old.ts', 'src/renamed.ts']);
		expect((await statusEntries(wtA))?.map(e => e.path)).toEqual(['docs/說明.md']);
		expect([...((await folderFiles(wtA, mainline)) ?? [])].sort()).toEqual(['docs/說明.md', 'src/cart.ts', 'src/old.ts', 'src/renamed.ts']);
		expect([...((await folderFiles(wtB, mainline)) ?? [])].sort()).toEqual(['src/cart.ts', 'src/共用.ts']);
		expect(await folderFiles(join(base, 'gone'), mainline)).toBeNull();

		expect(await scanProject(repo, [{cwd: wtA, branch: 'stale-name'}, {cwd: wtB, branch: 'feat-b'}])).toEqual([
			// 分支名稱應從資料夾實際讀取，不沿用工作階段舊紀錄
			{file: 'src/cart.ts', branches: ['feat-b', 'feat/a']},
		]);
	});

	test('the main folder only contributes what is not committed yet', async () => {
		writeFileSync(join(repo, 'src', '共用.ts'), '// main, uncommitted\n');
		const withMain = [{cwd: repo, branch: 'main'}, {cwd: wtA, branch: 'feat/a'}, {cwd: wtB, branch: 'feat-b'}];
		expect(await scanProject(repo, withMain)).toEqual([
			{file: 'src/cart.ts', branches: ['feat-b', 'feat/a']},
			{file: 'src/共用.ts', branches: ['feat-b', 'main']},
		]);
		expect(await scanProject(repo, [...withMain, {cwd: join(base, 'gone'), branch: 'x'}])).toHaveLength(2);
	});
});
