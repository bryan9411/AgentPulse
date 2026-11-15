import React from 'react';
import {Box, Text} from 'ink';
import {MIN_WINDOW} from '../config/layout.ts';
import {selectedIndex, visibleRows, windowTooSmall} from '../state/selectors.ts';
import type {AppState, Dialog, Project} from '../state/types.ts';
import {AddProjectDialog} from './dialogs/AddProjectDialog.tsx';
import {CloseSessionDialog, CLOSE_SESSION_DIALOG_ROWS} from './dialogs/CloseSessionDialog.tsx';
import {NewSessionDialog, newSessionDialogRows} from './dialogs/NewSessionDialog.tsx';
import {KeyHints, listHints} from './KeyHints.tsx';
import {SessionList} from './SessionList.tsx';
import {COLORS, GLYPHS} from './theme.ts';
import {padEnd} from './text.ts';

type Props = {state: AppState; columns: number; rows: number};

const HEADER_ROWS = 2;
const ADD_PROJECT_DIALOG_ROWS = 5;

function dialogRows(dialog: Dialog | null): number {
	if (!dialog) return 0;
	if (dialog.kind === 'add-project') return ADD_PROJECT_DIALOG_ROWS;
	if (dialog.kind === 'new-session') return newSessionDialogRows(dialog);
	return CLOSE_SESSION_DIALOG_ROWS;
}

function DialogView({dialog, projects, width}: {dialog: Dialog; projects: Project[]; width: number}) {
	if (dialog.kind === 'add-project') return <AddProjectDialog dialog={dialog} width={width} />;
	if (dialog.kind === 'close-session') return <CloseSessionDialog dialog={dialog} width={width} />;
	const name = projects.find(p => p.path === dialog.project)?.name ?? dialog.project;
	return <NewSessionDialog dialog={dialog} projectName={name} width={width} />;
}

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
	const index = selectedIndex(state, rowsData);
	const hints = listHints({
		focus: state.focus,
		dialog: state.dialog?.kind ?? null,
		row: rowsData[index]?.kind ?? null,
	});
	const footerRows = 1 + hints.length + (state.notice ? 1 : 0) + dialogRows(state.dialog);
	const listHeight = Math.max(1, rows - HEADER_ROWS - footerRows);

	return (
		<Box flexDirection="column" width={columns} height={rows} paddingX={1}>
			<Text color={COLORS.dim}>{padEnd('Sessions', inner)}</Text>
			<Text> </Text>
			<SessionList rows={rowsData} selectedIndex={index} width={inner} height={listHeight} glyphs={glyphs} />
			{state.dialog ? <DialogView dialog={state.dialog} projects={state.projects} width={inner} /> : null}
			{state.notice ? <Text color={COLORS.text}>{padEnd(state.notice, inner)}</Text> : null}
			<Text> </Text>
			<KeyHints lines={hints} width={inner} />
		</Box>
	);
}
