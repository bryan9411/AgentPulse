import {existsSync} from 'node:fs';
import {join} from 'node:path';

export type ExecErrorKind = 'not-found' | 'timeout' | 'exit' | 'spawn';

export type ExecOk = {ok: true; stdout: string; stderr: string; code: 0};
export type ExecFail = {
	ok: false;
	kind: ExecErrorKind;
	stdout: string;
	stderr: string;
	code: number | null;
	message: string;
};
export type ExecResult = ExecOk | ExecFail;

export type ExecOptions = {
	timeoutMs?: number;
	cwd?: string;
	env?: Record<string, string | undefined>;
	stdin?: string;
};

export type Executor = {
	run(cmd: string[], opts?: ExecOptions): Promise<ExecResult>;
	readonly active: number;
};

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_CONCURRENCY = 8;

function isNotFound(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const code = 'code' in error ? (error as {code: unknown}).code : undefined;
	return code === 'ENOENT';
}

// Many pollers share one machine; a cap keeps a slow tmux or git from being
// hammered by dozens of queued calls at once.
export function createExecutor(concurrency = DEFAULT_CONCURRENCY): Executor {
	let active = 0;
	const waiting: Array<() => void> = [];

	const acquire = async () => {
		if (active < concurrency) {
			active++;
			return;
		}
		await new Promise<void>(resolve => waiting.push(resolve));
		active++;
	};
	const release = () => {
		active--;
		waiting.shift()?.();
	};

	const runOnce = async (cmd: string[], opts: ExecOptions): Promise<ExecResult> => {
		const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		let proc: ReturnType<typeof Bun.spawn>;
		try {
			proc = Bun.spawn({
				cmd,
				cwd: opts.cwd,
				env: opts.env,
				stdin: opts.stdin === undefined ? 'ignore' : new TextEncoder().encode(opts.stdin),
				stdout: 'pipe',
				stderr: 'pipe',
			});
		} catch (error) {
			const kind: ExecErrorKind = isNotFound(error) ? 'not-found' : 'spawn';
			return {ok: false, kind, stdout: '', stderr: '', code: null, message: `${cmd[0]}: ${String(error)}`};
		}

		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			proc.kill('SIGKILL');
		}, timeoutMs);

		const [stdout, stderr, code] = await Promise.all([
			new Response(proc.stdout as ReadableStream).text(),
			new Response(proc.stderr as ReadableStream).text(),
			proc.exited,
		]);
		clearTimeout(timer);

		if (timedOut) {
			return {ok: false, kind: 'timeout', stdout, stderr, code: null, message: `${cmd[0]} timed out after ${timeoutMs} ms`};
		}
		if (code !== 0) {
			const detail = stderr.trim().split('\n')[0] ?? '';
			return {ok: false, kind: 'exit', stdout, stderr, code, message: `${cmd[0]} exited with ${code}${detail ? `: ${detail}` : ''}`};
		}
		return {ok: true, stdout, stderr, code: 0};
	};

	return {
		get active() {
			return active;
		},
		async run(cmd, opts = {}) {
			await acquire();
			try {
				return await runOnce(cmd, opts);
			} finally {
				release();
			}
		},
	};
}

export const executor = createExecutor();

export function exec(cmd: string[], opts?: ExecOptions): Promise<ExecResult> {
	return executor.run(cmd, opts);
}

// For `tmux attach`: the child must own the real terminal, so stdio is
// inherited and there is deliberately no timeout.
export function execInteractive(cmd: string[], opts: {env?: Record<string, string | undefined>} = {}): number {
	try {
		const result = Bun.spawnSync({cmd, env: opts.env, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit'});
		return result.exitCode ?? 1;
	} catch {
		return 127;
	}
}

// Finder launches inherit a minimal PATH on some setups, so fall back to the
// platform's usual install folders.
export function resolveBin(name: string, fallbackDirs: readonly string[], path = process.env.PATH): string | null {
	const onPath = Bun.which(name, {PATH: path ?? ''});
	if (onPath) return onPath;
	for (const dir of fallbackDirs) {
		const candidate = join(dir, name);
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

// The shell's entries win; anything only in the inherited PATH is kept after them.
export function mergePath(preferred: string, current: string): string {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const dir of [...preferred.split(':'), ...current.split(':')]) {
		if (dir && !seen.has(dir)) {
			seen.add(dir);
			out.push(dir);
		}
	}
	return out.join(':');
}
