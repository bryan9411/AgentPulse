import {shellQuote, type Tmux} from '../infra/tmux.ts';
import {DEFAULT_LANG, strings, type Lang} from '../i18n/strings.ts';
import {COLORS} from '../ui/theme.ts';

function placeholderScript(lang: Lang): string {
	const n = Number.parseInt(COLORS.dim.slice(1), 16);
	const dim = `\\033[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
	// Clear first: after the nested client exits its last frame is still on screen.
	return `printf '\\033[H\\033[2J\\033[?25l\\n  ${dim}${strings(lang).tmux.placeholder}\\033[0m'; stty -echo; while :; do sleep 86400; done`;
}

export function aiPlaceholderCommand(lang: Lang = DEFAULT_LANG): string {
	return `sh -c ${shellQuote(placeholderScript(lang))}`;
}

// The embedded client (SPEC 6.2). TMUX is unset or tmux refuses to nest.
// When the client ends (the last session was closed) the pane falls back to
// the placeholder instead of dying and taking the layout with it.
export function aiAttachCommand(agents: Tmux, id: string, lang: Lang = DEFAULT_LANG): string {
	const attach = ['env', '-u', 'TMUX', ...agents.argv(['attach-session', '-t', `=${id}`])].map(shellQuote).join(' ');
	return `sh -c ${shellQuote(`${attach}; ${placeholderScript(lang)}`)}`;
}
