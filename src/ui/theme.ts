import type {AgentState} from '../agents/types.ts';
import type {GlyphMode} from '../config/config.ts';

// SPEC 3.1. Nine tenths of the text uses only `text` and `dim`.
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
	// Context meter, used and free parts (SPEC 5.6).
	barUsed: string;
	barFree: string;
};

// SPEC 3.2, with an ASCII fallback for terminals that draw these two cells wide.
export const GLYPHS: Record<GlyphMode, Glyphs> = {
	unicode: {running: '●', approval: '◐', idle: '○', done: '✓', error: '✕', expanded: '▾', collapsed: '▸', barUsed: '━', barFree: '─'},
	ascii: {running: '*', approval: '!', idle: 'o', done: '+', error: 'x', expanded: 'v', collapsed: '>', barUsed: '#', barFree: '-'},
};

// Colour lives only on the glyph; idle and done stay in the text grey.
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
