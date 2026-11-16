import {exec} from '../infra/exec.ts';
import {gitBin} from '../infra/git.ts';
import {parseTmuxVersion, tmuxBin, versionAtLeast} from '../infra/tmux.ts';
import {strings, type Lang} from '../i18n/strings.ts';

export type Problem =
	| {kind: 'noTmux'}
	| {kind: 'oldTmux'; found: string}
	| {kind: 'noGit'}
	| {kind: 'noTty'};

export type Probe = {
	tmuxPath: string | null;
	tmuxVersionOutput: string;
	// macOS 內建的 /usr/bin/git 只是要求安裝開發者工具的佔位程式，必須真的跑得動才算有裝
	gitRuns: boolean;
	tty: boolean;
};

export function findProblems(probe: Probe): Problem[] {
	const problems: Problem[] = [];
	if (!probe.tmuxPath) problems.push({kind: 'noTmux'});
	else {
		const version = parseTmuxVersion(probe.tmuxVersionOutput);
		if (!version || !versionAtLeast(version, 3, 2)) problems.push({kind: 'oldTmux', found: probe.tmuxVersionOutput.trim()});
	}
	if (!probe.gitRuns) problems.push({kind: 'noGit'});
	if (!probe.tty) problems.push({kind: 'noTty'});
	return problems;
}

export async function probe(): Promise<Probe> {
	const tmuxPath = tmuxBin();
	const git = gitBin();
	const [tmuxVersion, gitVersion] = await Promise.all([
		tmuxPath ? exec([tmuxPath, '-V'], {timeoutMs: 5000}) : null,
		git ? exec([git, '--version'], {timeoutMs: 5000}) : null,
	]);
	return {
		tmuxPath,
		tmuxVersionOutput: tmuxVersion?.ok ? tmuxVersion.stdout : '',
		gitRuns: gitVersion?.ok === true,
		tty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
	};
}

// 輸出給雙擊 App 開啟的終端機閱讀的純文字提示，明確列出缺什麼與如何安裝
export function problemReport(lang: Lang, problems: readonly Problem[]): string {
	const t = strings(lang).startup;
	const lines = [t.title, ''];
	for (const problem of problems) {
		if (problem.kind === 'noTmux') lines.push(...t.noTmux);
		else if (problem.kind === 'oldTmux') lines.push(...t.oldTmux(problem.found || '?'));
		else if (problem.kind === 'noGit') lines.push(...t.noGit);
		else lines.push(...t.noTty);
		lines.push('');
	}
	if (problems.some(p => p.kind !== 'noTty')) lines.push(t.retry);
	else lines.pop();
	return `${lines.join('\n')}\n`;
}
