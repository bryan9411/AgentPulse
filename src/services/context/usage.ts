import type {ContextUsage} from '../../agents/types.ts';

// SPEC 5.6: the config file's `contextWindows` wins, then the adapter's
// table. Both match exactly first, then by the longest prefix, so
// "claude-haiku-4-5-20251001" finds "claude-haiku-4-5".
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

// What line 4 shows. With a window the three shares are whole percents that
// add up to 100; without one the parts are token counts and `percent` is null.
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
	// Rounded from the same total so the parts never disagree with the headline.
	const system = base === null ? null : Math.min(pct(base), percent);
	return {percent, system, chat: system === null ? null : percent - system, free: 100 - percent, used};
}
