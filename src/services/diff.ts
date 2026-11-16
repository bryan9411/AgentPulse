import {closeSync, openSync, readFileSync, readSync, statSync} from 'node:fs';
import {join} from 'node:path';
import type {Lang} from '../i18n/strings.ts';
import {exec, resolveBin} from '../infra/exec.ts';
import {gitBin, headCommit, statusEntries} from '../infra/git.ts';
import {logError} from '../infra/log.ts';
import {platform} from '../infra/platform/index.ts';
import {selfCommand} from '../infra/self.ts';

export type DiffFile = {
	path: string;
	from?: string;
	code: string;
	added: number;
	removed: number;
	binary: boolean;
	untracked: boolean;
};

export type FileDiffData =
	| {kind: 'binary'; usedDelta: false}
	| {kind: 'empty'; usedDelta: false}
	| {kind: 'delta'; lines: string[]; rawDiff: string; usedDelta: true}
	| {kind: 'raw'; rawDiff: string; usedDelta: false};

export type Numstat = {added: number; removed: number; binary: boolean};

const MAX_UNTRACKED_BYTES = 2 * 1024 * 1024;
const DELTA_TIMEOUT_MS = 10_000;

let cachedDelta: string | null | undefined;

export function deltaBin(): string | null {
	if (cachedDelta === undefined) cachedDelta = resolveBin('delta', platform.binDirs);
	return cachedDelta;
}

export function hasDelta(): boolean {
	return deltaBin() !== null;
}

export function diffPopupCommand(cwd: string, lang: Lang, title?: string): string {
	const args = ['--cwd', cwd, '--lang', lang];
	if (title) args.push('--title', title);
	return selfCommand('diff', args);
}

export function helpPopupCommand(lang: Lang): string {
	return selfCommand('help', ['--lang', lang]);
}

export function deltaArgs(width: number, sideBySide: boolean): string[] {
	const args = ['--paging=never', '--dark', `--width=${Math.max(40, width)}`];
	args.push(sideBySide ? '--side-by-side' : '--line-numbers');
	return args;
}

// 展開 tab 避免各終端機跳格寬度不一導致 Ink 版面錯位，並移除結尾單一空行
export function normalizeAnsiOutput(stdout: string): string[] {
	const clean = stdout.replaceAll('\r', '').replaceAll('\t', '    ');
	const lines = clean.split('\n');
	if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
	return lines;
}

// 解析 git diff --numstat -z；更名或複製的格式為 "新增\t刪除\t\0舊路徑\0新路徑\0"
export function parseNumstatZ(text: string): Map<string, Numstat> {
	const out = new Map<string, Numstat>();
	const fields = text.split('\0');
	for (let i = 0; i < fields.length; i++) {
		const field = fields[i] ?? '';
		if (!field) continue;
		const match = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(field);
		if (!match) continue;
		const binary = match[1] === '-' || match[2] === '-';
		const added = binary ? 0 : Number(match[1]);
		const removed = binary ? 0 : Number(match[2]);
		let path = match[3] ?? '';
		if (path === '') {
			i++; // 略過更名前的舊路徑
			path = fields[++i] ?? '';
		}
		if (!path) continue;
		const prev = out.get(path);
		out.set(path, {
			added: (prev?.added ?? 0) + added,
			removed: (prev?.removed ?? 0) + removed,
			binary: (prev?.binary ?? false) || binary,
		});
	}
	return out;
}

function inspectUntracked(fullPath: string): {added: number; binary: boolean} {
	let fd: number | null = null;
	try {
		const stat = statSync(fullPath);
		if (!stat.isFile() || stat.size === 0) return {added: 0, binary: false};
		if (stat.size > MAX_UNTRACKED_BYTES) return {added: 0, binary: true};
		fd = openSync(fullPath, 'r');
		const probe = Buffer.alloc(Math.min(8192, stat.size));
		readSync(fd, probe, 0, probe.length, 0);
		if (probe.includes(0)) return {added: 0, binary: true};
		const content = readFileSync(fullPath, 'utf8');
		const added = content.replace(/\r?\n$/, '').split(/\r?\n/).length;
		return {added, binary: false};
	} catch {
		return {added: 0, binary: false};
	} finally {
		if (fd !== null) closeSync(fd);
	}
}

