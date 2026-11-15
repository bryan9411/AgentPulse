import React from 'react';
import {Box, Text} from 'ink';
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

export function listHints(focus: 'list' | 'ai', hasDialog: boolean): string[] {
	if (hasDialog) return ['enter add · esc cancel'];
	if (focus === 'ai') return ['ctrl+q back'];
	return ['↑↓ move · ←→ fold', 'a add project · q quit'];
}
