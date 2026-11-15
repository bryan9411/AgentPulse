import {homedir} from 'node:os';
import {join} from 'node:path';
import {exec} from '../exec.ts';
import type {Platform} from './types.ts';

// Title and body go in as argv, never spliced into the script, so quotes in
// a branch name cannot break out of the AppleScript string.
const NOTIFY_SCRIPT = ['on run argv', 'display notification (item 2 of argv) with title (item 1 of argv)', 'end run'];

export const darwin: Platform = {
	id: 'darwin',
	// Apple Silicon Homebrew, Intel Homebrew, then ~/.local/bin where agy and
	// Claude Code's native installer put their binaries.
	binDirs: ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local', 'bin')],
	async notify(title, body) {
		const script = NOTIFY_SCRIPT.flatMap(line => ['-e', line]);
		return (await exec(['/usr/bin/osascript', ...script, title, body], {timeoutMs: 5000})).ok;
	},
};
