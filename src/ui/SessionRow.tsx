import React from 'react';
import {Text} from 'ink';
import type {SessionSummary} from '../state/types.ts';
import type {Glyphs} from './theme.ts';
import {COLORS} from './theme.ts';
import {padEnd, width as cells} from './text.ts';

type Props = {session: SessionSummary; selected: boolean; width: number; glyphs: Glyphs};

// Live states (running, needs approval) arrive with M3; for now a session is
// idle while its AI runs and done / error once it has exited (SPEC 5.3 step 1).
function statusGlyph(session: SessionSummary, glyphs: Glyphs): {glyph: string; color: string} {
	if (!session.dead) return {glyph: glyphs.idle, color: COLORS.text};
	if (session.exitStatus === 0) return {glyph: glyphs.done, color: COLORS.text};
	return {glyph: glyphs.error, color: COLORS.error};
}

export function SessionRow({session, selected, width, glyphs}: Props) {
	const agentText = ` ${session.agent}`;
	const branchWidth = Math.max(0, width - 4 - cells(agentText));
	const {glyph, color} = statusGlyph(session, glyphs);
	return (
		<Text backgroundColor={selected ? COLORS.selected : undefined}>
			<Text color={color}>{`  ${glyph} `}</Text>
			<Text color={session.dead ? COLORS.dim : COLORS.text}>{padEnd(session.branch, branchWidth)}</Text>
			<Text color={COLORS.dim}>{agentText}</Text>
		</Text>
	);
}
