import {realpathSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {msg, type Message} from '../i18n/strings.ts';
import {isDirectory, missingOrEmptyDir, removeEmptyDirs} from '../infra/fsx.ts';
import {
	branchExists,
	currentBranch,
	headCommit,
	localBranches,
	validBranchName,
	worktreeAddExisting,
	worktreeAddNew,
	worktreeEntries,
	worktreePrune,
	worktreeRemove,
	type GitResult,
} from '../infra/git.ts';

type Refusal = {ok: false; error: Message};
const refuse = (...args: Parameters<typeof msg>): Refusal => ({ok: false, error: msg(...args)});

function canonicalPath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

export function worktreeRoot(project: string): string {
	return join(dirname(project), `${basename(project)}.worktrees`);
}

export function worktreePath(project: string, branch: string): string {
	return join(worktreeRoot(project), branch.trim());
}

export type WorktreeBranchOption = {
	branch: string;
	status: 'existing' | 'worktree';
};

// 列出專案內可選的既有分支：排除已在主資料夾或非預期路徑開啟的分支，避免選取後遭 git 拒絕
export async function listWorktreeBranches(project: string): Promise<{base: string | null; branches: WorktreeBranchOption[]}> {
	const [base, locals, entries] = await Promise.all([currentBranch(project), localBranches(project), worktreeEntries(project)]);
	const canonicalProject = canonicalPath(project);
	const checkedOut = new Map<string, string>();
	for (const entry of entries) {
		if (entry.branch) checkedOut.set(entry.branch, canonicalPath(entry.path));
	}
	const branches: WorktreeBranchOption[] = [];
	for (const branch of locals) {
		const holder = checkedOut.get(branch);
		if (!holder) {
			branches.push({branch, status: 'existing'});
		} else if (holder !== canonicalProject && holder === canonicalPath(worktreePath(project, branch))) {
			branches.push({branch, status: 'worktree'});
		}
	}
	branches.sort((a, b) => a.branch.localeCompare(b.branch));
	return {base, branches};
}

export type OpenWorktreePlan =
	| {ok: true; branch: string; path: string; mode: 'reuse' | 'existing'}
	| {ok: true; branch: string; path: string; mode: 'create'; startPoint: string};

export type OpenWorktreeCheck = OpenWorktreePlan | Refusal;

// 執行 `git worktree add` 前先完成所有檢查：支援沿用既有 worktree、開啟未掛載的既有分支，或從目前 HEAD 建立新分支
export async function checkOpenWorktree(project: string, input: string): Promise<OpenWorktreeCheck> {
	const branch = input.trim();
	if (!branch) return refuse('branchEmpty');
	if (!(await validBranchName(project, branch))) return refuse('branchInvalid');
	const path = worktreePath(project, branch);
	// check-ref-format 已擋掉 ".."，這裡額外確保路徑仍位於 worktree 根目錄底下
	if (!path.startsWith(`${worktreeRoot(project)}/`)) return refuse('branchInvalid');

	const entries = await worktreeEntries(project);
	const holder = entries.find(e => e.branch === branch);
	const targetCanonical = canonicalPath(path);
	const projectCanonical = canonicalPath(project);
	if (holder) {
		const holderCanonical = canonicalPath(holder.path);
		if (holderCanonical === targetCanonical) return {ok: true, branch, path, mode: 'reuse'};
		if (holderCanonical === projectCanonical) return refuse('branchInMain', branch);
		return refuse('branchInUse', branch, holder.path);
	}

	if (!missingOrEmptyDir(path)) return refuse('folderExists', path);
	if (await branchExists(project, branch)) return {ok: true, branch, path, mode: 'existing'};

	if (!(await headCommit(project))) return refuse('noCommits');
	const startPoint = (await currentBranch(project)) ?? 'HEAD';
	return {ok: true, branch, path, mode: 'create', startPoint};
}

export async function openWorktree(project: string, input: string): Promise<OpenWorktreeCheck> {
	const check = await checkOpenWorktree(project, input);
	if (!check.ok || check.mode === 'reuse') return check;
	const added =
		check.mode === 'create'
			? await worktreeAddNew(project, check.branch, check.path, check.startPoint)
			: await worktreeAddExisting(project, check.branch, check.path);
	return added.ok ? check : refuse('worktreeFailed', added.detail);
}

// 僅移除獨立 worktree 資料夾、絕不刪除 git 分支；若資料夾內尚有未提交修改由 git 自行拒絕
export async function removeWorktreeFolder(project: string, cwd: string): Promise<GitResult> {
	if (canonicalPath(cwd) === canonicalPath(project)) return {ok: false, detail: 'cannot remove main folder'};
	if (!isDirectory(cwd)) {
		await worktreePrune(project);
		removeEmptyDirs(dirname(cwd), worktreeRoot(project));
		return {ok: true};
	}
	const removed = await worktreeRemove(project, cwd);
	if (!removed.ok) return removed;
	removeEmptyDirs(dirname(cwd), worktreeRoot(project));
	return {ok: true};
}
