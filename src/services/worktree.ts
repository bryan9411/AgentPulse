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

// 全程不使用強制選項，任何破壞性 git 指令若會遺失修改就交由 git 拒絕
type Refusal = {ok: false; error: Message};
const refuse = (...args: Parameters<typeof msg>): Refusal => ({ok: false, error: msg(...args)});

export function worktreeRoot(project: string): string {
	return join(dirname(project), `${basename(project)}.worktrees`);
}

export function worktreePath(project: string, branch: string): string {
	return join(worktreeRoot(project), branch.trim());
}

export type NewWorktree = {ok: true; branch: string; path: string; base: string};

// 執行 `git worktree add` 前先檢查完所有條件，確保拒絕時不會留下殘留資料夾或分支
export async function checkCreate(project: string, input: string): Promise<NewWorktree | Refusal> {
	const branch = input.trim();
	if (!branch) return refuse('branchEmpty');
	const base = await currentBranch(project);
	if (!base) return refuse('mainNoBranch');
	if (!(await headCommit(project))) return refuse('noCommits');
	if (!(await validBranchName(project, branch))) return refuse('branchInvalid');
	const path = worktreePath(project, branch);
	// check-ref-format 已擋掉 ".."，這裡額外確保路徑仍位於 worktree 根目錄底下
	if (!path.startsWith(`${worktreeRoot(project)}/`)) return refuse('branchInvalid');
	// 若同分支的 worktree 資料夾已存在（例如要在同一分支再開第二家 AI），直接沿用
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
	project: string;
	cwd: string;
	base: string;
	worktree: boolean;
	running: boolean;
};

export type MergePlan = {
	branch: string;
	base: string;
	project: string;
	path: string;
	dirty: number;
	// 雖被 git 忽略但移除 worktree 時會一併被刪除的項目（如 .env、node_modules）
	ignored: string[];
};

export type MergeCheck = {ok: true; plan: MergePlan} | Refusal;

// 唯讀前置檢查：顯示合併確認視窗前執行一次，按下確認執行合併前也會重檢一次
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
	// 若主資料夾本來就有進行到一半的合併必須先中止，以免後續 merge --abort 誤還原使用者的合併
	if (await mergeInProgress(target.project)) return refuse('mainMerging');
	const main = await statusEntries(target.project);
	if (!main) return refuse('mainUnreadable');
	// 未追蹤檔案不阻擋合併；若真的撞檔名會由 git 自行拒絕
	if (main.some(entry => entry.code !== '??')) return refuse('mainDirty');
	const ignored = (await ignoredEntries(target.cwd)) ?? [];
	return {
		ok: true,
		plan: {branch, base: target.base, project: target.project, path: target.cwd, dirty: changes.length, ignored},
	};
}

export type MergeOutcome =
	| {kind: 'merged'; branch: string; base: string}
	| {kind: 'blocked'; error: Message}
	| {kind: 'commit-failed'; detail: string}
	| {kind: 'conflict'; branch: string; files: string[]; aborted: boolean; committed: boolean}
	| {kind: 'merge-failed'; branch: string; detail: string; committed: boolean}
	| {kind: 'cleanup-failed'; step: 'close' | 'folder' | 'branch'; base: string; detail: string};

export type MergeDeps = {
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
		// 沒有 MERGE_HEAD 代表 git 在動手合併前就拒絕了（例如會覆蓋未追蹤檔案），不需要 abort
		if (!(await mergeInProgress(plan.project))) return {kind: 'merge-failed', branch, detail: merged.detail, committed};
		const files = await unmergedFiles(plan.project);
		const aborted = (await mergeAbort(plan.project)).ok;
		// 有進入合併流程但因衝突以外的原因失敗（例如未設定 git user.name）
		if (files.length === 0 && aborted) return {kind: 'merge-failed', branch, detail: merged.detail, committed};
		return {kind: 'conflict', branch, files, aborted, committed};
	}

	if (!(await deps.closeSession())) return {kind: 'cleanup-failed', step: 'close', base, detail: ''};
	const removed = await worktreeRemove(plan.project, plan.path);
	if (!removed.ok) return {kind: 'cleanup-failed', step: 'folder', base, detail: removed.detail};
	const deleted = await deleteBranch(plan.project, branch);
	if (!deleted.ok) return {kind: 'cleanup-failed', step: 'branch', base, detail: deleted.detail};
	// 像 "feat/x" 這類含斜線的分支移除後，順便清掉變空的 "feat" 上層資料夾
	removeEmptyDirs(dirname(plan.path), worktreeRoot(plan.project));
	return {kind: 'merged', branch, base};
}
