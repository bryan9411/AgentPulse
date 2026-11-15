import {HUD_ROWS} from '../config/layout.ts';
import {COLORS} from '../ui/theme.ts';
import {padEnd, truncateStart, width as cells} from '../ui/text.ts';

export type HudInput = {
	tooSmall: boolean;
	project: {name: string; path: string} | null;
};

const fg = (hex: string) => {
	const n = Number.parseInt(hex.slice(1), 16);
	return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const NO_BOLD = '\x1b[22m';

// Each line is exactly `size` cells of visible text with one leading space,
// so a repaint fully overwrites the previous one.
export function hudLines(input: HudInput, size: number): string[] {
	const inner = Math.max(0, size - 1);
	const blank = ' '.repeat(Math.max(0, size));
	const lines: string[] = [];
	if (input.tooSmall || inner === 0) {
		lines.push(blank);
	} else if (!input.project) {
		lines.push(` ${fg(COLORS.dim)}${padEnd('No project selected', inner)}${RESET}`);
	} else {
		const name = input.project.name;
		const nameCut = padEnd(name, inner).trimEnd();
		const rest = Math.max(0, inner - cells(nameCut));
		const pathText = rest > 3 ? ` · ${truncateStart(input.project.path, rest - 3)}` : '';
		lines.push(` ${fg(COLORS.text)}${BOLD}${nameCut}${NO_BOLD}${fg(COLORS.dim)}${padEnd(pathText, rest)}${RESET}`);
		lines.push(` ${fg(COLORS.dim)}${padEnd('No session yet', inner)}${RESET}`);
	}
	while (lines.length < HUD_ROWS) lines.push(blank);
	return lines.slice(0, HUD_ROWS);
}

export function hudFrame(lines: string[]): string {
	// Hide cursor, home, draw, clear the rest so a taller old frame leaves nothing behind.
	return `\x1b[?25l\x1b[H${lines.map(line => `${line}\x1b[K`).join('\r\n')}\x1b[J`;
}

export type TopBarInput = {sessions: number};

export function topBarFormat(input: TopBarInput): string {
	const noun = input.sessions === 1 ? 'session' : 'sessions';
	return ` #[fg=${COLORS.text},bold]AgentPulse#[nobold,fg=${COLORS.dim}]  ${input.sessions} ${noun}`;
}
