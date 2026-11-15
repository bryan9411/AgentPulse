import {closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeFileSync, writeSync} from 'node:fs';
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
