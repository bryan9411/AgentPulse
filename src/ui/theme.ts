import type {AgentState} from '../agents/types.ts';
import type {GlyphMode} from '../config/config.ts';

export const COLORS = {
	bg: '#1d1e21',
	text: '#d4d7df',
	dim: '#7a808d',
	subtle: '#4b505c',
	rule: '#323640',
	selected: '#282d38',
	accent: '#7aa2f7',
	project: '#e0af68',
	branch: '#6ec2d8',
	model: '#b49df0',
	done: '#6bc4b8',
	warn: '#d0a24c',
	running: '#86b07f',
	error: '#cf7575',
	claude: '#e08a67',
	codex: '#6bc49c',
	agy: '#7aa2f7',
} as const;

export type Glyphs = {
	running: string;
	approval: string;
	idle: string;
	done: string;
	error: string;
	expanded: string;
	collapsed: string;
	cursor: string;
	guide: string;
	barUsed: string;
	barFree: string;
};

// 提供 ASCII 備援符號，避免部分終端機將 Unicode 狀態符號畫成雙倍寬度
export const GLYPHS: Record<GlyphMode, Glyphs> = {
	unicode: {
		running: '●',
		approval: '◐',
		idle: '○',
		done: '✓',
		error: '✕',
		expanded: '▾',
		collapsed: '▸',
		cursor: '▎',
		guide: '│',
		barUsed: '━',
		barFree: '─',
	},
	ascii: {
		running: '*',
		approval: '!',
		idle: 'o',
		done: '+',
		error: 'x',
		expanded: 'v',
		collapsed: '>',
		cursor: '>',
		guide: '|',
		barUsed: '#',
		barFree: '-',
	},
};

export function agentColor(agent: string): string {
	const id = agent.split(' ')[0];
	switch (id) {
		case 'claude':
			return COLORS.claude;
		case 'codex':
			return COLORS.codex;
		case 'agy':
			return COLORS.agy;
		default:
			return COLORS.dim;
	}
}

export function stateGlyph(state: AgentState, glyphs: Glyphs): {glyph: string; color: string} {
	switch (state) {
		case 'running':
			return {glyph: glyphs.running, color: COLORS.running};
		case 'needs-approval':
			return {glyph: glyphs.approval, color: COLORS.warn};
		case 'error':
			return {glyph: glyphs.error, color: COLORS.error};
		case 'done':
			return {glyph: glyphs.done, color: COLORS.done};
		case 'idle':
			return {glyph: glyphs.idle, color: COLORS.text};
	}
}
