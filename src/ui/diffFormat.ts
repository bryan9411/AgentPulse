import {COLORS} from './theme.ts';
import {padStart, truncate, width as cells} from './text.ts';

export type DiffSpan = {text: string; color: string; bold?: boolean};
export type BuiltinDiffLine = {spans: DiffSpan[]; bg?: string};

export type StatusBadge = {tag: string; color: string};

export function statusBadge(code: string): StatusBadge {
	if (code === '??') return {tag: '??', color: COLORS.running};
	if (code.includes('U')) return {tag: 'U', color: COLORS.error};
	if (code.includes('D')) return {tag: 'D', color: COLORS.error};
	if (code.includes('R')) return {tag: 'R', color: COLORS.warn};
	if (code.includes('C')) return {tag: 'C', color: COLORS.warn};
	if (code.includes('A')) return {tag: 'A', color: COLORS.running};
	return {tag: 'M', color: COLORS.warn};
}

function baseName(path: string): string {
	const idx = path.lastIndexOf('/');
	return idx === -1 ? path : path.slice(idx + 1);
}

// 檔名無重複時只顯示最後一段以省空間；若有同名檔案在不同資料夾則保留相對路徑區分
export function fileTabLabels(paths: readonly string[]): string[] {
	const counts = new Map<string, number>();
	for (const p of paths) {
		const b = baseName(p);
		counts.set(b, (counts.get(b) ?? 0) + 1);
	}
	return paths.map(p => ((counts.get(baseName(p)) ?? 0) > 1 ? p : baseName(p)));
}

export type StripSlice = {
	items: Array<{index: number; label: string; active: boolean}>;
	moreLeft: boolean;
	moreRight: boolean;
};

// 讓目前選中的檔案標籤永遠維持在可見範圍內，並從兩側補齊相鄰檔案
export function layoutFileStrip(labels: readonly string[], selected: number, maxWidth: number): StripSlice {
	if (labels.length === 0 || maxWidth <= 0) return {items: [], moreLeft: false, moreRight: false};
	const active = Math.min(Math.max(0, selected), labels.length - 1);
	const cap = Math.max(8, Math.min(28, maxWidth - 6));
	const textAt = (i: number) => ` ${truncate(labels[i] ?? '', cap)} `;
	const selectedText = textAt(active);
	let left = active;
	let right = active;
	let used = cells(selectedText);
	const arrowReserve = () => (left > 0 ? 2 : 0) + (right < labels.length - 1 ? 2 : 0);

	while (left > 0 || right < labels.length - 1) {
		let grew = false;
		if (right < labels.length - 1) {
			const nextW = 1 + cells(textAt(right + 1));
			const nextArrows = (left > 0 ? 2 : 0) + (right + 1 < labels.length - 1 ? 2 : 0);
			if (used + nextW + nextArrows <= maxWidth) {
				right++;
				used += nextW;
				grew = true;
			}
		}
		if (left > 0) {
			const prevW = 1 + cells(textAt(left - 1));
			const nextArrows = (left - 1 > 0 ? 2 : 0) + (right < labels.length - 1 ? 2 : 0);
			if (used + prevW + nextArrows <= maxWidth) {
				left--;
				used += prevW;
				grew = true;
			}
		}
		if (!grew) break;
	}

	const items: StripSlice['items'] = [];
	for (let i = left; i <= right; i++) {
		items.push({index: i, label: textAt(i), active: i === active});
	}
	return {items, moreLeft: left > 0, moreRight: right < labels.length - 1};
}

// 保留程式碼原始縮排空白，依終端機字元顯示寬度進行折行（不可用去除前導空白的文字換行）
function wrapCodeLine(code: string, max: number): string[] {
	if (max <= 0) return [''];
	if (cells(code) <= max) return [code];
	const lines: string[] = [];
	let current = '';
	let used = 0;
	for (const ch of code) {
		const w = cells(ch);
		if (used > 0 && used + w > max) {
			lines.push(current);
			current = ch;
			used = w;
		} else {
			current += ch;
			used += w;
		}
	}
	if (current || lines.length === 0) lines.push(current);
	return lines;
}

