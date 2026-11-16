import {shellQuote, type Tmux} from '../infra/tmux.ts';
import {DEFAULT_LANG, strings, type Lang} from '../i18n/strings.ts';
import {COLORS} from '../ui/theme.ts';

function placeholderScript(lang: Lang): string {
	const n = Number.parseInt(COLORS.dim.slice(1), 16);
	const dim = `\\033[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
	// 先清除畫面：巢狀 client 結束後上一個畫面還會殘留在終端機上
	return `printf '\\033[H\\033[2J\\033[?25l\\n  ${dim}${strings(lang).tmux.placeholder}\\033[0m'; stty -echo; while :; do sleep 86400; done`;
}

export function aiPlaceholderCommand(lang: Lang = DEFAULT_LANG): string {
	return `sh -c ${shellQuote(placeholderScript(lang))}`;
}

// 嵌入右側 AI 窗格的 client：必須 unset TMUX，且 client 結束（例如最後一個工作階段關閉）時退回佔位畫面，避免窗格跟著關掉破壞版面
export function aiAttachCommand(agents: Tmux, id: string, lang: Lang = DEFAULT_LANG): string {
	const attach = ['env', '-u', 'TMUX', ...agents.argv(['attach-session', '-t', `=${id}`])].map(shellQuote).join(' ');
	return `sh -c ${shellQuote(`${attach}; ${placeholderScript(lang)}`)}`;
}
