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
};

// Every list variant is three lines so the list does not jump as the
// cursor moves between group and session rows.
export function listHints({focus, dialog, row}: HintContext): string[] {
	if (dialog === 'add-project') return ['enter add · esc cancel'];
	if (dialog === 'new-session') return ['↑↓ choose · enter start', 'esc cancel'];
	if (dialog === 'close-session') return ['enter close · esc cancel'];
	if (focus === 'ai') return ['ctrl+q back'];
	if (row === 'session') return ['↑↓ move · enter type', 'z zoom · x close · n new', 'a add project · q quit'];
	return ['↑↓ move · ←→ fold', 'n new session', 'a add project · q quit'];
}
