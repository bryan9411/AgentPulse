import {homedir} from 'node:os';
import {join} from 'node:path';
import {exec} from '../exec.ts';
import type {ListeningPort, Platform, ProcessEntry} from './types.ts';

// 將標題與內文作為 argv 傳入，避免分支名稱中的引號破壞 AppleScript 字串
const NOTIFY_SCRIPT = ['on run argv', 'display notification (item 2 of argv) with title (item 1 of argv)', 'end run'];

// `lsof -F pn` 輸出格式：先一行 `p<pid>`，接著每條連線一行 `n<addr>:<port>`
export function parseLsof(text: string): ListeningPort[] {
	const out: ListeningPort[] = [];
	const seen = new Set<string>();
	let pid = 0;
	for (const line of text.split('\n')) {
		if (line.startsWith('p')) pid = Number(line.slice(1)) || 0;
		else if (line.startsWith('n') && pid) {
			const port = Number(/:(\d+)$/.exec(line)?.[1] ?? NaN);
			const key = `${pid}:${port}`;
			if (Number.isInteger(port) && !seen.has(key)) {
				seen.add(key);
				out.push({pid, port});
			}
		}
	}
	return out;
}

// `lsof -d cwd -F pn` 輸出格式：`p<pid>`、`fcwd`、`n<path>`
export function parseCwds(text: string): Map<number, string> {
	const out = new Map<number, string>();
	let pid = 0;
	for (const line of text.split('\n')) {
		if (line.startsWith('p')) pid = Number(line.slice(1)) || 0;
		else if (line.startsWith('n') && pid) out.set(pid, line.slice(1));
	}
	return out;
}

export function parsePs(text: string): ProcessEntry[] {
	const out: ProcessEntry[] = [];
	for (const line of text.split('\n')) {
		const m = /^\s*(\d+)\s+(\d+)\s(.*)$/.exec(line);
		if (m) out.push({pid: Number(m[1]), ppid: Number(m[2]), command: m[3] ?? ''});
	}
	return out;
}

const PATH_BEGIN = '__AGENTPULSE_PATH_BEGIN__';
const PATH_END = '__AGENTPULSE_PATH_END__';

// 透過獨立的 printenv 指令讀取匯出的 PATH，讓 zsh、bash、fish 行為一致
export const SHELL_PATH_SCRIPT = `echo ${PATH_BEGIN}; /usr/bin/printenv PATH; echo ${PATH_END}`;

// 使用者 shell 啟動檔可能印出額外訊息，因此以標記擷取真正的 PATH
export function parseShellPath(stdout: string): string | null {
	const match = new RegExp(`${PATH_BEGIN}\\n([^\\n]*)\\n${PATH_END}`).exec(stdout);
	const path = match?.[1]?.trim();
	return path ? path : null;
}

const SHELL_PATH_TIMEOUT_MS = 3000;

export const darwin: Platform = {
	id: 'darwin',
	// 依序補上 Apple Silicon Homebrew、Intel Homebrew，以及 Claude Code／agy 原生安裝所在的 ~/.local/bin
	binDirs: ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local', 'bin')],
	async notify(title, body) {
		const script = NOTIFY_SCRIPT.flatMap(line => ['-e', line]);
		return (await exec(['/usr/bin/osascript', ...script, title, body], {timeoutMs: 5000})).ok;
	},
	async listeningPorts() {
		const result = await exec(['/usr/sbin/lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'], {timeoutMs: 5000});
		// 沒有任何監聽中的 port 時，lsof 會以結束碼 1 離開
		if (!result.ok && !(result.kind === 'exit' && result.stdout === '' && result.code === 1)) return null;
		return parseLsof(result.stdout);
	},
	async processCwds(pids) {
		if (pids.length === 0) return new Map();
		const result = await exec(['/usr/sbin/lsof', '-a', '-d', 'cwd', '-p', pids.join(','), '-Fpn'], {timeoutMs: 5000});
		// 部分 pid 已結束時 lsof 也會回傳 1，但已印出的內容仍然有效
		return parseCwds(result.stdout);
	},
	async processTree() {
		const result = await exec(['/bin/ps', '-axo', 'pid=,ppid=,command='], {timeoutMs: 5000});
		return result.ok ? parsePs(result.stdout) : null;
	},
	async isProcessStopped(pid) {
		if (!Number.isInteger(pid) || pid <= 1) return false;
		const result = await exec(['/bin/ps', '-o', 'state=', '-p', String(pid)], {timeoutMs: 2000});
		return result.ok && result.stdout.trim().startsWith('T');
	},
	async openUrl(url) {
		return (await exec(['/usr/bin/open', url], {timeoutMs: 5000})).ok;
	},
	async loginShellPath() {
		const shell = process.env.SHELL || '/bin/zsh';
		// 加上 -i：nvm 等工具通常寫在只有互動式 shell 才會讀取的 .zshrc
		const result = await exec([shell, '-ilc', SHELL_PATH_SCRIPT], {timeoutMs: SHELL_PATH_TIMEOUT_MS});
		// 部分啟動檔印完 PATH 後可能回傳非零結束碼，改以標記是否存在為準
		return parseShellPath(result.stdout);
	},
};
