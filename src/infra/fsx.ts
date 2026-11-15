import {closeSync, existsSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmdirSync, statSync, writeFileSync, writeSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, isAbsolute, join, resolve} from 'node:path';

export function expandHome(path: string, home = homedir()): string {
	if (path === '~') return home;
	if (path.startsWith('~/')) return join(home, path.slice(2));
	return path;
}

// Relative paths are taken from the home folder: a double-clicked launch
// starts there, and the sidebar's own cwd is not meaningful to the user.
export function toAbsolute(path: string, home = homedir()): string {
	const expanded = expandHome(path.trim(), home);
	return isAbsolute(expanded) ? resolve(expanded) : resolve(home, expanded);
}

export function readText(path: string): string | null {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return null;
	}
}

// Write-then-rename so a crash never leaves a half-written config.
export function writeTextAtomic(path: string, text: string): void {
	mkdirSync(dirname(path), {recursive: true});
	const tmp = `${path}.${process.pid}.tmp`;
	writeFileSync(tmp, text);
	renameSync(tmp, path);
}

export function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

// A path git can create a worktree at: nothing there yet, or an empty folder.
export function missingOrEmptyDir(path: string): boolean {
	if (!existsSync(path)) return true;
	try {
		return statSync(path).isDirectory() && readdirSync(path).length === 0;
	} catch {
		return false;
	}
}

// Walks up from `from` to `stopAt` (inclusive) removing folders, and stops at
// the first one that is not empty: rmdir never deletes content.
export function removeEmptyDirs(from: string, stopAt: string): void {
	let dir = resolve(from);
	const top = resolve(stopAt);
	while (dir === top || dir.startsWith(`${top}/`)) {
		try {
			rmdirSync(dir);
		} catch {
			return;
		}
		if (dir === top) return;
		dir = dirname(dir);
	}
}

export function mtimeMs(path: string): number | null {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return null;
	}
}

// The HUD pane is painted by writing straight to its tty (M0 G4).
export function writeToTty(ttyPath: string, data: string): boolean {
	try {
		const fd = openSync(ttyPath, 'w');
		try {
			writeSync(fd, data);
		} finally {
			closeSync(fd);
		}
		return true;
	} catch {
		return false;
	}
}

// Read-only file access handed to the agent adapters (SPEC 6.4), so they
// never import infra and tests can feed them fake files.
export type HostFs = {
	home: string;
	env(name: string): string | undefined;
	exists(path: string): boolean;
	readText(path: string): string | null;
	// The last `bytes` of a file; logs can grow to many megabytes.
	readTail(path: string, bytes: number): string | null;
	// The first `bytes` of a file.
	readHead(path: string, bytes: number): string | null;
	// Entry names; [] when the folder is missing.
	listDir(path: string): string[];
	mtimeMs(path: string): number | null;
};

function readSlice(path: string, bytes: number, fromEnd: boolean): string | null {
	try {
		const fd = openSync(path, 'r');
		try {
			const size = fstatSync(fd).size;
			const length = Math.min(size, bytes);
			const buf = Buffer.alloc(length);
			readSync(fd, buf, 0, length, fromEnd ? size - length : 0);
			return buf.toString('utf8');
		} finally {
			closeSync(fd);
		}
	} catch {
		return null;
	}
}

export const readTail = (path: string, bytes: number) => readSlice(path, bytes, true);
export const readHead = (path: string, bytes: number) => readSlice(path, bytes, false);

export function listDir(path: string): string[] {
	try {
		return readdirSync(path);
	} catch {
		return [];
	}
}

export function hostFs(home = homedir(), env: Record<string, string | undefined> = process.env): HostFs {
	return {
		home,
		env: name => env[name],
		exists: path => existsSync(path),
		readText,
		readTail,
		readHead,
		listDir,
		mtimeMs,
	};
}
