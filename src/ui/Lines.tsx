import React from 'react';
import {Box, Text} from 'ink';
import {lineWidth, type Line} from './lineParts.ts';
import {COLORS} from './theme.ts';

type Props = {lines: readonly Line[]; width: number};

export function Lines({lines, width}: Props) {
	return (
		<Box flexDirection="column" height={lines.length} flexShrink={0}>
			{lines.map((l, i) => (
				<Text key={i} backgroundColor={l.selected ? COLORS.selected : undefined}>
					{l.spans.map((span, j) => (
						<Text key={j} color={span.color}>
							{span.text}
						</Text>
					))}
					{' '.repeat(Math.max(0, width - lineWidth(l)))}
				</Text>
			))}
		</Box>
	);
}
