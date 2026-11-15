import {gitBin} from '../infra/git.ts';
import {shellQuote} from '../infra/tmux.ts';

// less treats these as prompt syntax unless escaped.
export function lessPrompt(text: string): string {
	return text.replace(/[\\?:.%]/g, ch => `\\${ch}`);
}

export type DiffLabels = {prompt: string; untracked: string};

// SPEC 5.11: what the popup runs. Everything since the last commit (the
// same base as the HUD's +/- figures), then the names of new files, paged.
export function diffCommand(cwd: string, labels: DiffLabels, git = gitBin() ?? 'git'): string {
	const g = `${shellQuote(git)} -c core.quotepath=false`;
	const script = [
		`cd ${shellQuote(cwd)} || exit 1`,
		`new=$(${g} ls-files --others --exclude-standard)`,
		// A repository without commits has no HEAD to compare with.
		`{ ${g} diff --color=always HEAD 2>/dev/null || ${g} diff --color=always`,
		`if [ -n "$new" ]; then printf '\\n%s\\n%s\\n' ${shellQuote(labels.untracked)} "$new"; fi; }` +
			// LESS is cleared so an inherited -F cannot close a short diff at once;
			// -c paints from the top, otherwise a short diff sits at the bottom (M6).
			` | LESS= LESSCHARSET=utf-8 less -R -c ${shellQuote(`-P${lessPrompt(labels.prompt)}`)}`,
	].join('\n');
	return `sh -c ${shellQuote(script)}`;
}

// The ? popup pages a file written beforehand; -R keeps the coloured marks.
export function pageFileCommand(file: string, prompt: string): string {
	return `sh -c ${shellQuote(`LESS= LESSCHARSET=utf-8 less -R -c ${shellQuote(`-P${lessPrompt(prompt)}`)} ${shellQuote(file)}`)}`;
}
