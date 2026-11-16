import {messageText, strings, type Lang} from '../../i18n/strings.ts';
import type {MergeDialog, MergeOutcome, MergePlan} from '../../state/types.ts';
import {fieldLine, line, marked, statusLines, wrapped, type Line} from '../lineParts.ts';
import {COLORS} from '../theme.ts';
import {truncate, truncateStart} from '../text.ts';

const MAX_FILES = 5;
const MAX_IGNORED = 3;
const MAX_DETAIL_LINES = 3;

const detail = (text: string, width: number): Line[] => (text ? wrapped(text, width, COLORS.dim).slice(0, MAX_DETAIL_LINES) : []);

function planLines(plan: MergePlan, dialog: MergeDialog, lang: Lang, width: number): Line[] {
	const t = strings(lang).merge;
	const steps = [
		...(plan.dirty > 0 ? [t.commit(plan.dirty)] : []),
		t.merge(plan.base),
		t.close,
		t.removeFolder,
		t.deleteBranch(plan.branch),
	];
	const out: Line[] = [
		line(truncate(t.title, width)),
		...wrapped(t.into(plan.branch, plan.base), width),
		line(truncate(t.steps, width), COLORS.dim),
		...steps.flatMap((step, i) => wrapped(`${i + 1} ${step}`, width, COLORS.text, '  ')),
	];
	if (plan.ignored.length > 0) {
		const names = plan.ignored.slice(0, MAX_IGNORED).join(', ');
		const rest = plan.ignored.length - MAX_IGNORED;
		out.push(...marked(t.ignored(rest > 0 ? `${names} ${t.more(rest)}` : names), width, COLORS.warn));
	}
	out.push(...wrapped(t.onConflict, width, COLORS.dim));
	if (plan.dirty > 0) out.push(line(truncate(t.messageLabel, width), COLORS.dim), fieldLine(dialog.value, width));
	out.push(...statusLines(dialog, t.busy, lang, width));
	return out;
}

function outcomeLines(outcome: MergeOutcome, lang: Lang, width: number): Line[] {
	const t = strings(lang).merge;
	switch (outcome.kind) {
		case 'conflict': {
			const shown = outcome.files.length <= MAX_FILES + 1 ? outcome.files : outcome.files.slice(0, MAX_FILES);
			const rest = outcome.files.length - shown.length;
			return [
				...marked(t.conflictTitle, width, COLORS.warn),
				...(shown.length > 0 ? [line(truncate(t.conflictFiles, width), COLORS.dim)] : []),
				...shown.map(file => line(`  ${truncateStart(file, Math.max(1, width - 2))}`)),
				...(rest > 0 ? [line(`  ${t.more(rest)}`, COLORS.dim)] : []),
				...(outcome.aborted ? [] : marked(t.abortFailed, width, COLORS.error)),
				...wrapped(t.nothingDeleted, width, COLORS.dim),
				...(outcome.committed ? wrapped(t.committedOn(outcome.branch), width, COLORS.dim) : []),
			];
		}
		case 'commit-failed':
			return [...marked(t.commitFailedTitle, width, COLORS.error), ...detail(outcome.detail, width), ...wrapped(t.nothingMerged, width, COLORS.dim)];
		case 'merge-failed':
			return [
				...marked(t.mergeFailedTitle, width, COLORS.error),
				...detail(outcome.detail, width),
				...wrapped(t.nothingDeleted, width, COLORS.dim),
				...(outcome.committed ? wrapped(t.committedOn(outcome.branch), width, COLORS.dim) : []),
			];
		case 'cleanup-failed': {
			const left = outcome.step === 'close' ? t.cleanupClose : outcome.step === 'folder' ? t.cleanupFolder : t.cleanupBranch;
			return [...marked(t.cleanupTitle(outcome.base), width, COLORS.warn), ...wrapped(left, width), ...detail(outcome.detail, width)];
		}
		case 'merged':
		case 'blocked':
			return [];
	}
}

export function mergeLines(dialog: MergeDialog, lang: Lang, width: number): Line[] {
	const t = strings(lang).merge;
	if (dialog.blocked) return [line(truncate(t.blockedTitle, width)), ...wrapped(messageText(lang, dialog.blocked), width, COLORS.dim)];
	if (dialog.outcome) return outcomeLines(dialog.outcome, lang, width);
	if (!dialog.plan) return [line(truncate(t.title, width)), line(truncate(t.checking, width), COLORS.dim)];
	return planLines(dialog.plan, dialog, lang, width);
}
