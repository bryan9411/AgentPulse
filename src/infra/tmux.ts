import {exec, resolveBin, type ExecOptions, type ExecResult} from './exec.ts';
import {platform} from './platform/index.ts';

export const UI_SOCKET = 'agentpulse-ui';
export const AGENT_SOCKET = 'agentpulse';

type Env = Record<string, string | undefined>;

// Without a UTF-8 locale the tmux server and the nested client fall back to
// ASCII for CJK text and box lines (M0). Claude Code's own variables would
// change how an inner Claude Code behaves when we are launched from one.
// TMUX is dropped so nested attaches are not refused.
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
	// Trimmed stdout, or null on any failure.
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

// `tmux -V` prints e.g. "tmux 3.8", "tmux 3.3a", "tmux next-3.6".
export function parseTmuxVersion(output: string): TmuxVersion | null {
	const match = /(\d+)\.(\d+)/.exec(output);
	if (!match) return null;
	return {major: Number(match[1]), minor: Number(match[2])};
}

export function versionAtLeast(version: TmuxVersion, major: number, minor: number): boolean {
	return version.major > major || (version.major === major && version.minor >= minor);
}

// tmux expands `#` in formats; user-supplied text must not inject styles.
export function escapeFormat(text: string): string {
	return text.replaceAll('#', '##');
}

// tmux runs pane commands through `sh -c`.
export function shellQuote(text: string): string {
	return `'${text.replaceAll("'", `'\\''`)}'`;
}
