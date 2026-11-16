import type {ContextUsage} from '../../agents/types.ts';

// 設定檔的 contextWindows 優先，其次使用 adapter 內建表；皆先比對完全相同名稱，再比對最長前綴
export function contextWindow(
	model: string | null,
	builtIn: Readonly<Record<string, number>>,
	overrides: Readonly<Record<string, number>>,
): number | null {
	if (!model) return null;
	for (const table of [overrides, builtIn]) {
		const exact = table[model];
		if (exact !== undefined && exact > 0) return exact;
		let best: {key: string; size: number} | null = null;
		for (const [key, size] of Object.entries(table)) {
			if (size > 0 && model.startsWith(key) && (!best || key.length > best.key.length)) best = {key, size};
		}
		if (best) return best.size;
	}
	return null;
}

export type ContextView = {
	percent: number | null;
	system: number | null;
	chat: number | null;
	free: number | null;
	used: number;
};

export function contextView(usage: ContextUsage, window: number | null): ContextView {
	const used = Math.max(0, usage.used);
	const base = usage.base === null ? null : Math.min(Math.max(0, usage.base), used);
	if (!window) return {percent: null, system: base, chat: base === null ? null : used - base, free: null, used};
	const pct = (n: number) => Math.min(100, Math.round((n / window) * 100));
	const percent = pct(used);
	// system 與 chat 皆從同一個總百分比拆出，避免四捨五入後總和與標題數字不一致
	const system = base === null ? null : Math.min(pct(base), percent);
	return {percent, system, chat: system === null ? null : percent - system, free: 100 - percent, used};
}
