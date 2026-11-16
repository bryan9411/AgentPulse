import {appendFileSync, mkdirSync, statSync, truncateSync} from 'node:fs';
import {dirname} from 'node:path';

const MAX_BYTES = 1024 * 1024;
let logPath: string | null = null;

// 側欄佔用終端機畫面，錯誤改寫入 log 檔以免破壞畫面
export function configureLog(path: string): void {
	logPath = path;
	try {
		mkdirSync(dirname(path), {recursive: true});
		if (statSync(path).size > MAX_BYTES) truncateSync(path, 0);
	} catch {
	}
}

export function logError(message: string): void {
	if (!logPath) return;
	try {
		appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
	} catch {
	}
}
