import React from 'react';
import {Box, Text} from 'ink';
import type {Row} from '../state/types.ts';
import {GroupRow} from './GroupRow.tsx';
import {SessionRow} from './SessionRow.tsx';
import type {Glyphs} from './theme.ts';
import {COLORS} from './theme.ts';
import {viewportStart} from './viewport.ts';

type Props = {rows: Row[]; selectedIndex: number; width: number; height: number; glyphs: Glyphs};

export function SessionList({rows, selectedIndex, width, height, glyphs}: Props) {
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
						selected={selected}
						width={width}
						glyphs={glyphs}
					/>
				);
			})}
		</Box>
	);
}
