import {truncate, width as cells} from '../ui/text.ts';

// One field of a HUD line. Lower `rank` is more important and survives longer.
export type Segment = {
	text: string;
	rank: number;
	color: string;
	// A field that may be cut down to this many cells (ending in …) before it
	// is dropped; undefined means it is shown whole or not at all.
	minWidth?: number;
};

export const SEPARATOR = ' · ';

// A cut that lands on a space reads "one, …"; pull the ellipsis in.
const cut = (text: string, size: number) => truncate(text, size).replace(/\s+…$/, '…');

// SPEC 5.5: walk from the least important field up; a shrinkable field is
// first cut to its minimum, and any field that still does not fit is
// dropped. The last field standing is cut to the width. Output keeps the
// input order.
export function fitSegments(input: readonly Segment[], size: number): Segment[] {
	if (size <= 0) return [];
	const segments = input.filter(s => s.text !== '');
	const widths = new Map(segments.map(s => [s, cells(s.text)]));
	const sep = cells(SEPARATOR);
	const used = () => [...widths.values()].reduce((a, b) => a + b, 0) + sep * Math.max(0, widths.size - 1);
	const leastFirst = [...segments].sort((a, b) => b.rank - a.rank);
	for (const s of leastFirst) {
		if (used() <= size || widths.size === 1) break;
		const over = used() - size;
		const w = widths.get(s) ?? 0;
		if (s.minWidth !== undefined && w - s.minWidth >= over) widths.set(s, w - over);
		else widths.delete(s);
	}
	if (used() > size) {
		const [only] = widths.keys();
		if (only) widths.set(only, size);
	}
	return segments.filter(s => widths.has(s)).map(s => {
		const w = widths.get(s) ?? 0;
		return w < cells(s.text) ? {...s, text: cut(s.text, w)} : s;
	});
}
