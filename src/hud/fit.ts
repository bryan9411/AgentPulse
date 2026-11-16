import {truncate, width as cells} from '../ui/text.ts';

// rank 數字越小越重要，寬度不足時保留越久；未設定 minWidth 表示要嘛完整顯示、要嘛整個拿掉
export type Segment = {
	text: string;
	rank: number;
	color: string;
	minWidth?: number;
};

export const SEPARATOR = ' · ';

// 截斷點剛好落在空白上時會出現「foo …」，把省略號往前收緊
const cut = (text: string, size: number) => truncate(text, size).replace(/\s+…$/, '…');

// 由最不重要的欄位開始：有設定 minWidth 者先縮短到下限，仍塞不下才拿掉；最後只剩一個欄位時依總寬度硬截斷，輸出維持原本順序
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
