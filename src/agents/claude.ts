import {join} from 'node:path';
import {countSkills, envSet, isRecord, keysOf, readJson, stringField, unique} from './files.ts';
import {commandHasProgram} from './match.ts';
import {findInputBox, isRule, lastNonEmpty, screenLines} from './screen.ts';
import type {AccountStatus, AgentAdapter, ContextUsage, HostFs, ScreenState, SessionContext, SessionInfo} from './types.ts';

const PROMPT = '❯';

// 信任、工具授權與 AskUserQuestion 選單開啟時會取代輸入框，底行皆以此提示結尾
const DIALOG_HINT = /\bEsc to cancel\b/;

const BUSY_HINT = /\besc to interrupt\b/;

const ERROR_LINES = [
	/^(?:⏺\s*)?API Error\b/,
	// 未實測：錯誤訊息文字取自常見失敗回報
	/^(?:⏺\s*)?(?:Invalid API key|OAuth token has expired|Please run \/login)\b/,
	/^(?:⏺\s*)?(?:Credit balance is too low|Claude usage limit reached|You've hit your limit)\b/,
];

// 只看最後一則提示之後的回覆，避免更早之前的歷史錯誤或週額度提示橫幅造成誤判
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

const SUSPEND_NOTICE = 'Claude Code has been suspended';

function isSuspended(screen: string): boolean {
	const lines = screenLines(screen);
	const at = lines.findLastIndex(line => line.includes(SUSPEND_NOTICE));
	if (at === -1) return false;
	// 暫停訊息下方若已重新畫出輸入框格線，代表程式已經恢復執行
	return !lines.slice(at + 1).some(isRule);
}

const claudeJson = (fs: HostFs) => join(fs.home, '.claude.json');
const projectsDir = (fs: HostFs) => join(fs.home, '.claude', 'projects');

function accountStatus(fs: HostFs): AccountStatus {
	if (envSet(fs, 'ANTHROPIC_API_KEY')) return 'signed-in';
	// 僅檢查鍵是否存在，不保留解析內容
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

// 不同專案或 worktree 對應的資料夾命名規則不同，已知 sessionId 時直接跨資料夾尋找檔名
export function findClaudeLog(fs: HostFs, cwd: string, sessionId: string | null): string | null {
	const root = projectsDir(fs);
	if (sessionId) {
		for (const dir of fs.listDir(root)) {
			const path = join(root, dir, `${sessionId}.jsonl`);
			if (fs.exists(path)) return path;
		}
		return null;
	}
	// M4 以前建立的工作階段沒有 sessionId，改取該目錄下最新的 log
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

// Claude Code 會在執行 /clear 時更新 ~/.claude/sessions/<pid>.json 的 sessionId，
// 透過這支檔案讓開頭固定的 sessionId 也能跟上切換後的新對話（/resume 未實測）
export function liveConversation(fs: HostFs, pid: number | null): string | null {
	if (!pid) return null;
	const json = readJson(fs, join(fs.home, '.claude', 'sessions', `${pid}.json`));
	if (!isRecord(json) || (json.pid !== undefined && json.pid !== pid)) return null;
	const id = stringField(json, 'sessionId');
	return id && UUID.test(id) ? id : null;
}

// 只計入送給模型的輸入 token（含快取讀取與寫入），不含輸出，與 /context 顯示一致
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
		// 從檔案頭尾截段讀取時，首行或末行常只讀到半行，直接略過
		return null;
	}
}

// 跳過子代理（isSidechain）與本機錯誤訊息（<synthetic>），只取主對話回覆
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
	input: number | null;
	// 最後一次回覆後若發生過 /compact，改以壓縮後大小估算，直到下次回覆覆蓋
	compactedTo: number | null;
};

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
// Claude Code 2.1.325 在第一筆回覆前會先寫入約 200～360 KB 的環境設定紀錄
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

// 每個 log 的第一筆回覆（基底）不會變動，快取起來避免重複讀 1 MB
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
	const settings = readJson(fs, join(fs.home, '.claude', 'settings.json'));
	return {model: stringField(settings, 'model'), effort: null, context: null};
}

// 模型視窗大小對照表，採前綴比對以涵蓋帶日期的模型名稱
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

export function restartCommand(fs: HostFs, {cwd, sessionId}: {cwd: string; sessionId: string | null}): string[] {
	if (!sessionId) return ['claude'];
	return findClaudeLog(fs, cwd, sessionId) ? ['claude', '--resume', sessionId] : ['claude', '--session-id', sessionId];
}

export const claude: AgentAdapter = {
	id: 'claude',
	displayName: 'Claude Code',
	rulesFiles: ['CLAUDE.md', '.claude/CLAUDE.md'],
	binary: 'claude',
	pinsSessionId: true,
	launchCommand: ({sessionId}) => (sessionId ? ['claude', '--session-id', sessionId] : ['claude']),
	restartCommand,
	matchProcess: line => commandHasProgram(line, ['claude']),
	classify,
	isSuspended,
	accountStatus,
	mcpServers,
	skillsCount,
	contextWindows: CONTEXT_WINDOWS,
	sessionInfo,
};
