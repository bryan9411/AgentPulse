import stringWidth from 'string-width';

const ELLIPSIS = '…';

export function width(text: string): number {
	return stringWidth(text);
}

// 路徑與分支名稱可能包含全形中文字元，一律以終端機顯示寬度截斷，不可用 .length
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

export function spread(left: string, right: string, size: number): string {
	const rightWidth = stringWidth(right);
	if (rightWidth + 1 > size) return padEnd(left, size);
	return padEnd(left, size - rightWidth - 1) + ' ' + right;
}

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

// 將文字拆成可斷行單元：連續空白、單一寬字元（CJK），以及不可拆開的連續英文單字或路徑
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

// 優先在空白或寬字元處換行；單元本身超過整行寬度（例如長路徑）才依顯示寬度硬截斷，續行寬度會扣掉 hang 縮排
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
