import type {AgentState} from '../agents/types.ts';
import type {ContextView} from '../services/context/usage.ts';
import {HUD_ROWS} from '../config/layout.ts';
import {DEFAULT_LANG, strings, type Lang} from '../i18n/strings.ts';
import {COLORS, GLYPHS, agentColor, stateGlyph, type Glyphs} from '../ui/theme.ts';
import {padEnd, truncate, truncateStart, width as cells} from '../ui/text.ts';
import {fitSegments, SEPARATOR, type Segment} from './fit.ts';

// 資訊列第 2～3 行資料：null 表示已檢查但無資料（顯示 —）；details 未定義表示尚未讀取完成
export type HudDetails = {
	model: string | null;
	effort: string | null;
	mcp: readonly string[] | null;
	skills: number | null;
	rules: {name: string; present: boolean} | null;
	git: {branch: string | null; added: number; removed: number; untracked: number} | null;
	ports: readonly number[];
	createdAt: number | null;
	changedAt: number | null;
	context: ContextView | null;
};

export type HudSession = {
	branch: string;
	agent: string;
	cwd: string;
	dead: boolean;
	exitStatus: number | null;
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
	contextWarnAt?: number;
	lang?: Lang;
};

type Part = {text: string; color: string; bold?: boolean};

function renderParts(parts: readonly Part[], size: number): string {
	if (size <= 0) return '';
	let out = '';
	let used = 0;
	for (const part of parts) {
		if (used >= size) break;
		const remaining = size - used;
		const piece = cells(part.text) <= remaining ? part.text : truncate(part.text, remaining);
		if (!piece) break;
		out += `${part.bold ? BOLD : ''}${fg(part.color)}${piece}${part.bold ? NO_BOLD : ''}`;
		used += cells(piece);
		if (piece !== part.text) break;
	}
	return `${out}${' '.repeat(Math.max(0, size - used))}`;
}

