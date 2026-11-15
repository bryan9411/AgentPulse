import stringWidth from 'string-width';

const ELLIPSIS = '…';

export function width(text: string): number {
	return stringWidth(text);
}

// Paths and branch names may hold CJK characters, so every cut is by cell
// width, never by `.length`.
export function truncate(text: string, max: number): string {
	if (max <= 0) return '';
	if (stringWidth(text) <= max) return text;
	if (max === 1) return ELLIPSIS;
	let out = '';
	let used = 0;
	for (const ch of text) {
		const w = stringWidth(ch);
		if (used + w > max - 1) break;
		out += ch;
		used += w;
	}
	return out + ELLIPSIS;
}

export function padEnd(text: string, size: number): string {
	const cut = truncate(text, size);
	return cut + ' '.repeat(Math.max(0, size - stringWidth(cut)));
}

export function padStart(text: string, size: number): string {
	const cut = truncate(text, size);
	return ' '.repeat(Math.max(0, size - stringWidth(cut))) + cut;
}

// Left text truncated first; the right side is kept whole when it fits.
export function spread(left: string, right: string, size: number): string {
	const rightWidth = stringWidth(right);
	if (rightWidth + 1 > size) return padEnd(left, size);
	return padEnd(left, size - rightWidth - 1) + ' ' + right;
}

// Keeps the end of a path visible: the folder name matters more than its parents.
export function truncateStart(text: string, max: number): string {
	if (max <= 0) return '';
	if (stringWidth(text) <= max) return text;
	if (max === 1) return ELLIPSIS;
	const chars = [...text];
	let out = '';
	let used = 0;
	for (let i = chars.length - 1; i >= 0; i--) {
		const ch = chars[i] ?? '';
		const w = stringWidth(ch);
		if (used + w > max - 1) break;
		out = ch + out;
		used += w;
	}
	return ELLIPSIS + out;
}

// Units a line may break between: runs of spaces, each wide (CJK)
// character on its own, and runs of other characters (English words, paths)
// kept together.
function breakUnits(text: string): string[] {
	const units: string[] = [];
	let run = '';
	const flush = () => {
		if (run) units.push(run);
		run = '';
	};
	for (const ch of text) {
		if (/\s/.test(ch)) {
			if (run && !/^\s/.test(run)) flush();
			run += ch;
		} else if (stringWidth(ch) > 1) {
			flush();
			units.push(ch);
		} else {
			if (/^\s/.test(run)) flush();
			run += ch;
		}
	}
	flush();
	return units;
}

// Breaks between spaces and between CJK characters; an English word that
// does not fit starts a new line, and one wider than a whole line (a long
// path) is cut by cell width. Lines after the first get `max - hang` cells,
// leaving room for an indent the caller adds.
export function wrap(text: string, max: number, hang = 0): string[] {
	if (max <= 0) return [];
	const lines: string[] = [];
	let line = '';
	let used = 0;
	const room = () => (lines.length === 0 ? max : Math.max(1, max - hang));
	const push = () => {
		lines.push(line.trimEnd());
		line = '';
		used = 0;
	};
	for (const unit of breakUnits(text)) {
		const w = stringWidth(unit);
		const space = /^\s/.test(unit);
		if (used + w <= room()) {
			// A line never starts with the space it was broken at.
			if (space && used === 0) continue;
			line += unit;
			used += w;
			continue;
		}
		if (space) {
			push();
			continue;
		}
		if (used > 0) push();
		if (w <= room()) {
			line = unit;
			used = w;
			continue;
		}
		for (const ch of unit) {
			const cw = stringWidth(ch);
			if (used + cw > room() && used > 0) push();
			line += ch;
			used += cw;
		}
	}
	if (used > 0) push();
	return lines;
}
