import React from 'react';
import {Box, Text} from 'ink';
import {isBlinking, sessionState} from '../state/selectors.ts';
import type {AppState, Row} from '../state/types.ts';
import {GroupRow} from './GroupRow.tsx';
import {SessionRow} from './SessionRow.tsx';
import type {Glyphs} from './theme.ts';
import {COLORS} from './theme.ts';
import {viewportStart} from './viewport.ts';

type Props = {state: AppState; rows: Row[]; selectedIndex: number; width: number; height: number; glyphs: Glyphs; filtered: boolean};

export function SessionList({state, rows, selectedIndex, width, height, glyphs, filtered}: Props) {
	if (rows.length === 0 && filtered) {
		return (
			<Box flexDirection="column" height={height}>
				<Text color={COLORS.dim}>No matches</Text>
				<Text color={COLORS.dim}>Press esc to clear</Text>
			</Box>
		);
	}
	if (rows.length === 0) {
		return (
			<Box flexDirection="column" height={height}>
				<Text color={COLORS.dim}>No projects</Text>
				<Text color={COLORS.dim}>Press a to add one</Text>
			</Box>
		);
	}
	const start = viewportStart(rows.length, selectedIndex, height);
	const visible = rows.slice(start, start + height);
	return (
		<Box flexDirection="column" height={height}>
			{visible.map((row, offset) => {
				const selected = start + offset === selectedIndex;
				return row.kind === 'project' ? (
					<GroupRow
						key={row.key}
						name={row.project.name}
						count={row.count}
						expanded={row.expanded}
						selected={selected}
						width={width}
						glyphs={glyphs}
					/>
				) : (
					<SessionRow
						key={row.key}
						session={row.session}
						state={sessionState(state, row.session)}
						hidden={!state.blinkOn && isBlinking(state, row.session.id)}
						selected={selected}
						width={width}
						glyphs={glyphs}
					/>
				);
			})}
		</Box>
	);
}
