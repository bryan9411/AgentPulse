import React from 'react';
import {Text} from 'ink';
import type {AgentState} from '../agents/types.ts';
import type {SessionSummary} from '../state/types.ts';
import type {Glyphs} from './theme.ts';
import {COLORS, stateGlyph} from './theme.ts';
import {padEnd, width as cells} from './text.ts';

type Props = {
	session: SessionSummary;
	branch: string;
	label: string;
	state: AgentState;
	// 閃爍符號的熄滅相位：該格畫成空白
	hidden: boolean;
	selected: boolean;
	width: number;
	glyphs: Glyphs;
};

export function SessionRow({session, branch, label, state, hidden, selected, width, glyphs}: Props) {
	const agentText = ` ${label}`;
	const branchWidth = Math.max(0, width - 4 - cells(agentText));
	const {glyph, color} = stateGlyph(state, glyphs);
	return (
		<Text backgroundColor={selected ? COLORS.selected : undefined}>
			<Text color={color}>{`  ${hidden ? ' ' : glyph} `}</Text>
			<Text color={session.dead ? COLORS.dim : COLORS.text}>{padEnd(branch, branchWidth)}</Text>
			<Text color={COLORS.dim}>{agentText}</Text>
		</Text>
	);
}