function statusParts(se: HudSession, glyphs: Glyphs, lang: Lang): Part[] {
	const t = strings(lang);
	if (se.dead) return [{text: t.hud.exited(String(se.exitStatus ?? '?')), color: se.exitStatus === 0 ? COLORS.dim : COLORS.error}];
	if (!se.state) return [];
	const glyph = stateGlyph(se.state, glyphs);
	const parts: Part[] = [
		{text: glyph.glyph, color: glyph.color},
		{text: ` ${t.state[se.state]}`, color: se.state === 'idle' ? COLORS.dim : glyph.color},
	];
	if (se.stalled) parts.push({text: ` · ${t.hud.stalled}`, color: COLORS.warn});
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

export function formatDuration(ms: number, lang: Lang = DEFAULT_LANG): string {
	const u = strings(lang).hud.units;
	const sec = Math.max(0, Math.floor(ms / 1000));
	if (sec < 60) return `${sec}${u.s}`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}${u.m}`;
	const hours = Math.floor(min / 60);
	if (hours < 24) return `${hours}${u.h}${String(min % 60).padStart(2, '0')}${u.m}`;
	return `${Math.floor(hours / 24)}${u.d}${hours % 24}${u.h}`;
}

export function environmentSegments(d: HudDetails | undefined, glyphs: Glyphs, lang: Lang = DEFAULT_LANG): Segment[] {
	const t = strings(lang).hud;
	const model = !d?.model ? `${t.model} ${UNKNOWN}` : d.effort ? `${d.model} [${d.effort}]` : d.model;
	const modelSpans = !d?.model
		? undefined
		: d.effort
			? [
					{text: d.model, color: COLORS.model},
					{text: ` [${d.effort}]`, color: COLORS.branch},
				]
			: undefined;
	const mcp = !d || d.mcp === null ? `MCP ${UNKNOWN}` : d.mcp.length === 0 ? t.mcpNone : `MCP ${d.mcp.join(', ')}`;
	const hasMcp = Boolean(d?.mcp && d.mcp.length > 0);
	const skills = `${t.skills} ${d?.skills ?? UNKNOWN}`;
	const rules = !d?.rules ? '' : d.rules.present ? `${d.rules.name} ${glyphs.done}` : t.noRules(d.rules.name);
	const rulesSpans = d?.rules?.present
		? [
				{text: `${d.rules.name} `, color: COLORS.text},
				{text: glyphs.done, color: COLORS.running},
			]
		: undefined;
	return [
		{text: model, rank: 1, color: d?.model ? COLORS.model : COLORS.dim, minWidth: 8, spans: modelSpans},
		{text: mcp, rank: 2, color: hasMcp ? COLORS.done : COLORS.dim, minWidth: 8},
		{text: skills, rank: 4, color: d?.skills != null && d.skills > 0 ? COLORS.text : COLORS.dim},
		{text: rules, rank: 3, color: COLORS.dim, spans: rulesSpans},
	];
}

export function progressSegments(se: HudSession, now: number, lang: Lang = DEFAULT_LANG): Segment[] {
	const t = strings(lang).hud;
	const age = (ms: number) => formatDuration(ms, lang);
	const d = se.details;
	const git = d?.git ?? null;
	const branch = git?.branch ?? se.branch;
	let diff = UNKNOWN;
	let diffColor: string = COLORS.dim;
	let diffSpans: Segment['spans'];
	if (git) {
		if (git.added === 0 && git.removed === 0 && git.untracked === 0) {
			diff = t.clean;
			diffColor = COLORS.running;
		} else {
			diff = `+${git.added} -${git.removed}`;
			diffSpans = [
				{text: `+${git.added}`, color: COLORS.running},
				{text: ' ', color: COLORS.dim},
				{text: `-${git.removed}`, color: COLORS.error},
			];
		}
	}
	const untracked = git && git.untracked > 0 ? t.untracked(git.untracked) : '';
	const up = d?.createdAt ? t.up(age(now - d.createdAt)) : '';
	const output = d?.changedAt && !se.dead ? t.output(age(now - d.changedAt)) : '';
	const ports = (d?.ports ?? []).map(p => `:${p}`).join(' ');
	return [
		{text: branch, rank: 1, color: COLORS.branch, minWidth: 6},
		{text: diff, rank: 2, color: diffColor, spans: diffSpans},
		{text: untracked, rank: 6, color: COLORS.warn},
		{text: up, rank: 5, color: COLORS.dim},
		{text: output, rank: 4, color: COLORS.dim},
		{text: ports, rank: 3, color: COLORS.accent},
	];
}

export function formatTokens(n: number): string {
	const v = Math.max(0, Math.round(n));
	if (v < 1000) return String(v);
	if (v < 100_000) return `${(v / 1000).toFixed(1)}k`;
	if (v < 1_000_000) return `${Math.round(v / 1000)}k`;
	return `${(v / 1_000_000).toFixed(1)}m`;
}

const BAR_MIN = 8;
const BAR_MAX = 30;

// 第 4 行寬度不足時先縮短進度條，再拿掉明細，最後只留開頭的百分比數字
export function contextLine(view: ContextView | null, size: number, glyphs: Glyphs, warnAt = 80, lang: Lang = DEFAULT_LANG): string {
	if (size <= 0) return '';
	const t = strings(lang).hud;
	const label = `${t.context} `;
	const figure = !view ? UNKNOWN : view.percent !== null ? `${view.percent}%` : formatTokens(view.used);
	const head = label + figure;
	const headWidth = cells(head);
	if (headWidth >= size) return `${fg(COLORS.dim)}${padEnd(head, size)}`;
	const warn = view?.percent != null && view.percent >= warnAt;
	const fillColor = warn ? COLORS.warn : COLORS.done;
	const figureColor = !view ? COLORS.dim : fillColor;
	const headText = `${fg(COLORS.dim)}${label}${fg(figureColor)}${figure}`;

	let detail = '';
	if (view && view.system !== null && view.chat !== null) {
		detail =
			view.percent !== null
				? `≈ ${t.system} ${view.system} · ${t.chat} ${view.chat} · ${t.free} ${view.free ?? 0}`
				: `≈ ${t.system} ${formatTokens(view.system)} · ${t.chat} ${formatTokens(view.chat)}`;
	} else if (view?.free != null) {
		detail = `${t.free} ${view.free}`;
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
		out += ` ${fg(fillColor)}${glyphs.barUsed.repeat(full)}${fg(COLORS.rule)}${glyphs.barFree.repeat(bar - full)}`;
		used += 1 + bar;
	}
	if (showDetail) {
		out += `  ${fg(COLORS.dim)}${detail}`;
		used += 2 + detailWidth;
	}
	return `${out}${' '.repeat(Math.max(0, size - used))}`;
}

export function renderSegments(segments: readonly Segment[], size: number): string {
	const fitted = fitSegments(segments, size);
	const used = cells(fitted.map(s => s.text).join(SEPARATOR));
	const body = fitted
		.map(s =>
			s.spans
				? s.spans.map(sp => `${sp.bold ? BOLD : ''}${fg(sp.color)}${sp.text}${sp.bold ? NO_BOLD : ''}`).join('')
				: `${fg(s.color)}${s.text}`,
		)
		.join(`${fg(COLORS.subtle)}${SEPARATOR}`);
	return `${body}${' '.repeat(Math.max(0, size - used))}`;
}

// 每行開頭留 1 格空白並補齊至剛好 size 欄，重畫時才能完整覆蓋舊內容
export function hudLines(input: HudInput, size: number): string[] {
	const inner = Math.max(0, size - 1);
	const lang = input.lang ?? DEFAULT_LANG;
	const t = strings(lang).hud;
	const blank = ' '.repeat(Math.max(0, size));
	const lines: string[] = [];
	if (input.tooSmall || inner === 0) {
		lines.push(blank);
	} else if (input.session && input.project) {
		const se = input.session;
		const branch = se.details?.git?.branch ?? se.branch;
		const leftParts: Part[] = [
			{text: branch, color: COLORS.branch},
			{text: ' · ', color: COLORS.subtle},
			{text: input.project.name, color: COLORS.project, bold: true},
			{text: ' · ', color: COLORS.subtle},
			{text: se.agent, color: agentColor(se.agent)},
		];
		const parts = statusParts(se, input.glyphs ?? GLYPHS.unicode, lang);
		const rightWidth = cells(parts.map(p => p.text).join(''));
		// 空間不夠時整個右側狀態拿掉，不硬截斷文字
		const shown = rightWidth > 0 && inner > rightWidth;
		const leftWidth = shown ? inner - rightWidth - 1 : inner;
		const right = shown ? ` ${parts.map(p => `${fg(p.color)}${p.text}`).join('')}` : '';
		lines.push(` ${renderParts(leftParts, leftWidth)}${right}${RESET}`);
		const glyphs = input.glyphs ?? GLYPHS.unicode;
		lines.push(` ${renderSegments(environmentSegments(se.details, glyphs, lang), inner)}${RESET}`);
		lines.push(` ${renderSegments(progressSegments(se, input.now ?? Date.now(), lang), inner)}${RESET}`);
		lines.push(` ${contextLine(se.details?.context ?? null, inner, glyphs, input.contextWarnAt, lang)}${RESET}`);
	} else if (!input.project) {
		lines.push(` ${fg(COLORS.dim)}${padEnd(t.noProject, inner)}${RESET}`);
	} else {
		const name = input.project.name;
		const nameCut = padEnd(name, inner).trimEnd();
		const rest = Math.max(0, inner - cells(nameCut));
		const pathText = rest > 3 ? ` · ${truncateStart(input.project.path, rest - 3)}` : '';
		lines.push(` ${fg(COLORS.project)}${BOLD}${nameCut}${NO_BOLD}${fg(COLORS.dim)}${padEnd(pathText, rest)}${RESET}`);
		lines.push(` ${fg(COLORS.dim)}${padEnd(t.noSession, inner)}${RESET}`);
	}
	while (lines.length < HUD_ROWS) lines.push(blank);
	return lines.slice(0, HUD_ROWS);
}

export function hudFrame(lines: string[]): string {
	// 隱藏游標、移回左上角並清除游標後殘留內容，避免上一幀較高時留下殘影
	return `\x1b[?25l\x1b[H${lines.map(line => `${line}\x1b[K`).join('\r\n')}\x1b[J`;
}

export type AccountMark = {id: string; signedIn: boolean | null};

export type TopBarInput = {
	sessions: number;
	counts?: Record<AgentState, number>;
	glyphs?: Glyphs;
	accounts?: readonly AccountMark[];
	lang?: Lang;
};

const TOP_BAR_STATES: readonly AgentState[] = ['needs-approval', 'error', 'running', 'done'];

export function topBarFormat(input: TopBarInput): string {
	const t = strings(input.lang ?? DEFAULT_LANG);
	const glyphs = input.glyphs ?? GLYPHS.unicode;
	const parts = [t.topBar.sessions(input.sessions)];
	for (const state of TOP_BAR_STATES) {
		const n = input.counts?.[state] ?? 0;
		if (n === 0) continue;
		const {glyph, color} = stateGlyph(state, glyphs);
		const tint = color === COLORS.text ? COLORS.dim : color;
		parts.push(`#[fg=${tint}]${glyph} ${n}#[fg=${COLORS.dim}] ${t.state[state]}`);
	}
	const sep = `#[fg=${COLORS.subtle}] · #[fg=${COLORS.dim}]`;
	const left = ` #[fg=${COLORS.accent},bold]AgentPulse#[nobold,fg=${COLORS.dim}]  ${parts.join(sep)}`;
	const marks = (input.accounts ?? [])
		.filter(a => a.signedIn !== null)
		.map(a => `#[fg=${a.signedIn ? agentColor(a.id) : COLORS.dim}]${a.id} #[fg=${a.signedIn ? COLORS.text : COLORS.subtle}]${a.signedIn ? glyphs.running : glyphs.idle}`);
	return marks.length === 0 ? left : `${left}#[align=right]${marks.join('  ')} `;
}
