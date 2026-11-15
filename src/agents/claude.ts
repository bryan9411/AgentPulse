import {join} from 'node:path';
import {countSkills, envSet, isRecord, keysOf, readJson, stringField, unique} from './files.ts';
import {commandHasProgram} from './match.ts';
import {findInputBox, isRule, lastNonEmpty, screenLines} from './screen.ts';
import type {AccountStatus, AgentAdapter, ContextUsage, HostFs, ScreenState, SessionContext, SessionInfo} from './types.ts';

// Every rule below comes from screens captured from Claude Code 2.1.325
// (tests/fixtures/claude/) unless marked "not tested".

const PROMPT = '❯';

// Trust, tool approval and AskUserQuestion dialogs all end with this hint
// and replace the input box while they are open.
const DIALOG_HINT = /\bEsc to cancel\b/;

// Shown in the footer for as long as a turn runs, retries included.
const BUSY_HINT = /\besc to interrupt\b/;

const ERROR_LINES = [
	/^(?:⏺\s*)?API Error\b/,
	// Not tested: wording taken from reports of these failures.
	/^(?:⏺\s*)?(?:Invalid API key|OAuth token has expired|Please run \/login)\b/,
	/^(?:⏺\s*)?(?:Credit balance is too low|Claude usage limit reached|You've hit your limit)\b/,
];

// Only the reply to the latest message counts; an old error above an
// answered prompt is history. The weekly-usage banner ("You've used 75% of
// your weekly limit") sits in this region too and must not match.
function lastReply(lines: readonly string[], boxTop: number): string[] {
	let start = 0;
	for (let i = boxTop - 1; i >= 0; i--) {
		if ((lines[i] ?? '').startsWith(`${PROMPT} `)) {
			start = i + 1;
			break;
		}
	}
	return lines.slice(start, boxTop);
}

function classify(screen: string): ScreenState | null {
	const lines = screenLines(screen);
	const box = findInputBox(lines, PROMPT);
	if (!box) {
		const tail = lastNonEmpty(lines, 1)[0] ?? '';
		return DIALOG_HINT.test(tail) ? 'needs-approval' : null;
	}
	if (box.footer.some(line => BUSY_HINT.test(line))) return 'running';
	const reply = lastReply(lines, box.top).map(line => line.trim());
	if (reply.some(line => ERROR_LINES.some(re => re.test(line)))) return 'error';
	return 'idle';
}

// ctrl+z prints this, hands the tty back and waits for SIGCONT.
const SUSPEND_NOTICE = 'Claude Code has been suspended';

function isSuspended(screen: string): boolean {
	const lines = screenLines(screen);
	const at = lines.findLastIndex(line => line.includes(SUSPEND_NOTICE));
	if (at === -1) return false;
	// A redrawn input box below the notice means it is already running again.
	return !lines.slice(at + 1).some(isRule);
}

// ---- HUD data (SPEC 6.8), checked against Claude Code 2.1.325 files ----

const claudeJson = (fs: HostFs) => join(fs.home, '.claude.json');
const projectsDir = (fs: HostFs) => join(fs.home, '.claude', 'projects');

function accountStatus(fs: HostFs): AccountStatus {
	if (envSet(fs, 'ANTHROPIC_API_KEY')) return 'signed-in';
	// Only whether the key exists; the parsed object is dropped right here.
	const json = readJson(fs, claudeJson(fs));
	return isRecord(json) && 'oauthAccount' in json ? 'signed-in' : 'not-set';
}

function mcpServers(fs: HostFs, cwd: string): string[] | null {
	const json = readJson(fs, claudeJson(fs));
	if (json === null) return null;
	const local = isRecord(json) && isRecord(json.projects) ? json.projects[cwd] : undefined;
	const shared = readJson(fs, join(cwd, '.mcp.json'));
	const disabled = new Set(isRecord(local) && Array.isArray(local.disabledMcpjsonServers) ? local.disabledMcpjsonServers : []);
	return unique([
		...keysOf(json, 'mcpServers'),
		...keysOf(local, 'mcpServers'),
		...keysOf(shared, 'mcpServers').filter(name => !disabled.has(name)),
	]);
}

// Install folders of the plugins switched on in ~/.claude/settings.json.
function enabledPluginDirs(fs: HostFs): string[] {
	const settings = readJson(fs, join(fs.home, '.claude', 'settings.json'));
	const enabled = isRecord(settings) && isRecord(settings.enabledPlugins) ? settings.enabledPlugins : {};
	const installed = readJson(fs, join(fs.home, '.claude', 'plugins', 'installed_plugins.json'));
	const plugins = isRecord(installed) && isRecord(installed.plugins) ? installed.plugins : {};
	const dirs: string[] = [];
	for (const [name, on] of Object.entries(enabled)) {
		const installs = plugins[name];
		if (on !== true || !Array.isArray(installs)) continue;
		const path = stringField(installs[installs.length - 1], 'installPath');
		if (path) dirs.push(path);
	}
	return dirs;
}

// Matches the count in Claude Code 2.1.325's /skills: user, project,
// claude.ai-synced (one folder per sync bucket) and enabled plugins.
function skillsCount(fs: HostFs, cwd: string): number {
	const user = join(fs.home, '.claude', 'skills');
	const synced = join(user, 'synced');
	return countSkills(fs, [
		user,
		join(cwd, '.claude', 'skills'),
		...fs.listDir(synced).map(bucket => join(synced, bucket)),
		...enabledPluginDirs(fs).map(dir => join(dir, 'skills')),
	]);
}

// The log of a pinned session sits in a folder named after the cwd; rather
// than re-implement that naming, look for the file name in every folder.
export function findClaudeLog(fs: HostFs, cwd: string, sessionId: string | null): string | null {
	const root = projectsDir(fs);
	if (sessionId) {
		for (const dir of fs.listDir(root)) {
			const path = join(root, dir, `${sessionId}.jsonl`);
			if (fs.exists(path)) return path;
		}
		return null;
	}
	// Sessions from before M4 have no id: newest log for this folder.
	const dir = join(root, cwd.replace(/[^A-Za-z0-9]/g, '-'));
	let best: {path: string; mtime: number} | null = null;
	for (const name of fs.listDir(dir)) {
		if (!name.endsWith('.jsonl')) continue;
		const path = join(dir, name);
		const mtime = fs.mtimeMs(path) ?? 0;
		if (!best || mtime > best.mtime) best = {path, mtime};
	}
	return best?.path ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Claude Code records each running process's current conversation here and
// rewrites it on /clear (seen in 2.1.325; /resume not tested), which is how a
// pinned session keeps up after the conversation is replaced.
export function liveConversation(fs: HostFs, pid: number | null): string | null {
	if (!pid) return null;
	const json = readJson(fs, join(fs.home, '.claude', 'sessions', `${pid}.json`));
	if (!isRecord(json) || (json.pid !== undefined && json.pid !== pid)) return null;
	const id = stringField(json, 'sessionId');
	return id && UUID.test(id) ? id : null;
}

// What the model was sent: cached and uncached input, not the output.
// Matches the total Claude Code's /context shows (SPEC 5.6).
export function inputTokens(usage: unknown): number | null {
	if (!isRecord(usage)) return null;
	let total = 0;
	let found = false;
	for (const key of ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
		const value = usage[key];
		if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
			total += value;
			found = true;
		}
	}
	return found ? total : null;
}

function parseLine(line: string): Record<string, unknown> | null {
	try {
		const entry: unknown = JSON.parse(line);
		return isRecord(entry) ? entry : null;
	} catch {
		return null; // the first line of a tail, or last of a head, is usually cut
	}
}

// A reply of the main conversation. Subagent turns run in their own context
// and local error lines carry the model "<synthetic>"; both are skipped.
function mainReply(entry: Record<string, unknown>): {model: string; effort: string | null; input: number | null} | null {
	if (entry.type !== 'assistant' || entry.isSidechain === true) return null;
	const model = stringField(entry.message, 'model');
	if (!model || model.startsWith('<')) return null;
	const usage = isRecord(entry.message) ? entry.message.usage : undefined;
	return {model, effort: stringField(entry, 'effort'), input: inputTokens(usage)};
}

export type TailScan = {
	model: string;
	effort: string | null;
	// Input of the latest reply.
	input: number | null;
	// Set when /compact (or auto-compact) ran after that reply: the size of
	// the compacted history, until the next reply replaces the estimate.
	compactedTo: number | null;
};

// Walks back from the end of the log to the latest reply.
export function scanTail(tail: string): TailScan | null {
	const lines = tail.split('\n');
	let compactedTo: number | null = null;
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i] ?? '';
		const boundary = line.includes('"compact_boundary"');
		if (!boundary && !line.includes('"assistant"')) continue;
		const entry = parseLine(line);
		if (!entry) continue;
		if (boundary && entry.subtype === 'compact_boundary' && compactedTo === null) {
			const post = isRecord(entry.compactMetadata) ? entry.compactMetadata.postTokens : undefined;
			if (typeof post === 'number' && Number.isFinite(post)) compactedTo = post;
			continue;
		}
		const reply = mainReply(entry);
		if (reply) return {...reply, compactedTo};
	}
	return null;
}

