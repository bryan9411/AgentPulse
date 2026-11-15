import {join} from 'node:path';
import {countSkills, envSet, isRecord, keysOf, readJson, stringField, unique} from './files.ts';
import {commandHasProgram} from './match.ts';
import {findInputBox, isRule, lastNonEmpty, screenLines} from './screen.ts';
import type {AccountStatus, AgentAdapter, HostFs, ScreenState, SessionInfo} from './types.ts';

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

// Model and effort of the latest real reply. Local error lines carry the
// model "<synthetic>" and are skipped.
export function lastReplyInfo(tail: string): SessionInfo | null {
	const lines = tail.split('\n');
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i] ?? '';
		if (!line.includes('"assistant"')) continue;
		let entry: unknown;
		try {
			entry = JSON.parse(line);
		} catch {
			continue; // the first line of a tail is usually cut
		}
		if (!isRecord(entry) || entry.type !== 'assistant') continue;
		const model = stringField(entry.message, 'model');
		if (!model || model.startsWith('<')) continue;
		return {model, effort: stringField(entry, 'effort')};
	}
	return null;
}

const TAIL_BYTES = [256 * 1024, 4 * 1024 * 1024];

function sessionInfo(fs: HostFs, ctx: {cwd: string; sessionId: string | null}): SessionInfo {
	const log = findClaudeLog(fs, ctx.cwd, ctx.sessionId);
	if (log) {
		for (const bytes of TAIL_BYTES) {
			const tail = fs.readTail(log, bytes);
			if (tail === null) break;
			const info = lastReplyInfo(tail);
			if (info) return info;
			if (tail.length < bytes) break;
		}
	}
	// No reply yet: the model the user picked as default, if any.
	const settings = readJson(fs, join(fs.home, '.claude', 'settings.json'));
	return {model: stringField(settings, 'model'), effort: null};
}

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
	sessionInfo,
};
