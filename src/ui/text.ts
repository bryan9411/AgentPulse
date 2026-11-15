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
