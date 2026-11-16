import React from 'react';
import {Box, Text} from 'ink';
import {strings, type Lang} from '../i18n/strings.ts';
import {agentLabel, isBlinking, liveSessionBranch, sessionState} from '../state/selectors.ts';
import type {AppState, Row} from '../state/types.ts';
import {GroupRow} from './GroupRow.tsx';
import {SessionRow} from './SessionRow.tsx';
import type {Glyphs} from './theme.ts';
import {COLORS} from './theme.ts';
import {viewportStart} from './viewport.ts';

type Props = {
	state: AppState;
	rows: Row[];
	selectedIndex: number;
	width: number;
	height: number;
	glyphs: Glyphs;
	filtered: boolean;
	lang: Lang;
};

export function SessionList({state, rows, selectedIndex, width, height, glyphs, filtered, lang}: Props) {
	if (height <= 0) return null;
	if (rows.length === 0) {
		const t = strings(lang).list;
		return (
			<Box flexDirection="column" height={height}>
				<Text color={COLORS.dim}>{filtered ? t.noMatches : t.noProjects}</Text>
				<Text color={COLORS.dim}>{filtered ? t.clearFilter : t.addOne}</Text>
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
						branch={row.branch}
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
						branch={liveSessionBranch(state, row.session)}
						label={agentLabel(state, row.session)}
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
