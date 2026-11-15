import React from 'react';
import {Box, Text} from 'ink';
import {MIN_WINDOW} from '../config/layout.ts';
import {selectedIndex, visibleRows, windowTooSmall} from '../state/selectors.ts';
import type {AppState} from '../state/types.ts';
import {AddProjectDialog, ADD_PROJECT_DIALOG_ROWS} from './dialogs/AddProjectDialog.tsx';
import {KeyHints, listHints} from './KeyHints.tsx';
import {SessionList} from './SessionList.tsx';
import {COLORS, GLYPHS} from './theme.ts';
import {padEnd} from './text.ts';

type Props = {state: AppState; columns: number; rows: number};

const HEADER_ROWS = 2;

export function Sidebar({state, columns, rows}: Props) {
	const inner = Math.max(1, columns - 2);

	if (windowTooSmall(state)) {
		const w = state.window;
		return (
			<Box flexDirection="column" width={columns} height={rows} paddingX={1}>
				<Text color={COLORS.text}>{padEnd('Window too small', inner)}</Text>
				<Text color={COLORS.dim}>{padEnd(`Need ${MIN_WINDOW.columns}x${MIN_WINDOW.rows}`, inner)}</Text>
				<Text color={COLORS.dim}>{padEnd(w ? `Now ${w.columns}x${w.rows}` : '', inner)}</Text>
			</Box>
		);
	}

	const glyphs = GLYPHS[state.config.glyphs];
	const rowsData = visibleRows(state);
	const hints = listHints(state.focus, state.dialog !== null);
	const footerRows = 1 + hints.length + (state.notice ? 1 : 0) + (state.dialog ? ADD_PROJECT_DIALOG_ROWS : 0);
	const listHeight = Math.max(1, rows - HEADER_ROWS - footerRows);

	return (
		<Box flexDirection="column" width={columns} height={rows} paddingX={1}>
			<Text color={COLORS.dim}>{padEnd('Sessions', inner)}</Text>
			<Text> </Text>
			<SessionList
				rows={rowsData}
				selectedIndex={selectedIndex(state, rowsData)}
				width={inner}
				height={listHeight}
				glyphs={glyphs}
			/>
			{state.dialog ? <AddProjectDialog dialog={state.dialog} width={inner} /> : null}
			{state.notice ? <Text color={COLORS.text}>{padEnd(state.notice, inner)}</Text> : null}
			<Text> </Text>
			<KeyHints lines={hints} width={inner} />
		</Box>
	);
}
