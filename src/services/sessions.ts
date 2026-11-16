import {AGENTS, getAgent} from '../agents/index.ts';
import {resolveBin} from '../infra/exec.ts';
import {hostFs} from '../infra/fsx.ts';
import {currentBranch} from '../infra/git.ts';
import {platform} from '../infra/platform/index.ts';
import type {Tmux} from '../infra/tmux.ts';
import {msg, type Message} from '../i18n/strings.ts';

export const SESSION_PREFIX = 'agentpulse-';

// 不另存狀態檔，全部中繼資料都存在 tmux session user option 裡，重啟時直接讀回
export type SessionMeta = {
	agent: string;
	project: string;
	cwd: string;
	branch: string;
	worktree: boolean;
	created: number;
	agentSession: string;
};

export type SessionRecord = SessionMeta & {
	id: string;
	dead: boolean;
	exitStatus: number | null;
	pid: number;
};

const FIELDS = [
	'#{session_name}',
	'#{pane_dead}',
	'#{pane_dead_status}',
	'#{@ap-agent}',
	'#{@ap-project}',
	'#{@ap-cwd}',
	'#{@ap-branch}',
	'#{@ap-worktree}',
	'#{@ap-created}',
	'#{pane_pid}',
	'#{@ap-agent-session}',
] as const;
const SEP = '\t';

export function metaOptions(meta: SessionMeta): Array<[string, string]> {
	return [
		['@ap-agent', meta.agent],
		['@ap-project', meta.project],
		['@ap-cwd', meta.cwd],
		['@ap-branch', meta.branch],
		['@ap-worktree', meta.worktree ? '1' : '0'],
		['@ap-created', String(meta.created)],
		['@ap-agent-session', meta.agentSession],
	];
}

// 過濾掉手動開在同一座 socket 上、或 metadata 尚未寫完而沒有 @ap-agent 的 session
export function parseSessionLine(line: string): SessionRecord | null {
	const [id, dead, status, agent, project, cwd, branch, worktree, created, pid, agentSession] = line.split(SEP);
	if (!id?.startsWith(SESSION_PREFIX) || !agent || !project) return null;
	const isDead = dead === '1';
	const code = Number.parseInt(status ?? '', 10);
	return {
		id,
		agent,
		project,
		cwd: cwd || project,
		branch: branch ?? '',
		worktree: worktree === '1',
		created: Number(created) || 0,
		dead: isDead,
		exitStatus: isDead && Number.isFinite(code) ? code : null,
		pid: Number(pid) || 0,
		agentSession: agentSession ?? '',
	};
}

const NO_SERVER = /no server running|error connecting|no such file or directory/i;

// 回傳 null 表示查詢失敗（呼叫端應保留舊清單）；回傳 [] 表示確定沒有任何工作階段或 server 尚未啟動
export async function listSessions(tmux: Tmux): Promise<SessionRecord[] | null> {
	const result = await tmux.run(['list-panes', '-a', '-F', FIELDS.join(SEP)]);
	if (!result.ok) return NO_SERVER.test(result.stderr) ? [] : null;
	const seen = new Set<string>();
	const sessions: SessionRecord[] = [];
	for (const line of result.stdout.split('\n')) {
		const record = parseSessionLine(line);
		// 每個工作階段只應有一個窗格，避免手動多開的窗格讓清單重複出現
		if (!record || seen.has(record.id)) continue;
		seen.add(record.id);
		sessions.push(record);
	}
	return sessions.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
}

export type AgentChoice = {id: string; name: string; installed: boolean};

export function agentChoices(path = process.env.PATH): AgentChoice[] {
	return AGENTS.map(agent => ({
		id: agent.id,
		name: agent.displayName,
		installed: resolveBin(agent.binary, platform.binDirs, path) !== null,
	}));
}

