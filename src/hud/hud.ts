import type {AgentState} from '../agents/types.ts';
import type {ContextView} from '../services/context/usage.ts';
import {HUD_ROWS} from '../config/layout.ts';
import {COLORS, GLYPHS, stateGlyph, type Glyphs} from '../ui/theme.ts';
import {padEnd, truncateStart, width as cells} from '../ui/text.ts';
import {fitSegments, SEPARATOR, type Segment} from './fit.ts';

// Everything lines 2–3 show (SPEC 5.5). null: looked and found nothing
// usable, shown as —; a missing `details` means not read yet.
export type HudDetails = {
	model: string | null;
	effort: string | null;
	mcp: readonly string[] | null;
	skills: number | null;
	rules: {name: string; present: boolean} | null;
	git: {branch: string | null; added: number; removed: number; untracked: number} | null;
	ports: readonly number[];
	// ms; null when unknown.
	createdAt: number | null;
	changedAt: number | null;
	// Line 4 (SPEC 5.6); null before the first reply or when unsupported.
	context: ContextView | null;
};

export type HudSession = {
	branch: string;
	agent: string;
	cwd: string;
	dead: boolean;
	exitStatus: number | null;
	// null until the first capture.
	state?: AgentState | null;
	stalled?: boolean;
	details?: HudDetails;
};

