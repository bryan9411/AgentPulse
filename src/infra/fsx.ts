import {closeSync, existsSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, writeFileSync, writeSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, isAbsolute, join, resolve} from 'node:path';

export function expandHome(path: string, home = homedir()): string {
	if (path === '~') return home;
	if (path.startsWith('~/')) return join(home, path.slice(2));
	return path;
}

// 相對路徑以家目錄為基準：雙擊啟動時工作目錄不固定，側欄本身的 cwd 對使用者無意義
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

// 先寫暫存檔再 rename，避免寫到一半當機導致設定檔損毀
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

// 提供給各家 AI adapter 使用的唯讀檔案介面，避免 adapter 直接相依 infra/ 並方便測試注入假檔案
export type HostFs = {
	home: string;
	env(name: string): string | undefined;
	exists(path: string): boolean;
	readText(path: string): string | null;
	// 僅讀取檔尾指定 bytes，避免大型 log 檔爆記憶體
	readTail(path: string, bytes: number): string | null;
	readHead(path: string, bytes: number): string | null;
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
