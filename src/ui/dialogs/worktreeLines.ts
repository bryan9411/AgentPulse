import {strings, type Lang} from '../../i18n/strings.ts';
import type {WorktreeDialog} from '../../state/types.ts';
import {choiceLine, fieldLine, line, statusLines, wrapped, type Line} from '../lineParts.ts';
import {COLORS} from '../theme.ts';
import {truncate, truncateStart} from '../text.ts';

export function worktreeLines(dialog: WorktreeDialog, ctx: {projectName: string; path: string}, lang: Lang, width: number): Line[] {
	const t = strings(lang);
	return [
		line(truncate(t.worktree.title, width)),
		...wrapped(t.worktree.inProject(ctx.projectName, dialog.base ?? '…'), width, COLORS.dim),
		line(truncate(t.worktree.label, width), COLORS.dim),
		fieldLine(dialog.value, width),
		...dialog.options.map((option, i) =>
			choiceLine(option.id, option.installed ? '' : t.newSession.notInstalled, i === dialog.index, option.installed, width),
		),
		line(truncate(t.worktree.folder, width), COLORS.dim),
		line(truncateStart(ctx.path, width), COLORS.dim),
		...wrapped(t.worktree.note, width, COLORS.dim),
		...statusLines(dialog, t.worktree.busy, lang, width),
	];
}
