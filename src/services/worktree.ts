import {basename, dirname, join} from 'node:path';
import {msg, type Message} from '../i18n/strings.ts';
import {isDirectory, missingOrEmptyDir, removeEmptyDirs} from '../infra/fsx.ts';
import {
	branchExists,
	commitAll,
	currentBranch,
	deleteBranch,
	headCommit,
	ignoredEntries,
	mergeAbort,
	mergeInProgress,
	mergeNoFf,
	statusEntries,
	unmergedFiles,
	validBranchName,
	worktreeAdd,
	worktreeRemove,
} from '../infra/git.ts';

// SPEC 5.9. Nothing here forces anything: every destructive git command is
// the plain one that refuses when work would be lost.

type Refusal = {ok: false; error: Message};
const refuse = (...args: Parameters<typeof msg>): Refusal => ({ok: false, error: msg(...args)});

export function worktreeRoot(project: string): string {
	return join(dirname(project), `${basename(project)}.worktrees`);
}

// `<parent>/<project>.worktrees/<branch>`; a branch with slashes nests.
export function worktreePath(project: string, branch: string): string {
	return join(worktreeRoot(project), branch.trim());
}

export type NewWorktree = {ok: true; branch: string; path: string; base: string};

// Everything that can be known before `git worktree add`, so a refusal
// leaves nothing behind.
export async function checkCreate(project: string, input: string): Promise<NewWorktree | Refusal> {
	const branch = input.trim();
	if (!branch) return refuse('branchEmpty');
	const base = await currentBranch(project);
	if (!base) return refuse('mainNoBranch');
	if (!(await headCommit(project))) return refuse('noCommits');
	if (!(await validBranchName(project, branch))) return refuse('branchInvalid');
	const path = worktreePath(project, branch);
	// check-ref-format already rejects "..", this only guards the join.
	if (!path.startsWith(`${worktreeRoot(project)}/`)) return refuse('branchInvalid');
	// If the folder already exists as an active worktree on this branch, we can reuse it.
	if (isDirectory(path) && (await currentBranch(path)) === branch) {
		return {ok: true, branch, path, base};
	}
	if (await branchExists(project, branch)) return refuse('branchExists', branch);
	if (!missingOrEmptyDir(path)) return refuse('folderExists', path);
	return {ok: true, branch, path, base};
}

export async function createWorktree(project: string, input: string): Promise<NewWorktree | Refusal> {
	const check = await checkCreate(project, input);
	if (!check.ok) return check;
	if (isDirectory(check.path) && (await currentBranch(check.path)) === check.branch) {
		return check;
	}
	const added = await worktreeAdd(project, check.branch, check.path, check.base);
	return added.ok ? check : refuse('worktreeFailed', added.detail);
}

export type MergeTarget = {
	// The project's main folder, where the merge happens.
	project: string;
	// The session's folder.
	cwd: string;
	// @ap-base: the branch to merge back into.
	base: string;
	// @ap-worktree.
	worktree: boolean;
	running: boolean;
};

export type MergePlan = {
	branch: string;
	base: string;
	project: string;
	path: string;
	// Changed and new files the commit step would pick up; 0 skips that step.
	dirty: number;
	// Not in git, yet deleted together with the folder.
	ignored: string[];
};

export type MergeCheck = {ok: true; plan: MergePlan} | Refusal;

// Steps 1–3: read-only, run both before the confirmation is shown and again
// right before acting on it.
export async function planMerge(target: MergeTarget): Promise<MergeCheck> {
	if (!target.worktree || !target.base || target.cwd === target.project) return refuse('notWorktree');
	if (target.running) return refuse('aiRunning');
	if (!isDirectory(target.cwd)) return refuse('worktreeMissing', target.cwd);
	const branch = await currentBranch(target.cwd);
	if (!branch) return refuse('worktreeNoBranch');
	const changes = await statusEntries(target.cwd);
	if (!changes) return refuse('worktreeMissing', target.cwd);
	const mainBranch = await currentBranch(target.project);
	if (mainBranch !== target.base) return refuse('mainNotOnBase', target.base, mainBranch ?? 'HEAD');
	// Our own `merge --abort` must never undo a merge the user had going.
	if (await mergeInProgress(target.project)) return refuse('mainMerging');
	const main = await statusEntries(target.project);
	if (!main) return refuse('mainUnreadable');
	// Untracked files do not block a merge; git refuses by itself if one is in the way.
	if (main.some(entry => entry.code !== '??')) return refuse('mainDirty');
	const ignored = (await ignoredEntries(target.cwd)) ?? [];
	return {
		ok: true,
		plan: {branch, base: target.base, project: target.project, path: target.cwd, dirty: changes.length, ignored},
	};
}

export type MergeOutcome =
	| {kind: 'merged'; branch: string; base: string}
	// A check failed; nothing was changed.
	| {kind: 'blocked'; error: Message}
	| {kind: 'commit-failed'; detail: string}
	// The merge was started and undone. `aborted` false: git could not undo it.
	| {kind: 'conflict'; branch: string; files: string[]; aborted: boolean; committed: boolean}
	// git refused before merging anything.
	| {kind: 'merge-failed'; branch: string; detail: string; committed: boolean}
	// Merged; a later step stopped and everything after it is still there.
	| {kind: 'cleanup-failed'; step: 'close' | 'folder' | 'branch'; base: string; detail: string};

export type MergeDeps = {
	// True once the session is gone.
	closeSession(): Promise<boolean>;
};

export async function runMerge(target: MergeTarget, message: string, deps: MergeDeps): Promise<MergeOutcome> {
	const check = await planMerge(target);
	if (!check.ok) return {kind: 'blocked', error: check.error};
	const {plan} = check;
	const {branch, base} = plan;
	let committed = false;
	if (plan.dirty > 0) {
		if (!message.trim()) return {kind: 'blocked', error: msg('needMessage')};
		const commit = await commitAll(plan.path, message.trim());
		if (!commit.ok) return {kind: 'commit-failed', detail: commit.detail};
		committed = true;
	}

	const merged = await mergeNoFf(plan.project, branch);
	if (!merged.ok) {
		// No MERGE_HEAD: git stopped before touching anything, nothing to undo.
		if (!(await mergeInProgress(plan.project))) return {kind: 'merge-failed', branch, detail: merged.detail, committed};
		const files = await unmergedFiles(plan.project);
		const aborted = (await mergeAbort(plan.project)).ok;
		// Started but stopped for another reason (e.g. no committer identity).
		if (files.length === 0 && aborted) return {kind: 'merge-failed', branch, detail: merged.detail, committed};
		return {kind: 'conflict', branch, files, aborted, committed};
	}

	if (!(await deps.closeSession())) return {kind: 'cleanup-failed', step: 'close', base, detail: ''};
	const removed = await worktreeRemove(plan.project, plan.path);
	if (!removed.ok) return {kind: 'cleanup-failed', step: 'folder', base, detail: removed.detail};
	const deleted = await deleteBranch(plan.project, branch);
	if (!deleted.ok) return {kind: 'cleanup-failed', step: 'branch', base, detail: deleted.detail};
	// "feat/x" leaves an empty "feat" behind.
	removeEmptyDirs(dirname(plan.path), worktreeRoot(plan.project));
	return {kind: 'merged', branch, base};
}
