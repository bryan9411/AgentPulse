import React from 'react';
import {Text} from 'ink';
import type {AgentState} from '../agents/types.ts';
import type {SessionSummary} from '../state/types.ts';
import type {Glyphs} from './theme.ts';
import {COLORS, stateGlyph} from './theme.ts';
import {padEnd, width as cells} from './text.ts';

type Props = {
	session: SessionSummary;
	// The AI name, with "#2" when several share the branch (SPEC 5.8).
	label: string;
	state: AgentState;
	// Off phase of a blinking glyph (SPEC 5.4): the cell is drawn blank.
	hidden: boolean;
	selected: boolean;
	width: number;
	glyphs: Glyphs;
};

export function SessionRow({session, label, state, hidden, selected, width, glyphs}: Props) {
	const agentText = ` ${label}`;
	const branchWidth = Math.max(0, width - 4 - cells(agentText));
	const {glyph, color} = stateGlyph(state, glyphs);
	return (
		<Text backgroundColor={selected ? COLORS.selected : undefined}>
			<Text color={color}>{`  ${hidden ? ' ' : glyph} `}</Text>
			<Text color={session.dead ? COLORS.dim : COLORS.text}>{padEnd(session.branch, branchWidth)}</Text>
			<Text color={COLORS.dim}>{agentText}</Text>
		</Text>
	);
}
