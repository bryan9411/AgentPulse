import {committedFiles, currentBranch, headCommit, statusEntries} from '../infra/git.ts';

// SPEC 5.10.

export type FolderChanges = {cwd: string; branch: string; files: readonly string[]};

export type Conflict = {file: string; branches: string[]};

// Files touched in two or more working folders. Most widely shared first.
export function findConflicts(folders: readonly FolderChanges[]): Conflict[] {
	const byFile = new Map<string, Set<string>>();
	const seen = new Set<string>();
	for (const folder of folders) {
		// Several AIs in one folder share the same files; that is not a conflict.
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

// Uncommitted changes plus, with a mainline, what the branch has committed
// since leaving it. null when the folder cannot be read.
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

// The mainline is whatever the main folder has checked out now; the main
// folder itself only contributes its uncommitted changes.
export async function scanProject(project: string, folders: ReadonlyArray<{cwd: string; branch: string}>): Promise<Conflict[]> {
	const mainline = await headCommit(project);
	const changes = await Promise.all(
		folders.map(async folder => {
			const files = await folderFiles(folder.cwd, folder.cwd === project ? null : mainline);
			// A folder that is gone is left out rather than failing the scan.
			if (!files) return null;
			return {cwd: folder.cwd, branch: (await currentBranch(folder.cwd)) ?? folder.branch, files};
		}),
	);
	return findConflicts(changes.filter(c => c !== null));
}
