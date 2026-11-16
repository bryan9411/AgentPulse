import {committedFiles, currentBranch, headCommit, statusEntries} from '../infra/git.ts';

export type FolderChanges = {cwd: string; branch: string; files: readonly string[]};

export type Conflict = {file: string; branches: string[]};

export function findConflicts(folders: readonly FolderChanges[]): Conflict[] {
	const byFile = new Map<string, Set<string>>();
	const seen = new Set<string>();
	for (const folder of folders) {
		// 多個 AI 在同一個資料夾共用檔案不算衝突
		if (seen.has(folder.cwd)) continue;
		seen.add(folder.cwd);
		for (const file of new Set(folder.files)) {
			const branches = byFile.get(file) ?? new Set<string>();
			branches.add(folder.branch);
			byFile.set(file, branches);
		}
	}
	return [...byFile]
		.filter(([, branches]) => branches.size >= 2)
		.map(([file, branches]) => ({file, branches: [...branches].sort()}))
		.sort((a, b) => b.branches.length - a.branches.length || a.file.localeCompare(b.file));
}

export function involvedBranches(conflicts: readonly Conflict[]): number {
	return new Set(conflicts.flatMap(c => c.branches)).size;
}

export async function folderFiles(cwd: string, mainline: string | null): Promise<string[] | null> {
	const status = await statusEntries(cwd);
	if (!status) return null;
	const files = new Set<string>();
	for (const entry of status) {
		files.add(entry.path);
		if (entry.from) files.add(entry.from);
	}
	if (mainline) for (const file of (await committedFiles(cwd, mainline)) ?? []) files.add(file);
	return [...files];
}

// 主線以主資料夾目前所在 commit 為準，且主資料夾本身只算未提交修改，不與自己算 commit 差異
export async function scanProject(project: string, folders: ReadonlyArray<{cwd: string; branch: string}>): Promise<Conflict[]> {
	const mainline = await headCommit(project);
	const changes = await Promise.all(
		folders.map(async folder => {
			const files = await folderFiles(folder.cwd, folder.cwd === project ? null : mainline);
			// 已消失的資料夾直接跳過，不中斷其餘掃描
			if (!files) return null;
			return {cwd: folder.cwd, branch: (await currentBranch(folder.cwd)) ?? folder.branch, files};
		}),
	);
	return findConflicts(changes.filter(c => c !== null));
}
