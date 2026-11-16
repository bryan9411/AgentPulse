import {beforeAll, describe, expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, realpathSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configFile, loadConfig} from '../src/config/config.ts';
import {exec} from '../src/infra/exec.ts';
import {projectRoot} from '../src/infra/git.ts';
import {addProject, addProjectFromCwd, removeProject} from '../src/services/projects.ts';

// Every git test runs in a throwaway repository under the system temp folder.
const base = realpathSync(mkdtempSync(join(tmpdir(), 'ap-git-')));
const repo = join(base, '商店-api');
const worktree = join(base, 'wt-feature');
const plain = join(base, 'not-a-repo');
const env = {
	...process.env,
	GIT_AUTHOR_NAME: 't',
	GIT_AUTHOR_EMAIL: 't@example.invalid',
	GIT_COMMITTER_NAME: 't',
	GIT_COMMITTER_EMAIL: 't@example.invalid',
	GIT_CONFIG_GLOBAL: '/dev/null',
};
const git = async (...args: string[]) => {
	const r = await exec(['git', '-C', repo, ...args], {env});
	if (!r.ok) throw new Error(r.message);
};

beforeAll(async () => {
	mkdirSync(join(repo, 'src'), {recursive: true});
	mkdirSync(plain);
	await git('init', '-q', '-b', 'main');
	writeFileSync(join(repo, 'README'), 'x');
	await git('add', '.');
	await git('commit', '-qm', 'init');
	await git('worktree', 'add', '-q', '-b', 'feature', worktree);
});

describe('projectRoot', () => {
	test('returns the repository root from a subfolder', async () => {
		expect(await projectRoot(join(repo, 'src'))).toBe(repo);
	});

	test('a linked worktree resolves to the main folder', async () => {
		expect(await projectRoot(worktree)).toBe(repo);
	});

	test('a plain folder is not a project', async () => {
		expect(await projectRoot(plain)).toBeNull();
	});
});

describe('addProject', () => {
	test('validates input and registers the repository root once', async () => {
		const dir = join(base, 'config-a');
		expect(await addProject('  ', dir)).toEqual({ok: false, error: {key: 'enterPath'}});
		expect(await addProject(join(base, 'missing'), dir)).toEqual({ok: false, error: {key: 'folderNotFound'}});
		expect(await addProject(plain, dir)).toEqual({ok: false, error: {key: 'notRepo'}});

		const first = await addProject(join(repo, 'src'), dir);
		expect(first.ok && first.path).toBe(repo);
		const again = await addProject(worktree, dir);
		expect(again.ok && again.config.projects).toEqual([repo]);
		expect(loadConfig(dir).config.projects).toEqual([repo]);
	});

	test('refuses to overwrite an invalid config file', async () => {
		const dir = join(base, 'config-b');
		loadConfig(dir);
		writeFileSync(configFile(dir), 'not json');
		expect(await addProject(repo, dir)).toEqual({ok: false, error: {key: 'configInvalidFix'}});
	});

	test('launching outside a repository adds nothing', async () => {
		const dir = join(base, 'config-c');
		expect(await addProjectFromCwd(plain, dir)).toBeNull();
		const r = await addProjectFromCwd(repo, dir);
		expect(r?.ok && r.config.projects).toEqual([repo]);
	});

	test('removeProject removes project from config', async () => {
		const dir = join(base, 'config-d');
		await addProject(repo, dir);
		expect(loadConfig(dir).config.projects).toEqual([repo]);

		const res = removeProject(repo, dir);
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.config.projects).toEqual([]);
		expect(loadConfig(dir).config.projects).toEqual([]);
	});
});
