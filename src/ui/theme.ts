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
};

// SPEC 3.2, with an ASCII fallback for terminals that draw these two cells wide.
export const GLYPHS: Record<GlyphMode, Glyphs> = {
	unicode: {running: '●', approval: '◐', idle: '○', done: '✓', error: '✕', expanded: '▾', collapsed: '▸'},
	ascii: {running: '*', approval: '!', idle: 'o', done: '+', error: 'x', expanded: 'v', collapsed: '>'},
};
