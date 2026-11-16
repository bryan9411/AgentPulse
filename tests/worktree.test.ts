import {afterAll, beforeAll, describe, expect, test} from 'bun:test';
import {existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {exec} from '../src/infra/exec.ts';
import {branchExists, currentBranch, parseWorktreeListZ} from '../src/infra/git.ts';
import {
	checkOpenWorktree,
	listWorktreeBranches,
	openWorktree,
	removeWorktreeFolder,
	worktreePath,
	worktreeRoot,
} from '../src/services/worktree.ts';

// 使用暫存資料夾下的獨立儲存庫並隔離使用者的 git 設定，避免 hook 或 GPG 簽章干擾測試
const base = realpathSync(mkdtempSync(join(tmpdir(), 'ap-wt-')));
const savedEnv = {global: process.env.GIT_CONFIG_GLOBAL, system: process.env.GIT_CONFIG_NOSYSTEM};

beforeAll(() => {
	process.env.GIT_CONFIG_GLOBAL = '/dev/null';
	process.env.GIT_CONFIG_NOSYSTEM = '1';
});

afterAll(() => {
	if (savedEnv.global === undefined) delete process.env.GIT_CONFIG_GLOBAL;
	else process.env.GIT_CONFIG_GLOBAL = savedEnv.global;
	if (savedEnv.system === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
	else process.env.GIT_CONFIG_NOSYSTEM = savedEnv.system;
	rmSync(base, {recursive: true, force: true});
});

const git = async (dir: string, ...args: string[]): Promise<string> => {
	const r = await exec(['git', '-C', dir, ...args]);
	if (!r.ok) throw new Error(`git ${args.join(' ')}: ${r.message}`);
	return r.stdout.trim();
};

let counter = 0;
async function newRepo(name = '商店-api'): Promise<string> {
	const repo = join(base, `r${++counter}`, name);
	mkdirSync(repo, {recursive: true});
	await git(repo, 'init', '-q', '-b', 'main');
	await git(repo, 'config', 'user.name', 'tester');
	await git(repo, 'config', 'user.email', 'tester@example.invalid');
	writeFileSync(join(repo, 'cart.ts'), 'export const total = 1;\n');
	await git(repo, 'add', '.');
	await git(repo, 'commit', '-qm', 'init');
	return repo;
}

describe('worktree paths and list parsing', () => {
	test('paths sit under <name>.worktrees next to the project', () => {
		expect(worktreeRoot('/w/shop-api')).toBe('/w/shop-api.worktrees');
		expect(worktreePath('/w/shop-api', ' feat/購物車 ')).toBe('/w/shop-api.worktrees/feat/購物車');
	});

	test('parseWorktreeListZ reads worktree paths and branch names including detached entries', () => {
		const raw = [
			'worktree /w/repo',
			'HEAD 111111',
			'branch refs/heads/dev',
			'',
			'worktree /w/repo.worktrees/main',
			'HEAD 222222',
			'branch refs/heads/main',
			'',
			'worktree /w/detached',
			'HEAD 333333',
			'detached',
			'',
		].join('\0');
		expect(parseWorktreeListZ(raw)).toEqual([
			{path: '/w/repo', branch: 'dev'},
			{path: '/w/repo.worktrees/main', branch: 'main'},
			{path: '/w/detached', branch: null},
		]);
	});
});

describe('opening existing and new branch worktrees', () => {
	test('validates branch names, existing checkouts, empty repos, and occupied folders', async () => {
		const unborn = join(base, 'unborn');
		mkdirSync(unborn, {recursive: true});
		await git(unborn, 'init', '-q', '-b', 'main');
		expect(await checkOpenWorktree(unborn, '')).toEqual({ok: false, error: {key: 'branchEmpty'}});
		expect(await checkOpenWorktree(unborn, 'feat/x')).toEqual({ok: false, error: {key: 'noCommits'}});

		const repo = await newRepo();
		await git(repo, 'checkout', '-qb', 'dev');
		expect(await checkOpenWorktree(repo, 'bad name')).toEqual({ok: false, error: {key: 'branchInvalid'}});
		expect(await checkOpenWorktree(repo, '../escape')).toEqual({ok: false, error: {key: 'branchInvalid'}});
		expect(await checkOpenWorktree(repo, 'dev')).toEqual({ok: false, error: {key: 'branchInMain', arg: 'dev'}});

		const occupied = worktreePath(repo, 'feat/taken');
		mkdirSync(occupied, {recursive: true});
		writeFileSync(join(occupied, 'keep.txt'), 'keep\n');
		expect(await checkOpenWorktree(repo, 'feat/taken')).toEqual({ok: false, error: {key: 'folderExists', arg: occupied}});

		const externalWt = join(base, `ext-${counter}`);
		await git(repo, 'worktree', 'add', '-q', externalWt, 'main');
		expect(await checkOpenWorktree(repo, 'main')).toEqual({ok: false, error: {key: 'branchInUse', arg: 'main', arg2: externalWt}});
	});

	test('listWorktreeBranches shows un-checked-out local branches and managed worktrees only', async () => {
		const repo = await newRepo();
		await git(repo, 'branch', 'feat/old');
		await git(repo, 'checkout', '-qb', 'dev');

		const initial = await listWorktreeBranches(repo);
		expect(initial).toEqual({
			base: 'dev',
			branches: [
				{branch: 'feat/old', status: 'existing'},
				{branch: 'main', status: 'existing'},
			],
		});

		const opened = await openWorktree(repo, 'main');
		expect(opened).toMatchObject({ok: true, branch: 'main', mode: 'existing'});

		const afterOpen = await listWorktreeBranches(repo);
		expect(afterOpen).toEqual({
			base: 'dev',
			branches: [
				{branch: 'feat/old', status: 'existing'},
				{branch: 'main', status: 'worktree'},
			],
		});
	});

	test('opens existing branch, creates new branch, and reuses active worktree folder cleanly', async () => {
		const repo = await newRepo();
		await git(repo, 'checkout', '-qb', 'dev');

		const openedMain = await openWorktree(repo, 'main');
		expect(openedMain).toEqual({ok: true, branch: 'main', path: worktreePath(repo, 'main'), mode: 'existing'});
		expect(await currentBranch(worktreePath(repo, 'main'))).toBe('main');

		const reused = await openWorktree(repo, 'main');
		expect(reused).toEqual({ok: true, branch: 'main', path: worktreePath(repo, 'main'), mode: 'reuse'});

		const createdNew = await openWorktree(repo, 'feat/購物車');
		expect(createdNew).toEqual({
			ok: true,
			branch: 'feat/購物車',
			path: worktreePath(repo, 'feat/購物車'),
			mode: 'create',
			startPoint: 'dev',
		});
		expect(await currentBranch(worktreePath(repo, 'feat/購物車'))).toBe('feat/購物車');
	});
});

describe('removing worktree folders safely without deleting git branches', () => {
	test('removes clean worktree folder, tidies empty dirs, preserves branch, and refuses dirty folders', async () => {
		const repo = await newRepo();
		await git(repo, 'checkout', '-qb', 'dev');

		expect((await removeWorktreeFolder(repo, repo)).ok).toBe(false);

		const mainWt = await openWorktree(repo, 'main');
		expect(mainWt.ok).toBe(true);
		const nestedWt = await openWorktree(repo, 'feat/sub/task');
		expect(nestedWt.ok).toBe(true);
		if (!mainWt.ok || !nestedWt.ok) return;

		writeFileSync(join(mainWt.path, 'dirty.txt'), 'unsaved\n');
		const dirtyRemove = await removeWorktreeFolder(repo, mainWt.path);
		expect(dirtyRemove.ok).toBe(false);
		expect(existsSync(mainWt.path)).toBe(true);

		const cleanRemove = await removeWorktreeFolder(repo, nestedWt.path);
		expect(cleanRemove.ok).toBe(true);
		expect(existsSync(nestedWt.path)).toBe(false);
		expect(existsSync(join(worktreeRoot(repo), 'feat'))).toBe(false);
		expect(await branchExists(repo, 'feat/sub/task')).toBe(true);
	});
});
