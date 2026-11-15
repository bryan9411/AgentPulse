import type {AgentState} from '../agents/types.ts';
import {HUD_ROWS} from '../config/layout.ts';
import {COLORS, GLYPHS, stateGlyph, type Glyphs} from '../ui/theme.ts';
import {padEnd, truncateStart, width as cells} from '../ui/text.ts';

export type HudSession = {
	branch: string;
	agent: string;
	cwd: string;
	dead: boolean;
	exitStatus: number | null;
	// null until the first capture.
	state?: AgentState | null;
	stalled?: boolean;
};

export type HudInput = {
	tooSmall: boolean;
	project: {name: string; path: string} | null;
	session?: HudSession | null;
	glyphs?: Glyphs;
};

export const STATE_LABELS: Record<AgentState, string> = {
	running: 'running',
	'needs-approval': 'needs approval',
	idle: 'idle',
	done: 'done',
	error: 'error',
};

type Part = {text: string; color: string};

// Right end of line 1 (SPEC 5.5). Only the glyph and warnings are coloured.
function statusParts(se: HudSession, glyphs: Glyphs): Part[] {
	if (se.dead) return [{text: `exited (${se.exitStatus ?? '?'})`, color: se.exitStatus === 0 ? COLORS.dim : COLORS.error}];
	if (!se.state) return [];
	const glyph = stateGlyph(se.state, glyphs);
	const parts: Part[] = [
		{text: glyph.glyph, color: glyph.color},
		{text: ` ${STATE_LABELS[se.state]}`, color: COLORS.dim},
	];
	if (se.stalled) parts.push({text: ' · stalled?', color: COLORS.warn});
	return parts;
}

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
	} else if (input.session && input.project) {
		const se = input.session;
		const left = `${se.branch} · ${input.project.name} · ${se.agent}`;
		const parts = statusParts(se, input.glyphs ?? GLYPHS.unicode);
		const rightWidth = cells(parts.map(p => p.text).join(''));
		// The status is dropped whole rather than cut when the pane is narrow.
		const shown = rightWidth > 0 && inner > rightWidth;
		const leftWidth = shown ? inner - rightWidth - 1 : inner;
		const right = shown ? ` ${parts.map(p => `${fg(p.color)}${p.text}`).join('')}` : '';
		lines.push(` ${fg(COLORS.text)}${padEnd(left, leftWidth)}${right}${RESET}`);
		lines.push(` ${fg(COLORS.dim)}${padEnd(truncateStart(se.cwd, inner), inner)}${RESET}`);
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

export type TopBarInput = {sessions: number; counts?: Record<AgentState, number>; glyphs?: Glyphs};

// Only states worth a glance; idle is the rest.
const TOP_BAR_STATES: readonly AgentState[] = ['needs-approval', 'error', 'running', 'done'];

// tmux status format (SPEC 3, 6.2). Glyph and count take the state colour.
export function topBarFormat(input: TopBarInput): string {
	const noun = input.sessions === 1 ? 'session' : 'sessions';
	const glyphs = input.glyphs ?? GLYPHS.unicode;
	const parts = [`${input.sessions} ${noun}`];
	for (const state of TOP_BAR_STATES) {
		const n = input.counts?.[state] ?? 0;
		if (n === 0) continue;
		const {glyph, color} = stateGlyph(state, glyphs);
		const tint = color === COLORS.text ? COLORS.dim : color;
		parts.push(`#[fg=${tint}]${glyph} ${n}#[fg=${COLORS.dim}] ${STATE_LABELS[state]}`);
	}
	return ` #[fg=${COLORS.text},bold]AgentPulse#[nobold,fg=${COLORS.dim}]  ${parts.join(' · ')}`;
}
