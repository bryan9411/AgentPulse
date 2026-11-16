import React from 'react';
import {Box, Text} from 'ink';
import {DEFAULT_LANG, strings, type Lang} from '../i18n/strings.ts';
import type {Dialog} from '../state/types.ts';
import {COLORS} from './theme.ts';
import {padEnd} from './text.ts';

type Props = {lines: string[]; width: number};

export function KeyHints({lines, width}: Props) {
	return (
		<Box flexDirection="column">
			{lines.map((line, i) => (
				<Text key={i} color={COLORS.dim}>
					{padEnd(line, width)}
				</Text>
			))}
		</Box>
	);
}

export type HintContext = {
	focus: 'list' | 'ai';
	dialog: Dialog['kind'] | null;
	row: 'project' | 'session' | null;
	editingFilter?: boolean;
	filtered?: boolean;
	// The merge dialog only reports (refused, or done): nothing left to confirm.
	mergeSettled?: boolean;
};

// Every list variant has the same number of lines so the list does not
// jump as the cursor moves between group and session rows.
export function listHints({focus, dialog, row, editingFilter, filtered, mergeSettled}: HintContext, lang: Lang = DEFAULT_LANG): string[] {
	const h = strings(lang).hints;
	if (dialog === 'add-project') return h.addProject;
	if (dialog === 'remove-project') return h.removeProject;
	if (dialog === 'new-session') return h.newSession;
	if (dialog === 'close-session') return h.closeSession;
	if (dialog === 'worktree') return h.worktree;
	if (dialog === 'merge') return mergeSettled ? h.mergeClose : h.mergeConfirm;
	if (dialog === 'open-url') return h.openUrl;
	if (focus === 'ai') return h.ai;
	if (editingFilter) return h.editingFilter;
	const filter = filtered ? h.filterOn : h.filterOff;
	return [...(row === 'session' ? h.session : h.project), filter, ...h.tail];
}