// Input of the conversation's first reply: the SPEC 5.6 "system / MCP" base.
export function firstReplyInput(head: string): number | null {
	for (const line of head.split('\n')) {
		if (!line.includes('"assistant"')) continue;
		const entry = parseLine(line);
		const reply = entry && mainReply(entry);
		if (reply && reply.input !== null) return reply.input;
	}
	return null;
}

const TAIL_BYTES = [256 * 1024, 4 * 1024 * 1024];
// 2.1.325 writes 200–360 KB of setup before the first reply.
const HEAD_BYTES = [1024 * 1024, 4 * 1024 * 1024];

function readGrowing<T>(read: (bytes: number) => string | null, steps: readonly number[], scan: (text: string) => T | null): T | null {
	for (const bytes of steps) {
		const text = read(bytes);
		if (text === null) return null;
		const found = scan(text);
		if (found !== null) return found;
		if (text.length < bytes) return null;
	}
	return null;
}

// A log's first reply never changes, so it is read once per file.
const baseCache = new Map<string, number>();

function conversationBase(fs: HostFs, log: string): number | null {
	const known = baseCache.get(log);
	if (known !== undefined) return known;
	const base = readGrowing(bytes => fs.readHead(log, bytes), HEAD_BYTES, firstReplyInput);
	if (base !== null) {
		if (baseCache.size > 200) baseCache.clear();
		baseCache.set(log, base);
	}
	return base;
}

