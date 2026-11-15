import {basename, dirname} from 'node:path';
import {exec, resolveBin} from './exec.ts';
import {platform} from './platform/index.ts';

let cachedBin: string | null | undefined;
export function gitBin(): string | null {
	if (cachedBin === undefined) cachedBin = resolveBin('git', platform.binDirs);
	return cachedBin;
}

const git = (dir: string, args: string[]) => exec([gitBin() ?? 'git', '-C', dir, ...args]);

// A project is the main working tree. Launching from inside a linked
// worktree must still register the main folder, so derive it from the
// shared git dir rather than --show-toplevel alone.
export async function projectRoot(dir: string): Promise<string | null> {
	const result = await git(dir, ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir']);
	if (!result.ok) return null;
	const [toplevel, commonDir] = result.stdout.trim().split('\n');
	if (!toplevel || !commonDir) return null;
	return basename(commonDir) === '.git' ? dirname(commonDir) : toplevel;
}

export async function currentBranch(dir: string): Promise<string | null> {
	const result = await git(dir, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
	return result.ok ? result.stdout.trim() : null;
}
