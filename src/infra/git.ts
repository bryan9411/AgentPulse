import {basename, dirname} from 'node:path';
import {exec, resolveBin, type ExecFail, type ExecOptions} from './exec.ts';
import {platform} from './platform/index.ts';

let cachedBin: string | null | undefined;
export function gitBin(): string | null {
	if (cachedBin === undefined) cachedBin = resolveBin('git', platform.binDirs);
	return cachedBin;
}

const git = (dir: string, args: string[], opts?: ExecOptions) => exec([gitBin() ?? 'git', '-C', dir, ...args], opts);

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

// ---- Worktrees, merging, changed files (SPEC 5.9, 5.10) ----

// Commit hooks, a merge of many files or deleting a large folder take far
// longer than a query.
const SLOW_MS = 120_000;

export type GitResult = {ok: true} | {ok: false; detail: string};

// What git itself said, for the user to read. git may print in the system
// language, so this text is only ever shown, never parsed.
function failure(result: ExecFail): GitResult {
	const lines = `${result.stderr}\n${result.stdout}`.split('\n').map(line => line.trim()).filter(Boolean);
	return {ok: false, detail: result.kind === 'exit' ? (lines[0] ?? result.message) : result.message};
}

const outcome = async (run: ReturnType<typeof git>): Promise<GitResult> => {
	const result = await run;
	return result.ok ? {ok: true} : failure(result);
};

const zList = (text: string) => text.split('\0').filter(Boolean);

export async function validBranchName(dir: string, name: string): Promise<boolean> {
	return (await git(dir, ['check-ref-format', '--branch', name])).ok;
}

export async function branchExists(dir: string, name: string): Promise<boolean> {
	return (await git(dir, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`])).ok;
}

// null for a repository without commits, or a folder that is not one.
export async function headCommit(dir: string): Promise<string | null> {
	const result = await git(dir, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
	return result.ok ? result.stdout.trim() || null : null;
}

export function worktreeAdd(project: string, branch: string, path: string, base: string): Promise<GitResult> {
	return outcome(git(project, ['worktree', 'add', '-b', branch, path, base], {timeoutMs: SLOW_MS}));
}

// Never forced: git refuses while the folder holds modified or untracked files.
export function worktreeRemove(project: string, path: string): Promise<GitResult> {
	return outcome(git(project, ['worktree', 'remove', path], {timeoutMs: SLOW_MS}));
}

// -d, never -D: git refuses a branch that is not merged.
export function deleteBranch(project: string, branch: string): Promise<GitResult> {
	return outcome(git(project, ['branch', '-d', branch]));
}

export type StatusEntry = {
	// The two status letters, e.g. " M", "A ", "??", "UU".
	code: string;
	path: string;
	// Where a renamed or copied file came from.
	from?: string;
};

// `git status --porcelain -z`: "XY path\0", and for a rename or copy the
// original path as one more field. -z keeps CJK names unescaped.
export function parseStatusZ(text: string): StatusEntry[] {
	const fields = text.split('\0');
	const out: StatusEntry[] = [];
	for (let i = 0; i < fields.length; i++) {
		const field = fields[i] ?? '';
		if (field.length < 4) continue;
		const code = field.slice(0, 2);
		const entry: StatusEntry = {code, path: field.slice(3)};
		if (code.includes('R') || code.includes('C')) {
			const from = fields[++i];
			if (from) entry.from = from;
		}
		out.push(entry);
	}
	return out;
}

// Uncommitted changes, new files listed one by one. null when the folder
// could not be read as a repository.
export async function statusEntries(dir: string): Promise<StatusEntry[] | null> {
	const result = await git(dir, ['status', '--porcelain', '-z', '--untracked-files=all']);
	return result.ok ? parseStatusZ(result.stdout) : null;
}

// Top-level ignored files and folders (.env, node_modules/): not in git, yet
// removed together with a worktree.
export async function ignoredEntries(dir: string): Promise<string[] | null> {
	const result = await git(dir, ['status', '--porcelain', '-z', '--ignored']);
	return result.ok ? parseStatusZ(result.stdout).filter(e => e.code === '!!').map(e => e.path) : null;
}

// Files this branch changed in commits since it left `base` (SPEC 5.10).
// --no-renames: a rename lists the old path too, which another branch may
// still be editing.
export async function committedFiles(dir: string, base: string): Promise<string[] | null> {
	const result = await git(dir, ['diff', '--name-only', '--no-renames', '-z', `${base}...HEAD`]);
	return result.ok ? zList(result.stdout) : null;
}

// Everything in the folder, new files included: a worktree with untracked
// files left in it cannot be removed afterwards.
export async function commitAll(dir: string, message: string): Promise<GitResult> {
	const added = await outcome(git(dir, ['add', '-A'], {timeoutMs: SLOW_MS}));
	if (!added.ok) return added;
	return outcome(git(dir, ['commit', '-m', message], {timeoutMs: SLOW_MS}));
}

// --no-edit: the default merge message, never an editor.
export function mergeNoFf(project: string, branch: string): Promise<GitResult> {
	return outcome(git(project, ['merge', '--no-ff', '--no-edit', branch], {timeoutMs: SLOW_MS}));
}

export async function mergeInProgress(project: string): Promise<boolean> {
	return (await git(project, ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'])).ok;
}

export async function unmergedFiles(project: string): Promise<string[]> {
	const result = await git(project, ['diff', '--name-only', '--diff-filter=U', '-z']);
	return result.ok ? zList(result.stdout) : [];
}

export function mergeAbort(project: string): Promise<GitResult> {
	return outcome(git(project, ['merge', '--abort'], {timeoutMs: SLOW_MS}));
}
