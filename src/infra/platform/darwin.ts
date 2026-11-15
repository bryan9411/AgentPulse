import {homedir} from 'node:os';
import {join} from 'node:path';
import {exec} from '../exec.ts';
import type {ListeningPort, Platform, ProcessEntry} from './types.ts';

// Title and body go in as argv, never spliced into the script, so quotes in
// a branch name cannot break out of the AppleScript string.
const NOTIFY_SCRIPT = ['on run argv', 'display notification (item 2 of argv) with title (item 1 of argv)', 'end run'];

// `lsof -F pn`: a "p<pid>" line, then one "n<addr>:<port>" per socket.
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

// `lsof -d cwd -F pn`: "p<pid>", "fcwd", "n<path>".
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

export const darwin: Platform = {
	id: 'darwin',
	// Apple Silicon Homebrew, Intel Homebrew, then ~/.local/bin where agy and
	// Claude Code's native installer put their binaries.
	binDirs: ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local', 'bin')],
	async notify(title, body) {
		const script = NOTIFY_SCRIPT.flatMap(line => ['-e', line]);
		return (await exec(['/usr/bin/osascript', ...script, title, body], {timeoutMs: 5000})).ok;
	},
	async listeningPorts() {
		const result = await exec(['/usr/sbin/lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'], {timeoutMs: 5000});
		// lsof exits 1 when nothing matches.
		if (!result.ok && !(result.kind === 'exit' && result.stdout === '' && result.code === 1)) return null;
		return parseLsof(result.stdout);
	},
	async processCwds(pids) {
		if (pids.length === 0) return new Map();
		const result = await exec(['/usr/sbin/lsof', '-a', '-d', 'cwd', '-p', pids.join(','), '-Fpn'], {timeoutMs: 5000});
		// Exit 1 also covers "some pids are gone"; whatever was printed is valid.
		return parseCwds(result.stdout);
	},
	async processTree() {
		const result = await exec(['/bin/ps', '-axo', 'pid=,ppid=,command='], {timeoutMs: 5000});
		return result.ok ? parsePs(result.stdout) : null;
	},
	async openUrl(url) {
		return (await exec(['/usr/bin/open', url], {timeoutMs: 5000})).ok;
	},
};
