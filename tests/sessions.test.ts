import {afterAll, beforeAll, describe, expect, test} from 'bun:test';
import {mkdtempSync, realpathSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {agentsTmuxConf} from '../src/bootstrap/tmuxConf.ts';
import {exec} from '../src/infra/exec.ts';
import {createTmux} from '../src/infra/tmux.ts';
import {closeSession, createSession, listSessions, parseSessionLine} from '../src/services/sessions.ts';

// A private tmux socket and a throwaway repository; never the user's server.
const base = realpathSync(mkdtempSync(join(tmpdir(), 'ap-sess-')));
const repo = join(base, '商店-api');
const conf = join(base, 'agents.tmux.conf');
const tmux = createTmux(`agentpulse-test-${process.pid}`);

beforeAll(async () => {
	writeFileSync(conf, agentsTmuxConf());
	await exec(['git', 'init', '-q', '-b', 'feat/購物車', repo]);
});

afterAll(async () => {
	await tmux.run(['kill-server']);
});

const base_opts = {agent: 'claude', project: repo, cwd: repo, confPath: conf, width: 80, height: 24};

describe('sessions', () => {
	test('no server yet is an empty list, not a failure', async () => {
		expect(await listSessions(tmux)).toEqual([]);
	});

	test('create writes metadata that a fresh listing reads back', async () => {
		const created = await createSession(tmux, {...base_opts, command: ['sh', '-c', 'sleep 30']});
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		const sessions = await listSessions(tmux);
		expect(sessions).toHaveLength(1);
		expect(sessions?.[0]).toMatchObject({
			id: created.id,
			agent: 'claude',
			project: repo,
			cwd: repo,
			branch: 'feat/購物車',
			worktree: false,
			dead: false,
			exitStatus: null,
		});
		expect(await tmux.out(['show', '-v', '-t', `=${created.id}:`, '@ap-agent'])).toBe('claude');
		expect(await closeSession(tmux, created.id)).toBe(true);
		expect(await listSessions(tmux)).toEqual([]);
	});

	test('an exited AI stays listed with its exit status and the exit line', async () => {
		const created = await createSession(tmux, {...base_opts, command: ['sh', '-c', 'exit 3']});
		if (!created.ok) throw new Error(created.error);
		await Bun.sleep(300);
		const [record] = (await listSessions(tmux)) ?? [];
		expect(record).toMatchObject({id: created.id, dead: true, exitStatus: 3});
		const screen = await tmux.out(['capture-pane', '-p', '-t', `=${created.id}:`]);
		expect(screen).toContain('AI exited (status 3)');
		await closeSession(tmux, created.id);
	});

	test('sessions without our metadata are ignored', async () => {
		await tmux.run(['new-session', '-d', '-s', 'agentpulse-manual', 'sleep 30']);
		await tmux.run(['new-session', '-d', '-s', 'other', 'sleep 30']);
		expect(await listSessions(tmux)).toEqual([]);
		expect(await closeSession(tmux, 'other')).toBe(false);
	});

	test('unknown agents and missing binaries are refused', async () => {
		expect(await createSession(tmux, {...base_opts, agent: 'nope'})).toEqual({ok: false, error: 'Unknown AI: nope'});
	});

	test('line parsing', () => {
		expect(parseSessionLine('agentpulse-x\t0\t\tclaude\t/p\t\tmain\t1\t5')).toMatchObject({cwd: '/p', worktree: true, created: 5});
		expect(parseSessionLine('random\t0\t\tclaude\t/p\t/p\tmain\t0\t5')).toBeNull();
		expect(parseSessionLine('')).toBeNull();
	});
});
