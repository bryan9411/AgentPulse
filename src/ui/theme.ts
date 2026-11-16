import type {AgentState} from '../agents/types.ts';
import type {GlyphMode} from '../config/config.ts';

export const COLORS = {
	bg: '#1d1e21',
	text: '#c9cacd',
	dim: '#73767d',
	rule: '#33353a',
	selected: '#2b2d32',
	warn: '#d0a24c',
	running: '#86b07f',
	error: '#cf7575',
} as const;

export type Glyphs = {
	running: string;
	approval: string;
	idle: string;
	done: string;
	error: string;
	expanded: string;
	collapsed: string;
	barUsed: string;
	barFree: string;
};

// 提供 ASCII 備援符號，避免部分終端機將 Unicode 狀態符號畫成雙倍寬度
export const GLYPHS: Record<GlyphMode, Glyphs> = {
	unicode: {running: '●', approval: '◐', idle: '○', done: '✓', error: '✕', expanded: '▾', collapsed: '▸', barUsed: '━', barFree: '─'},
	ascii: {running: '*', approval: '!', idle: 'o', done: '+', error: 'x', expanded: 'v', collapsed: '>', barUsed: '#', barFree: '-'},
};

export function stateGlyph(state: AgentState, glyphs: Glyphs): {glyph: string; color: string} {
	switch (state) {
		case 'running':
			return {glyph: glyphs.running, color: COLORS.running};
		case 'needs-approval':
			return {glyph: glyphs.approval, color: COLORS.warn};
		case 'error':
			return {glyph: glyphs.error, color: COLORS.error};
		case 'done':
			return {glyph: glyphs.done, color: COLORS.text};
		case 'idle':
			return {glyph: glyphs.idle, color: COLORS.text};
	}
}