export type HudInput = {
	tooSmall: boolean;
	project: {name: string; path: string} | null;
	session?: HudSession | null;
	glyphs?: Glyphs;
	now?: number;
	// Percent at which the context figure turns the warning colour.
	contextWarnAt?: number;
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

const UNKNOWN = '—';

// Compact age: 45s, 12m, 3h05m, 2d4h.
export function formatDuration(ms: number): string {
	const sec = Math.max(0, Math.floor(ms / 1000));
	if (sec < 60) return `${sec}s`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m`;
	const hours = Math.floor(min / 60);
	if (hours < 24) return `${hours}h${String(min % 60).padStart(2, '0')}m`;
	return `${Math.floor(hours / 24)}d${hours % 24}h`;
}

export function environmentSegments(d: HudDetails | undefined, glyphs: Glyphs): Segment[] {
	const model = !d?.model ? `model ${UNKNOWN}` : d.effort ? `${d.model} [${d.effort}]` : d.model;
	const mcp = !d || d.mcp === null ? `MCP ${UNKNOWN}` : d.mcp.length === 0 ? 'MCP none' : `MCP ${d.mcp.join(', ')}`;
	const skills = `skills ${d?.skills ?? UNKNOWN}`;
	const rules = !d?.rules ? '' : d.rules.present ? `${d.rules.name} ${glyphs.done}` : `no ${d.rules.name}`;
	return [
		{text: model, rank: 1, color: d?.model ? COLORS.text : COLORS.dim, minWidth: 8},
		{text: mcp, rank: 2, color: COLORS.dim, minWidth: 8},
		{text: skills, rank: 4, color: COLORS.dim},
		{text: rules, rank: 3, color: COLORS.dim},
	];
}

export function progressSegments(se: HudSession, now: number): Segment[] {
	const d = se.details;
	const git = d?.git ?? null;
	const branch = git?.branch ?? se.branch;
	let diff = UNKNOWN;
	if (git) diff = git.added === 0 && git.removed === 0 && git.untracked === 0 ? 'clean' : `+${git.added} -${git.removed}`;
	const untracked = git && git.untracked > 0 ? `${git.untracked} untracked` : '';
	const up = d?.createdAt ? `up ${formatDuration(now - d.createdAt)}` : '';
	const output = d?.changedAt && !se.dead ? `output ${formatDuration(now - d.changedAt)} ago` : '';
	const ports = (d?.ports ?? []).map(p => `:${p}`).join(' ');
	return [
		{text: branch, rank: 1, color: COLORS.text, minWidth: 6},
		{text: diff, rank: 2, color: COLORS.dim},
		{text: untracked, rank: 6, color: COLORS.dim},
		{text: up, rank: 5, color: COLORS.dim},
		{text: output, rank: 4, color: COLORS.dim},
		{text: ports, rank: 3, color: COLORS.dim},
	];
}

// 950 → 950, 37125 → 37.1k, 412000 → 412k, 1000000 → 1.0m.
export function formatTokens(n: number): string {
	const v = Math.max(0, Math.round(n));
	if (v < 1000) return String(v);
	if (v < 100_000) return `${(v / 1000).toFixed(1)}k`;
	if (v < 1_000_000) return `${Math.round(v / 1000)}k`;
	return `${(v / 1_000_000).toFixed(1)}m`;
}

const BAR_MIN = 8;
const BAR_MAX = 30;

// Line 4 (SPEC 5.6), exactly `size` cells. When space runs out the bar
// shrinks first, then the breakdown goes, then only the headline is left.
export function contextLine(view: ContextView | null, size: number, glyphs: Glyphs, warnAt = 80): string {
	if (size <= 0) return '';
	const label = 'context ';
	const figure = !view ? UNKNOWN : view.percent !== null ? `${view.percent}%` : formatTokens(view.used);
	const head = label + figure;
	const headWidth = cells(head);
	if (headWidth >= size) return `${fg(COLORS.dim)}${padEnd(head, size)}`;
	const warn = view?.percent != null && view.percent >= warnAt;
	const headText = `${fg(COLORS.dim)}${label}${fg(warn ? COLORS.warn : COLORS.text)}${figure}`;

	let detail = '';
	if (view && view.system !== null && view.chat !== null) {
		detail =
			view.percent !== null
				? `≈ system ${view.system} · chat ${view.chat} · free ${view.free ?? 0}`
				: `≈ system ${formatTokens(view.system)} · chat ${formatTokens(view.chat)}`;
	} else if (view?.free != null) {
		detail = `free ${view.free}`;
	}
	const detailWidth = cells(detail);
	const hasBar = view?.percent != null;

	let bar = 0;
	let showDetail = detail !== '';
	if (hasBar) {
		const room = (withDetail: boolean) => size - headWidth - 1 - (withDetail ? 2 + detailWidth : 0);
		if (showDetail && room(true) >= BAR_MIN) bar = Math.min(BAR_MAX, room(true));
		else {
			showDetail = false;
			if (room(false) >= BAR_MIN) bar = Math.min(BAR_MAX, room(false));
		}
	} else if (showDetail && headWidth + 2 + detailWidth > size) {
		showDetail = false;
	}

	let out = headText;
	let used = headWidth;
	if (bar > 0 && view?.percent != null) {
		const full = Math.min(bar, Math.round((bar * view.percent) / 100));
		out += ` ${fg(COLORS.text)}${glyphs.barUsed.repeat(full)}${fg(COLORS.rule)}${glyphs.barFree.repeat(bar - full)}`;
		used += 1 + bar;
	}
	if (showDetail) {
		out += `  ${fg(COLORS.dim)}${detail}`;
		used += 2 + detailWidth;
	}
	return `${out}${' '.repeat(Math.max(0, size - used))}`;
}

// Fitted fields joined by the separator, padded to exactly `size` cells.
export function renderSegments(segments: readonly Segment[], size: number): string {
	const fitted = fitSegments(segments, size);
	const used = cells(fitted.map(s => s.text).join(SEPARATOR));
	const body = fitted.map(s => `${fg(s.color)}${s.text}`).join(`${fg(COLORS.dim)}${SEPARATOR}`);
	return `${body}${' '.repeat(Math.max(0, size - used))}`;
}

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
		const glyphs = input.glyphs ?? GLYPHS.unicode;
		lines.push(` ${renderSegments(environmentSegments(se.details, glyphs), inner)}${RESET}`);
		lines.push(` ${renderSegments(progressSegments(se, input.now ?? Date.now()), inner)}${RESET}`);
		lines.push(` ${contextLine(se.details?.context ?? null, inner, glyphs, input.contextWarnAt)}${RESET}`);
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

export type AccountMark = {id: string; signedIn: boolean | null};

export type TopBarInput = {
	sessions: number;
	counts?: Record<AgentState, number>;
	glyphs?: Glyphs;
	// SPEC 5.7, right-aligned; null while not checked yet.
	accounts?: readonly AccountMark[];
};

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
	const left = ` #[fg=${COLORS.text},bold]AgentPulse#[nobold,fg=${COLORS.dim}]  ${parts.join(' · ')}`;
	const marks = (input.accounts ?? [])
		.filter(a => a.signedIn !== null)
		.map(a => `#[fg=${COLORS.dim}]${a.id} #[fg=${COLORS.text}]${a.signedIn ? glyphs.running : glyphs.idle}`);
	return marks.length === 0 ? left : `${left}#[align=right]${marks.join('  ')} `;
}
