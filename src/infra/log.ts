import {appendFileSync, mkdirSync, statSync, truncateSync} from 'node:fs';
import {dirname} from 'node:path';

const MAX_BYTES = 1024 * 1024;
let logPath: string | null = null;

// The sidebar owns the screen, so failures go to a file instead of stderr.
export function configureLog(path: string): void {
	logPath = path;
	try {
		mkdirSync(dirname(path), {recursive: true});
		if (statSync(path).size > MAX_BYTES) truncateSync(path, 0);
	} catch {
		// Missing file is fine; it is created on first write.
	}
}

export function logError(message: string): void {
	if (!logPath) return;
	try {
		appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
	} catch {
		// Logging must never take the UI down.
	}
}
