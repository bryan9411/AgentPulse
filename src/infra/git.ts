import {basename, dirname} from 'node:path';
import {exec, resolveBin, type ExecOptions} from './exec.ts';
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

export async function headCommit(dir: string): Promise<string | null> {
	const result = await git(dir, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
	return result.ok ? result.stdout.trim() || null : null;
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
