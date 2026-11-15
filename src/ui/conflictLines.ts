import {strings, type Lang} from '../i18n/strings.ts';
import {conflictBranchCount} from '../state/selectors.ts';
import type {Conflict} from '../state/types.ts';
import {line, type Line} from './lineParts.ts';
import {COLORS} from './theme.ts';
import {truncate, truncateStart} from './text.ts';

const MAX_FILES = 3;

// SPEC 5.10: a heading with the number of branches involved, then the files.
export function conflictLines(conflicts: readonly Conflict[], lang: Lang, width: number): Line[] {
	if (conflicts.length === 0) return [];
	const t = strings(lang).conflict;
	const room = Math.max(1, width - 2);
	const out: Line[] = [
		{spans: [{text: '! ', color: COLORS.warn}, {text: truncate(t.title(conflictBranchCount(conflicts)), room), color: COLORS.text}]},
	];
	// One more file fits where "+1 more" would go.
	const shown = conflicts.length <= MAX_FILES + 1 ? conflicts : conflicts.slice(0, MAX_FILES);
	for (const c of shown) out.push(line(`  ${truncateStart(c.file, room)}`, COLORS.dim));
	if (shown.length < conflicts.length) out.push(line(`  ${truncate(t.more(conflicts.length - shown.length), room)}`, COLORS.dim));
	return out;
}
