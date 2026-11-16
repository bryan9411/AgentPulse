import {basename, dirname} from 'node:path';
import {exec, resolveBin, type ExecFail, type ExecOptions} from './exec.ts';
import {platform} from './platform/index.ts';

let cachedBin: string | null | undefined;
export function gitBin(): string | null {
	if (cachedBin === undefined) cachedBin = resolveBin('git', platform.binDirs);
	return cachedBin;
}

const git = (dir: string, args: string[], opts?: ExecOptions) => exec([gitBin() ?? 'git', '-C', dir, ...args], opts);

// 專案一律對應到主儲存庫資料夾；即使從 linked worktree 啟動，也要透過 git common dir 回推主資料夾
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

export function parseShortstat(text: string): {added: number; removed: number} {
	const added = /(\d+) insertions?\(\+\)/.exec(text);
	const removed = /(\d+) deletions?\(-\)/.exec(text);
	return {added: Number(added?.[1] ?? 0), removed: Number(removed?.[1] ?? 0)};
}

export async function gitStats(dir: string): Promise<GitStats | null> {
	const [branch, diff, untracked] = await Promise.all([
		currentBranch(dir),
		git(dir, ['diff', 'HEAD', '--shortstat']),
		git(dir, ['ls-files', '--others', '--exclude-standard', '-z']),
	]);
	if (!untracked.ok) return null;
	// 尚無任何 commit 的儲存庫沒有 HEAD 可比較
	const counts = diff.ok ? parseShortstat(diff.stdout) : {added: 0, removed: 0};
	const files = untracked.stdout.split('\0').filter(Boolean).length;
	return {branch, ...counts, untracked: files};
}

// commit hook、大量檔案合併或刪除大型資料夾都可能超過一般 5 秒逾時
const SLOW_MS = 120_000;

export type GitResult = {ok: true} | {ok: false; detail: string};

// git 輸出會受系統語系影響，只原樣顯示給使用者看、不以字串內容做程式判斷
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

export async function headCommit(dir: string): Promise<string | null> {
	const result = await git(dir, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
	return result.ok ? result.stdout.trim() || null : null;
}

export type WorktreeEntry = {
	path: string;
	branch: string | null;
};

// 解析 `git worktree list --porcelain -z`：各區塊以空欄位分隔，分支格式為 "branch refs/heads/<name>"
export function parseWorktreeListZ(text: string): WorktreeEntry[] {
	const entries: WorktreeEntry[] = [];
	let currentPath: string | null = null;
	let currentBranch: string | null = null;
	const flush = () => {
		if (currentPath !== null) entries.push({path: currentPath, branch: currentBranch});
		currentPath = null;
		currentBranch = null;
	};
	for (const field of text.split('\0')) {
		if (field === '') {
			flush();
			continue;
		}
		if (field.startsWith('worktree ')) currentPath = field.slice('worktree '.length);
		else if (field.startsWith('branch refs/heads/')) currentBranch = field.slice('branch refs/heads/'.length);
	}
	flush();
	return entries;
}

export async function worktreeEntries(project: string): Promise<WorktreeEntry[]> {
	const result = await git(project, ['worktree', 'list', '--porcelain', '-z']);
	return result.ok ? parseWorktreeListZ(result.stdout) : [];
}

export async function localBranches(project: string): Promise<string[]> {
	const result = await git(project, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
	return result.ok ? result.stdout.split('\n').map(b => b.trim()).filter(Boolean) : [];
}

export function worktreeAddNew(project: string, branch: string, path: string, startPoint: string): Promise<GitResult> {
	return outcome(git(project, ['worktree', 'add', '-b', branch, path, startPoint], {timeoutMs: SLOW_MS}));
}

export function worktreeAddExisting(project: string, branch: string, path: string): Promise<GitResult> {
	return outcome(git(project, ['worktree', 'add', path, branch], {timeoutMs: SLOW_MS}));
}

// 不使用強制選項：資料夾內若有未提交或未追蹤檔案讓 git 自行拒絕
export function worktreeRemove(project: string, path: string): Promise<GitResult> {
	return outcome(git(project, ['worktree', 'remove', path], {timeoutMs: SLOW_MS}));
}

export function worktreePrune(project: string): Promise<GitResult> {
	return outcome(git(project, ['worktree', 'prune'], {timeoutMs: SLOW_MS}));
}

export type StatusEntry = {
	code: string;
	path: string;
	from?: string;
};

// `git status --porcelain -z`：每筆為 "XY path\0"，重新命名或複製會多帶一個原始路徑欄位；-z 可避免中文路徑被跳脫
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

export async function statusEntries(dir: string): Promise<StatusEntry[] | null> {
	const result = await git(dir, ['status', '--porcelain', '-z', '--untracked-files=all']);
	return result.ok ? parseStatusZ(result.stdout) : null;
}

// 加上 --no-renames：若偵測更名會連舊路徑一起算進來，可能誤報其他分支正在修改的檔案
export async function committedFiles(dir: string, base: string): Promise<string[] | null> {
	const result = await git(dir, ['diff', '--name-only', '--no-renames', '-z', `${base}...HEAD`]);
	return result.ok ? zList(result.stdout) : null;
}
