export type ScrollKey = {
	upArrow: boolean;
	downArrow: boolean;
	pageUp: boolean;
	pageDown: boolean;
	ctrl: boolean;
};

export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(min, value), Math.max(min, max));
}

// 統一管理浮動視窗的垂直捲動按鍵（Diff 與按鍵說明共用）
export function nextScrollOffset(
	current: number,
	maxScroll: number,
	pageRows: number,
	input: string,
	key: ScrollKey,
): number | null {
	const page = Math.max(1, pageRows - 2);
	const half = Math.max(1, Math.floor(pageRows / 2));
	if (key.upArrow || input === 'k') return clamp(current - 1, 0, maxScroll);
	if (key.downArrow || input === 'j') return clamp(current + 1, 0, maxScroll);
	if (input === ' ' || key.pageDown) return clamp(current + page, 0, maxScroll);
	if (input === 'b' || key.pageUp) return clamp(current - page, 0, maxScroll);
	if (key.ctrl && input === 'd') return clamp(current + half, 0, maxScroll);
	if (key.ctrl && input === 'u') return clamp(current - half, 0, maxScroll);
	if (input === 'g') return 0;
	if (input === 'G') return clamp(maxScroll, 0, maxScroll);
	return null;
}

export function formatScrollRange(scroll: number, visibleRows: number, totalRows: number): string {
	if (totalRows <= 0) return '0 / 0';
	const start = clamp(scroll, 0, Math.max(0, totalRows - 1)) + 1;
	const end = Math.min(totalRows, scroll + visibleRows);
	if (totalRows <= visibleRows) return `${totalRows} / ${totalRows}`;
	const pct = Math.round((end / totalRows) * 100);
	return `${start}-${end} / ${totalRows} (${pct}%)`;
}

