import React from 'react';
import {Box, Text} from 'ink';
import {MIN_WINDOW} from '../config/layout.ts';
import {messageText, strings, type Lang} from '../i18n/strings.ts';
import {filterActive, selectedIndex, visibleRows, windowTooSmall} from '../state/selectors.ts';
import type {AppState, Dialog, Project} from '../state/types.ts';
import {AddProjectDialog} from './dialogs/AddProjectDialog.tsx';
import {CloseSessionDialog, CLOSE_SESSION_DIALOG_ROWS} from './dialogs/CloseSessionDialog.tsx';
import {NewSessionDialog, newSessionDialogRows} from './dialogs/NewSessionDialog.tsx';
import {KeyHints, listHints} from './KeyHints.tsx';
import {SessionList} from './SessionList.tsx';
import {COLORS, GLYPHS, type Glyphs} from './theme.ts';
import {padEnd, truncateStart, width as cells} from './text.ts';

type Props = {state: AppState; columns: number; rows: number};

const HEADER_ROWS = 2;
const ADD_PROJECT_DIALOG_ROWS = 5;

function dialogRows(dialog: Dialog | null): number {
	if (!dialog) return 0;
	if (dialog.kind === 'add-project') return ADD_PROJECT_DIALOG_ROWS;
	if (dialog.kind === 'new-session') return newSessionDialogRows(dialog);
	return CLOSE_SESSION_DIALOG_ROWS;
}

function DialogView({dialog, projects, width, lang}: {dialog: Dialog; projects: Project[]; width: number; lang: Lang}) {
	if (dialog.kind === 'add-project') return <AddProjectDialog dialog={dialog} width={width} lang={lang} />;
	if (dialog.kind === 'close-session') return <CloseSessionDialog dialog={dialog} width={width} lang={lang} />;
	const name = projects.find(p => p.path === dialog.project)?.name ?? dialog.project;
	return <NewSessionDialog dialog={dialog} projectName={name} width={width} lang={lang} />;
}

// SPEC 3: the line under the title doubles as the `/` hint and the field.
function FilterLine({state, width, glyphs}: {state: AppState; width: number; glyphs: Glyphs}) {
	const {text, editing} = state.filter;
	const t = strings(state.config.language).list;
	const only = state.attentionOnly ? t.attentionOnly(glyphs.approval, glyphs.error) : '';
	if (!editing && !text && !only) return <Text color={COLORS.dim}>{padEnd(t.filter, width)}</Text>;
	const keyword = editing || text ? `/ ${text}` : '';
	const cursor = editing ? '▏' : '';
	const tail = only ? `${keyword ? ' · ' : ''}${only}` : '';
	const field = truncateStart(keyword, Math.max(0, width - cells(cursor) - cells(tail)));
	return (
		<Text>
			<Text color={COLORS.text}>{field}</Text>
			<Text color={COLORS.dim}>{padEnd(`${cursor}${tail}`, Math.max(0, width - cells(field)))}</Text>
		</Text>
	);
}

export function Sidebar({state, columns, rows}: Props) {
	const inner = Math.max(1, columns - 2);
	const lang = state.config.language;
	const t = strings(lang).list;

	if (windowTooSmall(state)) {
		const w = state.window;
		return (
			<Box flexDirection="column" width={columns} height={rows} paddingX={1}>
				<Text color={COLORS.text}>{padEnd(t.tooSmall, inner)}</Text>
				<Text color={COLORS.dim}>{padEnd(t.need(`${MIN_WINDOW.columns}x${MIN_WINDOW.rows}`), inner)}</Text>
				<Text color={COLORS.dim}>{padEnd(w ? t.now(`${w.columns}x${w.rows}`) : '', inner)}</Text>
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
		editingFilter: state.filter.editing,
		filtered: filterActive(state),
	}, lang);
	const footerRows = 1 + hints.length + (state.notice ? 1 : 0) + dialogRows(state.dialog);
	const listHeight = Math.max(1, rows - HEADER_ROWS - footerRows);

	return (
		<Box flexDirection="column" width={columns} height={rows} paddingX={1}>
			<Text color={COLORS.dim}>{padEnd(t.title, inner)}</Text>
			<FilterLine state={state} width={inner} glyphs={glyphs} />
			<SessionList
				state={state}
				rows={rowsData}
				selectedIndex={index}
				width={inner}
				height={listHeight}
				glyphs={glyphs}
				filtered={filterActive(state)}
			/>
			{state.dialog ? <DialogView dialog={state.dialog} projects={state.projects} width={inner} lang={lang} /> : null}
			{state.notice ? <Text color={COLORS.text}>{padEnd(messageText(lang, state.notice), inner)}</Text> : null}
			<Text> </Text>
			<KeyHints lines={hints} width={inner} />
		</Box>
	);
}
