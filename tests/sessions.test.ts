import {afterAll, beforeAll, describe, expect, test} from 'bun:test';
import {mkdtempSync, realpathSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {agentsTmuxConf} from '../src/bootstrap/tmuxConf.ts';
import {exec} from '../src/infra/exec.ts';
import {createTmux} from '../src/infra/tmux.ts';
import {closeSession, createSession, listSessions, parseSessionLine, reloadSessionConf, respawnSession} from '../src/services/sessions.ts';

// 使用測試專用 socket 與暫存儲存庫，絕不碰使用者的背景 server
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
			dead: false,
			exitStatus: null,
		});
		expect(await tmux.out(['show', '-v', '-t', `=${created.id}:`, '@ap-agent'])).toBe('claude');
		expect(sessions?.[0]?.agentSession).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		expect(await closeSession(tmux, created.id)).toBe(true);
		expect(await listSessions(tmux)).toEqual([]);
	});

	test('an exited AI stays listed with its exit status and the exit line', async () => {
		const created = await createSession(tmux, {...base_opts, command: ['sh', '-c', 'exit 3']});
		if (!created.ok) throw new Error(created.error.key);
		await Bun.sleep(300);
		const [record] = (await listSessions(tmux)) ?? [];
		expect(record).toMatchObject({id: created.id, dead: true, exitStatus: 3});
		const screen = await tmux.out(['capture-pane', '-p', '-t', `=${created.id}:`]);
		expect(screen).toContain('AI exited (status 3)');
		await closeSession(tmux, created.id);
	});

	test('switching language reloads the exit line for later exits', async () => {
		const zhConf = join(base, 'agents.zh.tmux.conf');
		writeFileSync(zhConf, agentsTmuxConf('zh-TW'));
		const before = await createSession(tmux, {...base_opts, command: ['sh', '-c', 'sleep 0.5; exit 4']});
		if (!before.ok) throw new Error(before.error.key);
		await reloadSessionConf(tmux, zhConf);
		await Bun.sleep(900);
		const screen = await tmux.out(['capture-pane', '-p', '-t', `=${before.id}:`]);
		expect(screen).toContain('AI 已結束（結束碼 4）');
		await closeSession(tmux, before.id);
		await reloadSessionConf(tmux, conf);
	});

	test('respawnSession reactivates a dead pane', async () => {
		const created = await createSession(tmux, {...base_opts, command: ['sh', '-c', 'exit 0']});
		if (!created.ok) throw new Error(created.error.key);
		await Bun.sleep(200);
		const [deadRecord] = (await listSessions(tmux)) ?? [];
		expect(deadRecord?.dead).toBe(true);
		const respawned = await respawnSession(tmux, {id: created.id, agent: 'claude', cwd: repo}, ['sh', '-c', 'sleep 30']);
		expect(respawned.ok).toBe(true);
		await Bun.sleep(200);
		const [aliveRecord] = (await listSessions(tmux)) ?? [];
		expect(aliveRecord?.dead).toBe(false);
		await closeSession(tmux, created.id);
	});

	test('sessions without our metadata are ignored', async () => {
		await tmux.run(['new-session', '-d', '-s', 'agentpulse-manual', 'sleep 30']);
		await tmux.run(['new-session', '-d', '-s', 'other', 'sleep 30']);
		expect(await listSessions(tmux)).toEqual([]);
		expect(await closeSession(tmux, 'other')).toBe(false);
	});

	test('unknown agents and missing binaries are refused', async () => {
		expect(await createSession(tmux, {...base_opts, agent: 'nope'})).toEqual({ok: false, error: {key: 'unknownAgent', arg: 'nope'}});
	});

	test('line parsing', () => {
		expect(parseSessionLine('agentpulse-x\t0\t\tclaude\t/p\t\tmain\t5')).toMatchObject({cwd: '/p', branch: 'main', created: 5});
		expect(parseSessionLine('random\t0\t\tclaude\t/p\t/p\tmain\t5')).toBeNull();
		expect(parseSessionLine('')).toBeNull();
	});
});
