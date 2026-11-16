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
	isDead?: boolean;
	isEmptyProject?: boolean;
	editingFilter?: boolean;
	filtered?: boolean;
};

// 各狀態的提示列行數保持一致，避免游標在專案與工作階段列之間移動時清單高度跳動
export function listHints({focus, dialog, row, isDead, isEmptyProject, editingFilter, filtered}: HintContext, lang: Lang = DEFAULT_LANG): string[] {
	const h = strings(lang).hints;
	if (dialog === 'add-project') return h.addProject;
	if (dialog === 'remove-project') return h.removeProject;
	if (dialog === 'new-session') return h.newSession;
	if (dialog === 'close-session') return h.closeSession;
	if (dialog === 'open-url') return h.openUrl;
	if (focus === 'ai') return h.ai;
	if (editingFilter) return h.editingFilter;
	const filter = filtered ? h.filterOn : h.filterOff;
	const projectBase = isEmptyProject ? h.projectEmpty : h.project;
	const base = row === 'session' ? (isDead ? h.sessionDead : h.session) : projectBase;
	return [...base, filter, ...h.tail];
}
