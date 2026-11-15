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

export type GitStats = {branch: string | null; added: number; removed: number; untracked: number};

// "3 files changed, 10 insertions(+), 2 deletions(-)"; empty when nothing changed.
export function parseShortstat(text: string): {added: number; removed: number} {
	const added = /(\d+) insertions?\(\+\)/.exec(text);
	const removed = /(\d+) deletions?\(-\)/.exec(text);
	return {added: Number(added?.[1] ?? 0), removed: Number(removed?.[1] ?? 0)};
}

// SPEC 5.5 line 3. null when the folder is not a usable repository.
export async function gitStats(dir: string): Promise<GitStats | null> {
	const [branch, diff, untracked] = await Promise.all([
		currentBranch(dir),
		git(dir, ['diff', 'HEAD', '--shortstat']),
		git(dir, ['ls-files', '--others', '--exclude-standard', '-z']),
	]);
	if (!untracked.ok) return null;
	// A repository without commits has no HEAD to diff against.
	const counts = diff.ok ? parseShortstat(diff.stdout) : {added: 0, removed: 0};
	const files = untracked.stdout.split('\0').filter(Boolean).length;
	return {branch, ...counts, untracked: files};
}
