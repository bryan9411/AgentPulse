import {gitBin} from '../infra/git.ts';
import {shellQuote} from '../infra/tmux.ts';

// less 會把這些字元解讀為 prompt 格式語法，必須跳脫
export function lessPrompt(text: string): string {
	return text.replace(/[\\?:.%]/g, ch => `\\${ch}`);
}

export type DiffLabels = {prompt: string; untracked: string};

export function diffCommand(cwd: string, labels: DiffLabels, git = gitBin() ?? 'git'): string {
	const g = `${shellQuote(git)} -c core.quotepath=false`;
	const script = [
		`cd ${shellQuote(cwd)} || exit 1`,
		`new=$(${g} ls-files --others --exclude-standard)`,
		// 尚無 commit 的儲存庫沒有 HEAD，退回比較暫存區與工作區
		`{ ${g} diff --color=always HEAD 2>/dev/null || ${g} diff --color=always`,
		`if [ -n "$new" ]; then printf '\\n%s\\n%s\\n' ${shellQuote(labels.untracked)} "$new"; fi; }` +
			// 清空 LESS 避免環境變數中的 -F 讓短內容直接退出；加上 -c 確保從頂端開始繪製
			` | LESS= LESSCHARSET=utf-8 less -R -c ${shellQuote(`-P${lessPrompt(labels.prompt)}`)}`,
	].join('\n');
	return `sh -c ${shellQuote(script)}`;
}

export function pageFileCommand(file: string, prompt: string): string {
	return `sh -c ${shellQuote(`LESS= LESSCHARSET=utf-8 less -R -c ${shellQuote(`-P${lessPrompt(prompt)}`)} ${shellQuote(file)}`)}`;
}