async function readNumstats(cwd: string, git: string, hasHead: boolean): Promise<Map<string, Numstat>> {
	const base = [git, '-C', cwd, '-c', 'core.quotepath=false', 'diff', '--numstat', '-z', '--find-renames'];
	if (hasHead) {
		const res = await exec([...base, 'HEAD']);
		return res.ok ? parseNumstatZ(res.stdout) : new Map();
	}
	// 尚無任何 commit 時沒有 HEAD，合併暫存區與工作區的統計
	const [staged, working] = await Promise.all([exec([...base, '--cached']), exec(base)]);
	const merged = new Map<string, Numstat>();
	for (const res of [staged, working]) {
		if (!res.ok) continue;
		for (const [path, stat] of parseNumstatZ(res.stdout)) {
			const prev = merged.get(path);
			merged.set(path, {
				added: (prev?.added ?? 0) + stat.added,
				removed: (prev?.removed ?? 0) + stat.removed,
				binary: (prev?.binary ?? false) || stat.binary,
			});
		}
	}
	return merged;
}

export async function loadDiffFiles(cwd: string, git = gitBin() ?? 'git'): Promise<DiffFile[] | null> {
	const [entries, head] = await Promise.all([statusEntries(cwd), headCommit(cwd)]);
	if (!entries) return null;
	if (entries.length === 0) return [];
	const stats = await readNumstats(cwd, git, head !== null);
	return entries.map(entry => {
		const untracked = entry.code === '??';
		if (untracked) {
			const info = inspectUntracked(join(cwd, entry.path));
			return {
				path: entry.path,
				code: entry.code,
				added: info.added,
				removed: 0,
				binary: info.binary,
				untracked: true,
			};
		}
		const stat = stats.get(entry.path);
		return {
			path: entry.path,
			from: entry.from,
			code: entry.code,
			added: stat?.added ?? 0,
			removed: stat?.removed ?? 0,
			binary: stat?.binary ?? false,
			untracked: false,
		};
	});
}

function isBinaryPatch(diff: string): boolean {
	return /(^|\n)Binary files .+ differ\r?\n?/.test(diff) || diff.includes('\nGIT binary patch\n');
}

export async function loadFileRawDiff(
	cwd: string,
	file: DiffFile,
	git = gitBin() ?? 'git',
	hasHead?: boolean,
): Promise<{diff: string; binary: boolean}> {
	if (file.binary) return {diff: '', binary: true};
	const base = [git, '-C', cwd, '-c', 'core.quotepath=false', 'diff', '--no-color'];
	if (file.untracked) {
		const res = await exec([...base, '--no-index', '--', '/dev/null', file.path]);
		// git diff --no-index 在兩檔案內容不同時固定回傳結束碼 1，屬正常結果
		const diff = res.ok || (res.kind === 'exit' && res.code === 1) ? res.stdout : '';
		return {diff, binary: isBinaryPatch(diff)};
	}
	const headPresent = hasHead ?? (await headCommit(cwd)) !== null;
	const paths = file.from ? [file.from, file.path] : [file.path];
	if (headPresent) {
		const res = await exec([...base, '--find-renames', 'HEAD', '--', ...paths]);
		const diff = res.ok ? res.stdout : '';
		return {diff, binary: isBinaryPatch(diff)};
	}
	const [staged, working] = await Promise.all([
		exec([...base, '--find-renames', '--cached', '--', ...paths]),
		exec([...base, '--find-renames', '--', ...paths]),
	]);
	const diff = [staged.ok ? staged.stdout : '', working.ok ? working.stdout : ''].filter(Boolean).join('');
	return {diff, binary: isBinaryPatch(diff)};
}

export async function renderWithDelta(
	rawDiff: string,
	width: number,
	sideBySide: boolean,
	delta = deltaBin(),
): Promise<string[] | null> {
	if (!delta) return null;
	const res = await exec([delta, ...deltaArgs(width, sideBySide)], {
		stdin: rawDiff,
		env: {...process.env, COLORTERM: 'truecolor'},
		timeoutMs: DELTA_TIMEOUT_MS,
	});
	if (!res.ok) {
		logError(`delta failed: ${res.message}`);
		return null;
	}
	const lines = normalizeAnsiOutput(res.stdout);
	return lines.length > 0 ? lines : null;
}

export async function loadFileDiff(
	cwd: string,
	file: DiffFile,
	options: {width: number; sideBySide: boolean; git?: string; delta?: string | null},
): Promise<FileDiffData> {
	const {diff, binary} = await loadFileRawDiff(cwd, file, options.git);
	if (binary) return {kind: 'binary', usedDelta: false};
	if (!diff.trim()) return {kind: 'empty', usedDelta: false};
	const deltaLines = await renderWithDelta(diff, options.width, options.sideBySide, options.delta);
	if (deltaLines) return {kind: 'delta', lines: deltaLines, rawDiff: diff, usedDelta: true};
	return {kind: 'raw', rawDiff: diff, usedDelta: false};
}
