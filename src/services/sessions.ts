import {AGENTS, getAgent} from '../agents/index.ts';
import {resolveBin} from '../infra/exec.ts';
import {currentBranch} from '../infra/git.ts';
import {platform} from '../infra/platform/index.ts';
import type {Tmux} from '../infra/tmux.ts';
import {msg, type Message} from '../i18n/strings.ts';

export const SESSION_PREFIX = 'agentpulse-';

// SPEC 5.1. Stored as session user options so a restart can read everything
// back from tmux without a state file of our own.
export type SessionMeta = {
	agent: string;
	project: string;
	cwd: string;
	branch: string;
	worktree: boolean;
	created: number;
	// The agent's own conversation id when we chose it (SPEC 5.1); '' otherwise.
	agentSession: string;
};

export type SessionRecord = SessionMeta & {
	id: string;
	dead: boolean;
	exitStatus: number | null;
	// The pane's process, i.e. the agent; 0 when unknown.
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

// One line of `list-panes -a`. A session created by hand on our socket, or
// one whose metadata is still being written, has no agent and is skipped.
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

// null means the listing failed and the caller should keep what it had;
// an empty list means there is genuinely nothing (including no server yet).
export async function listSessions(tmux: Tmux): Promise<SessionRecord[] | null> {
	const result = await tmux.run(['list-panes', '-a', '-F', FIELDS.join(SEP)]);
	if (!result.ok) return NO_SERVER.test(result.stderr) ? [] : null;
	const seen = new Set<string>();
	const sessions: SessionRecord[] = [];
	for (const line of result.stdout.split('\n')) {
		const record = parseSessionLine(line);
		// One pane per session; a stray extra window must not duplicate the row.
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
	// Tests run a plain command instead of a real AI.
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
	// Metadata goes in the same tmux invocation as the session so a poll can
	// never see the session without it. -f only takes effect when this call
	// starts the server.
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

// The visible screen as plain text, for the adapter's classify (SPEC 5.3).
// null when the capture failed, so the caller keeps the previous status.
export async function captureScreen(tmux: Tmux, id: string): Promise<string | null> {
	const result = await tmux.run(['capture-pane', '-p', '-t', `=${id}:`], {timeoutMs: 2000});
	return result.ok ? result.stdout : null;
}

export async function closeSession(tmux: Tmux, id: string): Promise<boolean> {
	if (!id.startsWith(SESSION_PREFIX)) return false;
	return (await tmux.run(['kill-session', '-t', `=${id}`])).ok;
}

// Picks up a newer generated config when the server outlived an update.
export async function reloadSessionConf(tmux: Tmux, confPath: string): Promise<void> {
	if ((await tmux.run(['has-session'])).ok) await tmux.run(['source-file', confPath]);
}
