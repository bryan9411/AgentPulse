import React from 'react';
import {Text} from 'ink';
import type {Glyphs} from './theme.ts';
import {COLORS} from './theme.ts';
import {padEnd, width as cells} from './text.ts';

type Props = {branch: string; agent: string; selected: boolean; width: number; glyphs: Glyphs};

// Status colours arrive with M3; until then every session shows as idle.
export function SessionRow({branch, agent, selected, width, glyphs}: Props) {
	const agentText = ` ${agent}`;
	const branchWidth = Math.max(0, width - 4 - cells(agentText));
	return (
		<Text backgroundColor={selected ? COLORS.selected : undefined}>
			<Text color={COLORS.text}>{`  ${glyphs.idle} `}</Text>
			<Text color={COLORS.text}>{padEnd(branch, branchWidth)}</Text>
			<Text color={COLORS.dim}>{agentText}</Text>
		</Text>
	);
}