export function newSessionId(now = Date.now()): string {
	return `${SESSION_PREFIX}${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;
}

export type CreateOptions = {
	agent: string;
	project: string;
	cwd: string;
	confPath: string;
	width: number;
	height: number;
	worktree?: boolean;
	// 測試用：以一般指令取代真實 AI
	command?: string[];
};

export type CreateResult = {ok: true; id: string} | {ok: false; error: Message};

export async function createSession(tmux: Tmux, opts: CreateOptions): Promise<CreateResult> {
	const adapter = getAgent(opts.agent);
	if (!adapter) return {ok: false, error: msg('unknownAgent', opts.agent)};
	const agentSession = adapter.pinsSessionId ? crypto.randomUUID() : '';
	let command = opts.command;
	if (!command) {
		const bin = resolveBin(adapter.binary, platform.binDirs);
		if (!bin) return {ok: false, error: msg('binaryMissing', adapter.binary)};
		const [, ...args] = adapter.launchCommand({cwd: opts.cwd, sessionId: agentSession || null});
		command = [bin, ...args];
	}
	const id = newSessionId();
	const meta: SessionMeta = {
		agent: adapter.id,
		project: opts.project,
		cwd: opts.cwd,
		branch: (await currentBranch(opts.cwd)) ?? 'HEAD',
		worktree: opts.worktree ?? false,
		created: Math.floor(Date.now() / 1000),
		agentSession,
	};
	// 在同一次 tmux 呼叫中連同 metadata 一起寫入，避免輪詢看到沒有中繼資料的半成品；
	// 注意 -f 只有在這行順便啟動新 server 時才會生效
	const args = [
		'-f', opts.confPath,
		'new-session', '-d', '-s', id, '-c', opts.cwd,
		'-x', String(Math.max(20, opts.width)), '-y', String(Math.max(5, opts.height)),
		...command,
	];
	for (const [name, value] of metaOptions(meta)) args.push(';', 'set', '-t', `=${id}:`, name, value);
	const result = await tmux.run(args);
	return result.ok ? {ok: true, id} : {ok: false, error: msg('startFailed', result.message)};
}

export async function respawnSession(
	tmux: Tmux,
	session: {id: string; agent: string; cwd: string; agentSession?: string},
	commandOverride?: string[],
): Promise<CreateResult> {
	const adapter = getAgent(session.agent);
	if (!adapter) return {ok: false, error: msg('unknownAgent', session.agent)};
	let command = commandOverride;
	if (!command) {
		const bin = resolveBin(adapter.binary, platform.binDirs);
		if (!bin) return {ok: false, error: msg('binaryMissing', adapter.binary)};
		const ctx = {cwd: session.cwd, sessionId: session.agentSession || null};
		const [, ...args] = adapter.restartCommand ? adapter.restartCommand(hostFs(), ctx) : adapter.launchCommand(ctx);
		command = [bin, ...args];
	}
	const result = await tmux.run(['respawn-pane', '-k', '-c', session.cwd, '-t', `=${session.id}:`, ...command]);
	return result.ok ? {ok: true, id: session.id} : {ok: false, error: msg('startFailed', result.message)};
}

export async function isPaneDead(tmux: Tmux, id: string): Promise<boolean> {
	return (await tmux.out(['display', '-p', '-t', `=${id}:`, '#{pane_dead}'])) === '1';
}

export async function captureScreen(tmux: Tmux, id: string): Promise<string | null> {
	const result = await tmux.run(['capture-pane', '-p', '-t', `=${id}:`], {timeoutMs: 2000});
	return result.ok ? result.stdout : null;
}

export async function closeSession(tmux: Tmux, id: string): Promise<boolean> {
	if (!id.startsWith(SESSION_PREFIX)) return false;
	return (await tmux.run(['kill-session', '-t', `=${id}`])).ok;
}

export async function sessionExists(tmux: Tmux, id: string): Promise<boolean> {
	return (await tmux.run(['has-session', '-t', `=${id}`])).ok;
}

// 當 AI server 比更新前更早啟動時，重新載入最新產生的 tmux 設定檔
export async function reloadSessionConf(tmux: Tmux, confPath: string): Promise<void> {
	if ((await tmux.run(['has-session'])).ok) await tmux.run(['source-file', confPath]);
}
