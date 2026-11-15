import React from 'react';
import {Box, Text} from 'ink';
import type {Dialog} from '../state/types.ts';
import {COLORS} from './theme.ts';
import {padEnd} from './text.ts';

type Props = {lines: string[]; width: number};

export function KeyHints({lines, width}: Props) {
	return (
		<Box flexDirection="column">
			{lines.map(line => (
				<Text key={line} color={COLORS.dim}>
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
};

// Every list variant has the same number of lines so the list does not
// jump as the cursor moves between group and session rows.
export function listHints({focus, dialog, row, editingFilter, filtered}: HintContext): string[] {
	if (dialog === 'add-project') return ['enter add · esc cancel'];
	if (dialog === 'new-session') return ['↑↓ choose · enter start', 'esc cancel'];
	if (dialog === 'close-session') return ['enter close · esc cancel'];
	if (focus === 'ai') return ['ctrl+q back'];
	if (editingFilter) return ['type to filter', 'enter done · esc clear'];
	const filter = filtered ? '/ filter · f · esc clear' : '/ filter · f needs you';
	if (row === 'session') return ['↑↓ move · enter type', 'z zoom · x close · n new', filter, 'a add project · q quit'];
	return ['↑↓ move · ←→ fold', 'n new session', filter, 'a add project · q quit'];
}