function contextOf(fs: HostFs, log: string, scan: TailScan): ContextUsage | null {
	const base = conversationBase(fs, log);
	if (scan.compactedTo !== null) return base === null ? null : {used: base + scan.compactedTo, base};
	if (scan.input === null) return null;
	return {used: scan.input, base: base === null ? null : Math.min(base, scan.input)};
}

function sessionInfo(fs: HostFs, ctx: SessionContext): SessionInfo {
	const id = liveConversation(fs, ctx.pid) ?? ctx.sessionId;
	const log = findClaudeLog(fs, ctx.cwd, id);
	const scan = log ? readGrowing(bytes => fs.readTail(log, bytes), TAIL_BYTES, scanTail) : null;
	if (log && scan) return {model: scan.model, effort: scan.effort, context: contextOf(fs, log, scan)};
	// No reply yet: the model the user picked as default, if any.
	const settings = readJson(fs, join(fs.home, '.claude', 'settings.json'));
	return {model: stringField(settings, 'model'), effort: null, context: null};
}

// SPEC 6.8, from Anthropic's model table (2026-11); matched by prefix so
// dated names fit too. Claude Code's /context shows 1m for claude-opus-5-5.
const CONTEXT_WINDOWS: Record<string, number> = {
	'claude-fable-5': 1_000_000,
	'claude-mythos-5': 1_000_000,
	'claude-opus-5': 1_000_000,
	'claude-opus-4-8': 1_000_000,
	'claude-opus-4-7': 1_000_000,
	'claude-opus-4-6': 1_000_000,
	'claude-sonnet-5': 1_000_000,
	'claude-sonnet-4-6': 1_000_000,
	'claude-haiku-5-5': 1_000_000,
	'claude-haiku-4-5': 200_000,
};

export const claude: AgentAdapter = {
	id: 'claude',
	displayName: 'Claude Code',
	rulesFiles: ['CLAUDE.md', '.claude/CLAUDE.md'],
	binary: 'claude',
	pinsSessionId: true,
	launchCommand: ({sessionId}) => (sessionId ? ['claude', '--session-id', sessionId] : ['claude']),
	matchProcess: line => commandHasProgram(line, ['claude']),
	classify,
	isSuspended,
	accountStatus,
	mcpServers,
	skillsCount,
	contextWindows: CONTEXT_WINDOWS,
	sessionInfo,
};
