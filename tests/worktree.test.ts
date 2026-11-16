import {afterAll, beforeAll, describe, expect, test} from 'bun:test';
import {existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {exec} from '../src/infra/exec.ts';
import {missingOrEmptyDir, removeEmptyDirs} from '../src/infra/fsx.ts';
import {branchExists, currentBranch, statusEntries} from '../src/infra/git.ts';
import {checkCreate, createWorktree, planMerge, runMerge, worktreePath, worktreeRoot, type MergeTarget} from '../src/services/worktree.ts';

// Every repository here is a throwaway under the system temp folder; the
// user's git configuration is kept out so hooks or signing cannot interfere.
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
// A fresh repository with one commit on `main`.
async function newRepo(name = '商店-api'): Promise<string> {
	const repo = join(base, `r${++counter}`, name);
	mkdirSync(repo, {recursive: true});
	await git(repo, 'init', '-q', '-b', 'main');
	await git(repo, 'config', 'user.name', 'tester');
	await git(repo, 'config', 'user.email', 'tester@example.invalid');
	writeFileSync(join(repo, 'cart.ts'), 'export const total = 1;\n');
	writeFileSync(join(repo, '.gitignore'), '.env\nnode_modules/\n');
	await git(repo, 'add', '.');
	await git(repo, 'commit', '-qm', 'init');
	return repo;
}

async function newWorktree(repo: string, branch: string): Promise<MergeTarget> {
	const made = await createWorktree(repo, branch);
	if (!made.ok) throw new Error(`createWorktree: ${made.error.key}`);
	return {project: repo, cwd: made.path, base: made.base, worktree: true, running: false};
}

// Stands in for closing the tmux session; counts how often it was asked.
function closer(result = true) {
	const calls = {count: 0};
	return {calls, deps: {closeSession: async () => (calls.count++, result)}};
}

describe('worktree paths', () => {
	test('next to the project, under <name>.worktrees, nested by branch', () => {
		expect(worktreeRoot('/w/shop-api')).toBe('/w/shop-api.worktrees');
		expect(worktreePath('/w/shop-api', 'feat/checkout')).toBe('/w/shop-api.worktrees/feat/checkout');
		expect(worktreePath('/w/商店', ' 修正/登入 ')).toBe('/w/商店.worktrees/修正/登入');
	});

	test('empty folders are tidied upwards and anything with content is left', () => {
		const root = join(base, 'tidy.worktrees');
		mkdirSync(join(root, 'feat', 'deep'), {recursive: true});
		mkdirSync(join(root, 'keep'));
		expect(missingOrEmptyDir(join(root, 'feat', 'deep'))).toBe(true);
		expect(missingOrEmptyDir(join(root, 'feat'))).toBe(false);
		expect(missingOrEmptyDir(join(root, 'nothing-here'))).toBe(true);
		removeEmptyDirs(join(root, 'feat', 'deep'), root);
		expect(existsSync(join(root, 'feat'))).toBe(false);
		// `keep` is still inside, so the root stays.
		expect(existsSync(root)).toBe(true);
		removeEmptyDirs(join(root, 'keep'), root);
		expect(existsSync(root)).toBe(false);
		// Never climbs above the stop folder.
		expect(existsSync(base)).toBe(true);
	});
});

describe('creating a worktree', () => {
	test('refusals leave nothing behind', async () => {
		const repo = await newRepo();
		await git(repo, 'branch', 'taken');
		mkdirSync(join(worktreePath(repo, 'occupied')), {recursive: true});
		writeFileSync(join(worktreePath(repo, 'occupied'), 'note.txt'), 'x');
		expect(await checkCreate(repo, '  ')).toEqual({ok: false, error: {key: 'branchEmpty'}});
		for (const bad of ['has space', 'a..b', '-x', 'x.lock', 'end/']) {
			expect(await checkCreate(repo, bad)).toEqual({ok: false, error: {key: 'branchInvalid'}});
		}
		expect(await checkCreate(repo, 'taken')).toEqual({ok: false, error: {key: 'branchExists', arg: 'taken'}});
		expect(await checkCreate(repo, 'occupied')).toEqual({ok: false, error: {key: 'folderExists', arg: worktreePath(repo, 'occupied')}});
		expect(await createWorktree(repo, 'taken')).toMatchObject({ok: false});
		expect(await git(repo, 'worktree', 'list', '--porcelain')).not.toContain('.worktrees');
	});

	test('needs a branch to start from and at least one commit', async () => {
		const repo = await newRepo();
		await git(repo, 'checkout', '-q', '--detach');
		expect(await checkCreate(repo, 'feat/x')).toEqual({ok: false, error: {key: 'mainNoBranch'}});
		const empty = join(base, 'empty-repo');
		mkdirSync(empty);
		await git(empty, 'init', '-q', '-b', 'main');
		expect(await checkCreate(empty, 'feat/x')).toEqual({ok: false, error: {key: 'noCommits'}});
		expect(await checkCreate(join(base, 'no-such-folder'), 'feat/x')).toEqual({ok: false, error: {key: 'mainNoBranch'}});
	});

	test('creates the branch from the main folder\'s branch, in the expected folder', async () => {
		const repo = await newRepo();
		await git(repo, 'checkout', '-q', '-b', 'dev');
		const made = await createWorktree(repo, ' 功能/購物車 ');
		expect(made).toEqual({ok: true, branch: '功能/購物車', base: 'dev', path: join(`${repo}.worktrees`, '功能', '購物車')});
		if (!made.ok) return;
		expect(await currentBranch(made.path)).toBe('功能/購物車');
		expect(await git(made.path, 'rev-parse', 'HEAD')).toBe(await git(repo, 'rev-parse', 'dev'));
		// The main folder is untouched.
		expect(await currentBranch(repo)).toBe('dev');
		expect(await statusEntries(repo)).toEqual([]);
		// An empty folder left by an earlier branch is fine to reuse.
		mkdirSync(worktreePath(repo, 'reuse-me'), {recursive: true});
		expect(await createWorktree(repo, 'reuse-me')).toMatchObject({ok: true});
	});

	test('reuses an existing worktree folder on that branch', async () => {
		const repo = await newRepo();
		const made = await createWorktree(repo, 'feat/reuse');
		expect(made.ok).toBe(true);
		const reused = await createWorktree(repo, 'feat/reuse');
		expect(reused).toEqual(made);
	});
});

describe('merge checks', () => {
	test('only a worktree made with w, and never while the AI is running', async () => {
		const repo = await newRepo();
		const target = await newWorktree(repo, 'feat/a');
		expect(await planMerge({...target, worktree: false})).toEqual({ok: false, error: {key: 'notWorktree'}});
		expect(await planMerge({...target, base: ''})).toEqual({ok: false, error: {key: 'notWorktree'}});
		expect(await planMerge({...target, cwd: repo})).toEqual({ok: false, error: {key: 'notWorktree'}});
		expect(await planMerge({...target, running: true})).toEqual({ok: false, error: {key: 'aiRunning'}});
		expect(await planMerge({...target, cwd: join(base, 'gone')})).toEqual({ok: false, error: {key: 'worktreeMissing', arg: join(base, 'gone')}});
	});

	test('the plan counts what would be committed and names ignored files', async () => {
		const repo = await newRepo();
		const target = await newWorktree(repo, 'feat/a');
		expect(await planMerge(target)).toEqual({
			ok: true,
			plan: {branch: 'feat/a', base: 'main', project: repo, path: target.cwd, dirty: 0, ignored: []},
		});
		writeFileSync(join(target.cwd, 'cart.ts'), 'export const total = 2;\n');
		mkdirSync(join(target.cwd, 'src'));
		writeFileSync(join(target.cwd, 'src', '新檔.ts'), 'x\n');
		writeFileSync(join(target.cwd, '.env'), 'SECRET=1\n');
		mkdirSync(join(target.cwd, 'node_modules'));
		writeFileSync(join(target.cwd, 'node_modules', 'pkg.js'), 'x\n');
		const check = await planMerge(target);
		expect(check).toMatchObject({ok: true, plan: {dirty: 2}});
		if (check.ok) expect([...check.plan.ignored].sort()).toEqual(['.env', 'node_modules/']);
	});

	test('the main folder must be on the base branch with no tracked changes', async () => {
		const repo = await newRepo();
		const target = await newWorktree(repo, 'feat/a');
		await git(repo, 'checkout', '-q', '-b', 'other');
		expect(await planMerge(target)).toEqual({ok: false, error: {key: 'mainNotOnBase', arg: 'main', arg2: 'other'}});
		await git(repo, 'checkout', '-q', 'main');
		// An untracked file in the main folder does not block.
		writeFileSync(join(repo, 'notes.txt'), 'scratch\n');
		expect(await planMerge(target)).toMatchObject({ok: true});
		writeFileSync(join(repo, 'cart.ts'), 'export const total = 9;\n');
		expect(await planMerge(target)).toEqual({ok: false, error: {key: 'mainDirty'}});
		await git(repo, 'add', 'cart.ts');
		expect(await planMerge(target)).toEqual({ok: false, error: {key: 'mainDirty'}});
	});

	test('a merge the user already has going is never touched', async () => {
		const repo = await newRepo();
		const target = await newWorktree(repo, 'feat/a');
		// The user's own half-finished merge of another branch.
		await git(repo, 'checkout', '-q', '-b', 'theirs');
		writeFileSync(join(repo, 'cart.ts'), 'export const total = 5;\n');
		await git(repo, 'commit', '-qam', 'theirs');
		await git(repo, 'checkout', '-q', 'main');
		writeFileSync(join(repo, 'cart.ts'), 'export const total = 6;\n');
		await git(repo, 'commit', '-qam', 'ours');
		await exec(['git', '-C', repo, 'merge', '--no-edit', 'theirs']);
		const {calls, deps} = closer();
		expect(await runMerge(target, '', deps)).toEqual({kind: 'blocked', error: {key: 'mainMerging'}});
		// Still mid-merge: nothing aborted it.
		expect((await exec(['git', '-C', repo, 'rev-parse', '--verify', '--quiet', 'MERGE_HEAD'])).ok).toBe(true);
		expect(calls.count).toBe(0);
	});
});

describe('running the merge', () => {
	test('clean branch: merge commit on the base, session closed, folder and branch gone', async () => {
		const repo = await newRepo();
		const target = await newWorktree(repo, 'feat/a');
		writeFileSync(join(target.cwd, 'cart.ts'), 'export const total = 2;\n');
		await git(target.cwd, 'commit', '-qam', 'change');
		const {calls, deps} = closer();
		expect(await runMerge(target, '', deps)).toEqual({kind: 'merged', branch: 'feat/a', base: 'main'});
		expect(calls.count).toBe(1);
		// --no-ff: a real merge commit with two parents.
		expect((await git(repo, 'rev-list', '--parents', '-n', '1', 'HEAD')).split(' ')).toHaveLength(3);
		expect(await git(repo, 'show', 'HEAD:cart.ts')).toBe('export const total = 2;');
		expect(existsSync(target.cwd)).toBe(false);
		expect(await branchExists(repo, 'feat/a')).toBe(false);
		// The "feat" folder and the .worktrees folder were empty and are gone too.
		expect(existsSync(worktreeRoot(repo))).toBe(false);
		expect(await statusEntries(repo)).toEqual([]);
	});

	test('uncommitted changes need a message, then are committed with new files', async () => {
		const repo = await newRepo();
		const target = await newWorktree(repo, 'fix-登入');
		writeFileSync(join(target.cwd, 'cart.ts'), 'export const total = 3;\n');
		writeFileSync(join(target.cwd, '新檔.ts'), 'new\n');
		const first = closer();
		expect(await runMerge(target, '   ', first.deps)).toEqual({kind: 'blocked', error: {key: 'needMessage'}});
		expect(first.calls.count).toBe(0);
		// Refused before anything was staged or committed.
		expect(await git(target.cwd, 'rev-list', '--count', 'main..HEAD')).toBe('0');
		const second = closer();
		expect(await runMerge(target, ' 修正登入 ', second.deps)).toEqual({kind: 'merged', branch: 'fix-登入', base: 'main'});
		expect(await git(repo, 'log', '--format=%s', '-n', '1', 'HEAD')).toBe("Merge branch 'fix-登入'");
		// The merged-in side is the commit made from the message.
		expect(await git(repo, 'log', '--format=%s', '-n', '1', 'HEAD^2')).toBe('修正登入');
		expect(await git(repo, 'show', 'HEAD:新檔.ts')).toBe('new');
		expect(existsSync(target.cwd)).toBe(false);
	});

	test('conflict: the merge is undone, files are named, nothing is deleted', async () => {
		const repo = await newRepo();
		const target = await newWorktree(repo, 'feat/a');
		writeFileSync(join(target.cwd, 'cart.ts'), 'export const total = 2;\n');
		writeFileSync(join(repo, 'cart.ts'), 'export const total = 7;\n');
		await git(repo, 'commit', '-qam', 'main moved');
		const mainHead = await git(repo, 'rev-parse', 'HEAD');
		const {calls, deps} = closer();
		expect(await runMerge(target, 'wip', deps)).toEqual({
			kind: 'conflict',
			branch: 'feat/a',
			files: ['cart.ts'],
			aborted: true,
			committed: true,
		});
		expect(calls.count).toBe(0);
		// The main folder is exactly where it was.
		expect(await git(repo, 'rev-parse', 'HEAD')).toBe(mainHead);
		expect(await statusEntries(repo)).toEqual([]);
		expect((await exec(['git', '-C', repo, 'rev-parse', '--verify', '--quiet', 'MERGE_HEAD'])).ok).toBe(false);
		// Folder, branch and the commit made on the way are all still there.
		expect(existsSync(join(target.cwd, 'cart.ts'))).toBe(true);
		expect(await branchExists(repo, 'feat/a')).toBe(true);
		expect(await git(target.cwd, 'log', '--format=%s', '-n', '1')).toBe('wip');
	});

	test('git refusing to start is reported as such, with nothing to undo', async () => {
		const repo = await newRepo();
		const target = await newWorktree(repo, 'feat/a');
		writeFileSync(join(target.cwd, 'added.ts'), 'from the branch\n');
		await git(target.cwd, 'add', '.');
		await git(target.cwd, 'commit', '-qm', 'add file');
		// An untracked file of the same name in the main folder would be overwritten.
		writeFileSync(join(repo, 'added.ts'), 'mine\n');
		const {calls, deps} = closer();
		const outcome = await runMerge(target, '', deps);
		expect(outcome).toMatchObject({kind: 'merge-failed', branch: 'feat/a', committed: false});
		if (outcome.kind === 'merge-failed') expect(outcome.detail).not.toBe('');
		expect(calls.count).toBe(0);
		expect(await Bun.file(join(repo, 'added.ts')).text()).toBe('mine\n');
		expect(await branchExists(repo, 'feat/a')).toBe(true);
		expect(existsSync(target.cwd)).toBe(true);
	});

	test('cleanup stops at the first step that fails and never forces', async () => {
		const repo = await newRepo();
		const stuck = await newWorktree(repo, 'feat/a');
		writeFileSync(join(stuck.cwd, 'cart.ts'), 'export const total = 2;\n');
		await git(stuck.cwd, 'commit', '-qam', 'change');
		expect(await runMerge(stuck, '', closer(false).deps)).toEqual({kind: 'cleanup-failed', step: 'close', base: 'main', detail: ''});
		expect(existsSync(stuck.cwd)).toBe(true);
		expect(await branchExists(repo, 'feat/a')).toBe(true);

		// A file that appears while the session is closing: git will not remove the folder.
		const late = await newWorktree(repo, 'feat/b');
		writeFileSync(join(late.cwd, 'b.ts'), 'b\n');
		await git(late.cwd, 'add', '.');
		await git(late.cwd, 'commit', '-qm', 'b');
		const outcome = await runMerge(late, '', {
			closeSession: async () => {
				writeFileSync(join(late.cwd, 'server.log'), 'written late\n');
				return true;
			},
		});
		expect(outcome).toMatchObject({kind: 'cleanup-failed', step: 'folder', base: 'main'});
		expect(await Bun.file(join(late.cwd, 'server.log')).text()).toBe('written late\n');
		expect(await branchExists(repo, 'feat/b')).toBe(true);
		// The merge itself went through.
		expect(await git(repo, 'show', 'HEAD:b.ts')).toBe('b');
	});
});