// 在未安裝 delta 時使用的內建統一 Diff 排版器：保留雙欄行號、柔和增刪配色與寬度折行
export function formatBuiltinDiff(rawDiff: string, maxWidth: number): BuiltinDiffLine[] {
	const rawLines = rawDiff.replaceAll('\r', '').replaceAll('\t', '    ').split('\n');
	if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop();

	const width = Math.max(24, maxWidth);
	const dualGutter = width >= 56;
	const numDigits = 4;
	const blankOld = ' '.repeat(numDigits);
	const blankNew = ' '.repeat(numDigits);
	const gutterTextWidth = dualGutter ? numDigits * 2 + 4 : numDigits + 3;
	const contentWidth = Math.max(10, width - gutterTextWidth - 2);
	const sep = ' │ ';

	const out: BuiltinDiffLine[] = [];
	const metaNotes: BuiltinDiffLine[] = [];
	let oldLine = 0;
	let newLine = 0;
	let sawHunk = false;

	const pushCodeLines = (oldN: number | null, newN: number | null, prefix: string, code: string, color: string) => {
		const parts = wrapCodeLine(code, contentWidth);
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i] ?? '';
			const gutter =
				i === 0
					? dualGutter
						? `${oldN === null ? blankOld : padStart(String(oldN), numDigits)} ${newN === null ? blankNew : padStart(String(newN), numDigits)}`
						: `${newN === null ? (oldN === null ? blankNew : padStart(String(oldN), numDigits)) : padStart(String(newN), numDigits)}`
					: dualGutter
						? `${blankOld} ${blankNew}`
						: blankNew;
			out.push({
				spans: [
					{text: gutter, color: COLORS.dim},
					{text: sep, color: COLORS.rule},
					{text: i === 0 ? `${prefix} ` : '  ', color},
					{text: part, color},
				],
			});
		}
	};

	for (const line of rawLines) {
		if (line.startsWith('diff --git ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) continue;
		if (line.startsWith('deleted file mode ')) {
			metaNotes.push({spans: [{text: line, color: COLORS.dim}]});
			continue;
		}
		if (line.startsWith('new file mode ')) continue;
		if (line.startsWith('old mode ') || line.startsWith('new mode ') || line.startsWith('rename ') || line.startsWith('copy ') || line.startsWith('similarity ')) {
			metaNotes.push({spans: [{text: line, color: COLORS.warn}]});
			continue;
		}
		if (line.startsWith('@@')) {
			const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
			if (match) {
				sawHunk = true;
				oldLine = Number(match[1]);
				newLine = Number(match[2]);
				const ctx = (match[3] ?? '').trim();
				const header = `@@ -${match[1]} +${match[2]} @@${ctx ? ` ${ctx}` : ''}`;
				if (out.length > 0) out.push({spans: [{text: ' ', color: COLORS.dim}]});
				out.push({
					bg: COLORS.selected,
					spans: [{text: ` ${truncate(header, Math.max(1, width - 2))} `, color: COLORS.warn}],
				});
				continue;
			}
		}
		if (line.startsWith('\\ ')) {
			out.push({spans: [{text: line, color: COLORS.dim}]});
			continue;
		}
		if (!sawHunk) continue;
		if (line.startsWith('+')) {
			pushCodeLines(null, newLine, '+', line.slice(1), COLORS.running);
			newLine++;
		} else if (line.startsWith('-')) {
			pushCodeLines(oldLine, null, '-', line.slice(1), COLORS.error);
			oldLine++;
		} else {
			pushCodeLines(oldLine, newLine, ' ', line.startsWith(' ') ? line.slice(1) : line, COLORS.text);
			oldLine++;
			newLine++;
		}
	}

	return sawHunk ? out : metaNotes;
}
