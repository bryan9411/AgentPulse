import {strings, type Lang} from '../../i18n/strings.ts';
import {activeWorktreeBranch, worktreeBranchChoices} from '../../state/selectors.ts';
import type {WorktreeChoice, WorktreeDialog} from '../../state/types.ts';
import {choiceLine, fieldLine, line, statusLines, wrapped, type Line} from '../lineParts.ts';
import {truncate} from '../text.ts';
import {truncateStart} from '../text.ts';
import {COLORS} from '../theme.ts';
import {viewportStart} from '../viewport.ts';

const MAX_BRANCH_ROWS = 5;

function branchTag(choice: WorktreeChoice, dialog: WorktreeDialog, lang: Lang): string {
	const t = strings(lang).worktree;
	if (choice.mode === 'create') return t.newHint(dialog.base);
	if (choice.mode === 'worktree') return t.worktreeTag;
	return t.existingTag;
}

export function worktreeLines(dialog: WorktreeDialog, ctx: {projectName: string; path: string}, lang: Lang, width: number): Line[] {
	const t = strings(lang);
	if (dialog.step === 'agent') {
		const branchName = activeWorktreeBranch(dialog)?.branch ?? dialog.value.trim();
		return [
			line(truncate(t.worktree.title, width)),
			...wrapped(t.worktree.branchSummary(ctx.projectName, branchName), width, COLORS.dim),
			...dialog.options.map((option, i) =>
				choiceLine(option.id, option.installed ? '' : t.newSession.notInstalled, i === dialog.index, option.installed, width),
			),
			line(truncate(t.worktree.folder, width), COLORS.dim),
			line(truncateStart(ctx.path, width), COLORS.dim),
			...wrapped(t.worktree.note, width, COLORS.dim),
			...statusLines(dialog, t.worktree.busy, lang, width),
		];
	}

	const choices = worktreeBranchChoices(dialog);
	const clamped = choices.length === 0 ? 0 : Math.min(Math.max(0, dialog.branchIndex), choices.length - 1);
	const start = viewportStart(choices.length, clamped, MAX_BRANCH_ROWS);
	const visible = choices.slice(start, start + MAX_BRANCH_ROWS);
	return [
		line(truncate(t.worktree.title, width)),
		...wrapped(t.worktree.inProject(ctx.projectName), width, COLORS.dim),
		line(truncate(t.worktree.label, width), COLORS.dim),
		fieldLine(dialog.value, width),
		...visible.map((choice, i) =>
			choiceLine(choice.branch, branchTag(choice, dialog, lang), start + i === clamped, true, width),
		),
		line(truncate(t.worktree.folder, width), COLORS.dim),
		line(truncateStart(ctx.path, width), COLORS.dim),
		...wrapped(t.worktree.note, width, COLORS.dim),
		...statusLines(dialog, t.worktree.busy, lang, width),
	];
}
