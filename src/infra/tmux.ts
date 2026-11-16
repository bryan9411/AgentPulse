import {exec, resolveBin, type ExecOptions, type ExecResult} from './exec.ts';
import {platform} from './platform/index.ts';

export const UI_SOCKET = 'agentpulse-ui';
export const AGENT_SOCKET = 'agentpulse';

type Env = Record<string, string | undefined>;

// 沒設定 UTF-8 語系時 tmux 與巢狀 client 會把中文和框線畫成亂碼；
// 同時移除 TMUX 與 Claude Code 相關環境變數，避免巢狀 attach 被拒絕或干擾內層 Claude
export function tmuxEnv(base: Env = process.env): Env {
	const env: Env = {};
	for (const [key, value] of Object.entries(base)) {
		if (key === 'TMUX' || key === 'CLAUDECODE' || key.startsWith('CLAUDE_')) continue;
		env[key] = value;
	}
	const locale = `${base.LC_ALL ?? ''}${base.LC_CTYPE ?? ''}${base.LANG ?? ''}`;
	if (!/UTF-?8/i.test(locale)) env.LANG = 'en_US.UTF-8';
	return env;
}

let cachedBin: string | null | undefined;
export function tmuxBin(): string | null {
	if (cachedBin === undefined) cachedBin = resolveBin('tmux', platform.binDirs);
	return cachedBin;
}

export type Tmux = {
	readonly socket: string;
	argv(args: string[]): string[];
	run(args: string[], opts?: ExecOptions): Promise<ExecResult>;
	out(args: string[]): Promise<string | null>;
};

export function createTmux(socket: string, bin = tmuxBin() ?? 'tmux'): Tmux {
	const argv = (args: string[]) => [bin, '-u', '-L', socket, ...args];
	const run = (args: string[], opts: ExecOptions = {}) => exec(argv(args), {env: tmuxEnv(), ...opts});
	return {
		socket,
		argv,
		run,
		async out(args) {
			const result = await run(args);
			return result.ok ? result.stdout.trimEnd() : null;
		},
	};
}

export type TmuxVersion = {major: number; minor: number};

export function parseTmuxVersion(output: string): TmuxVersion | null {
	const match = /(\d+)\.(\d+)/.exec(output);
	if (!match) return null;
	return {major: Number(match[1]), minor: Number(match[2])};
}

export function versionAtLeast(version: TmuxVersion, major: number, minor: number): boolean {
	return version.major > major || (version.major === major && version.minor >= minor);
}

// tmux 格式字串會展開 `#`，使用者文字中的 `#` 必須跳脫以免被當成樣式語法
export function escapeFormat(text: string): string {
	return text.replaceAll('#', '##');
}

export function shellQuote(text: string): string {
	return `'${text.replaceAll("'", `'\\''`)}'`;
}
