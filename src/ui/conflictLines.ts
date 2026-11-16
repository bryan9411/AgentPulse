import {strings, type Lang} from '../i18n/strings.ts';
import {conflictBranchCount} from '../state/selectors.ts';
import type {Conflict} from '../state/types.ts';
import {line, type Line} from './lineParts.ts';
import {COLORS} from './theme.ts';
import {truncate, truncateStart} from './text.ts';

const MAX_FILES = 3;

export function conflictLines(conflicts: readonly Conflict[], lang: Lang, width: number): Line[] {
	if (conflicts.length === 0) return [];
	const t = strings(lang).conflict;
	const room = Math.max(1, width - 2);
	const out: Line[] = [
		{spans: [{text: '! ', color: COLORS.warn}, {text: truncate(t.title(conflictBranchCount(conflicts)), room), color: COLORS.text}]},
	];
	// 剛好只多 1 個檔案時就直接顯示，不浪費一行印「還有 1 個」
	const shown = conflicts.length <= MAX_FILES + 1 ? conflicts : conflicts.slice(0, MAX_FILES);
	for (const c of shown) out.push(line(`  ${truncateStart(c.file, room)}`, COLORS.dim));
	if (shown.length < conflicts.length) out.push(line(`  ${truncate(t.more(conflicts.length - shown.length), room)}`, COLORS.dim));
	return out;
}
