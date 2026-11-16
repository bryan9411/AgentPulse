import {describe, expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {claude} from '../src/agents/claude.ts';
import {agy} from '../src/agents/agy.ts';
import {DEFAULT_CONFIG} from '../src/config/config.ts';
import {exec} from '../src/infra/exec.ts';
import {hostFs, readHead, readTail} from '../src/infra/fsx.ts';
import {gitStats, parseShortstat} from '../src/infra/git.ts';
import {parseCwds, parseLsof, parsePs} from '../src/infra/platform/darwin.ts';
import {readAccounts} from '../src/services/accounts.ts';
import {gitDue, rulesPresence} from '../src/services/details.ts';
import {descendants, sessionPorts} from '../src/services/ports.ts';
import * as A from '../src/state/actions.ts';

describe('ports', () => {
	// 程序樹：launchd → zsh → claude(100) → npm(101) → node(102)，claude 底下另跑一個 MCP server(103)
	const tree = [
		{pid: 1, ppid: 0, command: 'launchd'},
		{pid: 100, ppid: 50, command: 'claude'},
		{pid: 101, ppid: 100, command: 'npm run dev'},
		{pid: 102, ppid: 101, command: 'node vite'},
		{pid: 103, ppid: 100, command: 'mcp-server'},
		{pid: 200, ppid: 1, command: 'postgres'},
	];

	test('descendants exclude the root', () => {
		expect([...descendants(100, tree)].sort()).toEqual([101, 102, 103]);
		expect(descendants(999, tree).size).toBe(0);
	});

	test('ports of the tree, plus listening ports named on screen', () => {
		const listening = [
			{pid: 100, port: 45000}, // AI 自己的 socket
			{pid: 102, port: 5173},
			{pid: 200, port: 5432},
			{pid: 300, port: 8080},
		];
		const base = {root: 100, agents: new Set([100]), folder: '/w/shop', tree, listening, cwds: new Map<number, string>(), screen: null};
		expect(sessionPorts(base)).toEqual([5173]);
		const screen = 'Server ready at http://localhost:8080/ and localhost:9999 (not open), 127.0.0.1:5432';
		expect(sessionPorts({...base, screen})).toEqual([5173, 5432, 8080]);
		expect(sessionPorts({...base, root: 0})).toEqual([]);
	});

	test('a re-parented server counts when it works inside the session folder', () => {
		const listening = [{pid: 400, port: 8765}, {pid: 401, port: 9000}, {pid: 402, port: 9001}, {pid: 100, port: 45000}, {pid: 500, port: 56075}];
		const cwds = new Map([
			[400, '/w/shop/site'],
			[401, '/w/shop-other'],
			[402, '/w/shop'],
			[100, '/w/shop'],
			[500, '/w/shop'],
		]);
		// 同資料夾內不論是自己或另一支 AI（pid 500）開的 socket 都不算開發伺服器
		const agents = new Set([100, 500]);
		expect(sessionPorts({root: 100, agents, folder: '/w/shop', tree, listening, cwds, screen: null})).toEqual([8765, 9001]);
	});

	test('lsof and ps output parse', () => {
		const lsof = 'p565\nf7\nn127.0.0.1:80\nf8\nn[::1]:3000\nf9\nn*:3000\np777\nf4\nn*:5173\n';
		expect(parseLsof(lsof)).toEqual([
			{pid: 565, port: 80},
			{pid: 565, port: 3000},
			{pid: 777, port: 5173},
		]);
		expect(parseCwds('p3362\nfcwd\nn/w/商店\np5\nfcwd\nn/\n')).toEqual(new Map([[3362, '/w/商店'], [5, '/']]));
		expect(parsePs('    1     0 /sbin/launchd\n  118 99383 /bin/zsh -c echo hi\n')).toEqual([
			{pid: 1, ppid: 0, command: '/sbin/launchd'},
			{pid: 118, ppid: 99383, command: '/bin/zsh -c echo hi'},
		]);
	});
});

describe('git stats', () => {
	test('shortstat parsing', () => {
		expect(parseShortstat(' 3 files changed, 10 insertions(+), 2 deletions(-)\n')).toEqual({added: 10, removed: 2});
		expect(parseShortstat(' 1 file changed, 1 insertion(+)\n')).toEqual({added: 1, removed: 0});
		expect(parseShortstat('')).toEqual({added: 0, removed: 0});
	});

	test('counts changes and untracked files in a throwaway repository', async () => {
		const repo = join(realpathSync(mkdtempSync(join(tmpdir(), 'ap-stats-'))), '商店');
		mkdirSync(repo);
		const env = {...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid', GIT_CONFIG_GLOBAL: '/dev/null'};
		const git = async (...args: string[]) => {
			const r = await exec(['git', '-C', repo, ...args], {env});
			if (!r.ok) throw new Error(r.message);
		};
		try {
			await git('init', '-q', '-b', 'feat/購物車');
			writeFileSync(join(repo, 'a.txt'), '1\n2\n3\n');
			expect(await gitStats(repo)).toEqual({branch: 'feat/購物車', added: 0, removed: 0, untracked: 1});
			await git('add', '.');
			await git('commit', '-qm', 'init');
			expect(await gitStats(repo)).toEqual({branch: 'feat/購物車', added: 0, removed: 0, untracked: 0});
			writeFileSync(join(repo, 'a.txt'), '1\nx\n3\n4\n');
			writeFileSync(join(repo, '新檔.md'), 'n');
			writeFileSync(join(repo, '.gitignore'), 'ignored\n');
			writeFileSync(join(repo, 'ignored'), 'i');
			expect(await gitStats(repo)).toEqual({branch: 'feat/購物車', added: 2, removed: 1, untracked: 2});
			expect(await gitStats(join(repo, '..'))).toBeNull();
		} finally {
			rmSync(join(repo, '..'), {recursive: true, force: true});
		}
	});

	test('the selected session is refreshed every 5 s, the rest every 30 s', () => {
		expect(gitDue(undefined, false, 0)).toBe(true);
		expect(gitDue({gitAt: 0}, true, 5000)).toBe(true);
		expect(gitDue({gitAt: 0}, false, 5000)).toBe(false);
		expect(gitDue({gitAt: 0}, false, 30_000)).toBe(true);
	});
});

describe('files on disk', () => {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ap-files-')));

	test('readTail returns the end of a file', () => {
		const path = join(dir, 'log.jsonl');
		writeFileSync(path, 'a'.repeat(100) + 'END');
		expect(readTail(path, 3)).toBe('END');
		expect(readTail(path, 10_000)?.length).toBe(103);
		expect(readTail(join(dir, 'missing'), 3)).toBeNull();
		expect(readHead(path, 3)).toBe('aaa');
		expect(readHead(path, 10_000)?.length).toBe(103);
		expect(readHead(join(dir, 'missing'), 3)).toBeNull();
	});

	test('rules file: first match by name, else the first name as missing', () => {
		const fs = hostFs(dir, {});
		mkdirSync(join(dir, 'w', '.claude'), {recursive: true});
		expect(rulesPresence(claude, fs, join(dir, 'w'))).toEqual({name: 'CLAUDE.md', present: false});
		writeFileSync(join(dir, 'w', '.claude', 'CLAUDE.md'), '');
		expect(rulesPresence(claude, fs, join(dir, 'w'))).toEqual({name: 'CLAUDE.md', present: true});
		writeFileSync(join(dir, 'w', 'AGENTS.md'), '');
		expect(rulesPresence(agy, fs, join(dir, 'w'))).toEqual({name: 'AGENTS.md', present: true});
	});

	test('accounts: codex is left unchecked', () => {
		const marks = readAccounts(hostFs(dir, {ANTHROPIC_API_KEY: 'k'}));
		expect(marks).toEqual([
			{id: 'claude', signedIn: true},
			{id: 'codex', signedIn: null},
			{id: 'agy', signedIn: false},
		]);
	});
});

describe('details in state', () => {
	const session = {id: 's1', project: '/w', cwd: '/w', branch: 'main', agent: 'claude', dead: false, exitStatus: null, created: 1, agentSession: '', worktree: false, base: ''};
	test('merge per part, ignore unchanged results and closed sessions', () => {
		let s = A.setSessions(A.initialState({...DEFAULT_CONFIG, projects: ['/w']}), [session]);
		s = A.setDetails(s, 's1', {ports: [3000]});
		s = A.setDetails(s, 's1', {info: {model: 'm', effort: null, context: null}});
		expect(s.details.s1).toEqual({ports: [3000], info: {model: 'm', effort: null, context: null}});
		expect(A.setDetails(s, 's1', {ports: [3000]})).toBe(s);
		expect(A.setDetails(s, 'gone', {ports: [1]})).toBe(s);
		expect(A.setSessions(s, []).details).toEqual({});
	});
});
