import {messageText, type Lang, type Message} from '../i18n/strings.ts';
import {COLORS} from './theme.ts';
import {padEnd, truncateStart, width as cells, wrap} from './text.ts';

// A row of the sidebar built as data, so the taller dialogs can be laid out
// (and measured) by pure functions.
export type Span = {text: string; color: string};
export type Line = {spans: Span[]; selected?: boolean};

export const line = (text: string, color: string = COLORS.text): Line => ({spans: [{text, color}]});

export function lineWidth(l: Line): number {
	return l.spans.reduce((sum, span) => sum + cells(span.text), 0);
}

// Continuation lines are indented under the first.
export function wrapped(text: string, width: number, color: string = COLORS.text, indent = ''): Line[] {
	return wrap(text, width, cells(indent)).map((part, i) => line(i === 0 ? part : indent + part, color));
}

// `! ` in a signal colour, then the text; used for errors and warnings.
export function marked(text: string, width: number, markColor: string, color: string = COLORS.text): Line[] {
	const parts = wrap(text, Math.max(1, width - 2));
	return parts.map((part, i) => ({spans: [{text: i === 0 ? '! ' : '  ', color: markColor}, {text: part, color}]}));
}

// A text field: the end of the value stays visible while typing.
export function fieldLine(value: string, width: number): Line {
	const field = truncateStart(value, Math.max(1, width - 1));
	return {
		selected: true,
		spans: [
			{text: field, color: COLORS.text},
			{text: padEnd('▏', Math.max(1, width - cells(field))), color: COLORS.dim},
		],
	};
}

export function choiceLine(label: string, right: string, selected: boolean, enabled: boolean, width: number): Line {
	const rightWidth = cells(right);
	const left = padEnd(`${selected ? '›' : ' '} ${label}`, right ? Math.max(0, width - rightWidth - 1) : width);
	const color = enabled ? COLORS.text : COLORS.dim;
	return {selected, spans: right ? [{text: `${left} `, color}, {text: right, color}] : [{text: left, color}]};
}

// Nothing while idle, so a dialog is no taller than it needs to be.
export function statusLines(state: {busy: boolean; error: Message | null}, busyText: string, lang: Lang, width: number): Line[] {
	if (state.busy) return [line(busyText, COLORS.dim)];
	return state.error ? marked(messageText(lang, state.error), width, COLORS.error) : [];
}
