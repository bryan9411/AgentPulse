import React from 'react';
import {Box, Text} from 'ink';
import {MIN_WINDOW} from '../config/layout.ts';
import {messageText, strings, type Lang} from '../i18n/strings.ts';
import {filterActive, mergeSettled, selectedConflicts, selectedIndex, visibleRows, windowTooSmall, worktreeDialogPath} from '../state/selectors.ts';
import type {AppState, Dialog, Project} from '../state/types.ts';
import {conflictLines} from './conflictLines.ts';
import {AddProjectDialog} from './dialogs/AddProjectDialog.tsx';
import {CloseSessionDialog, CLOSE_SESSION_DIALOG_ROWS} from './dialogs/CloseSessionDialog.tsx';
import {RemoveProjectDialog, REMOVE_PROJECT_DIALOG_ROWS} from './dialogs/RemoveProjectDialog.tsx';
import {mergeLines} from './dialogs/mergeLines.ts';
import {NewSessionDialog, newSessionDialogRows} from './dialogs/NewSessionDialog.tsx';
import {openUrlLines} from './dialogs/openUrlLines.ts';
import {worktreeLines} from './dialogs/worktreeLines.ts';
import {KeyHints, listHints} from './KeyHints.tsx';
import {Lines} from './Lines.tsx';
import {line, type Line} from './lineParts.ts';
import {SessionList} from './SessionList.tsx';
import {COLORS, GLYPHS, type Glyphs} from './theme.ts';
import {padEnd, truncateStart, width as cells, wrap} from './text.ts';

type Props = {state: AppState; columns: number; rows: number};

const HEADER_ROWS = 2;
const ADD_PROJECT_DIALOG_ROWS = 5;

const projectName = (projects: Project[], path: string) => projects.find(p => p.path === path)?.name ?? path;

// The M6 dialogs vary in height, so they are laid out as data first; null
// for the fixed-height ones, which are components.
function dialogLines(dialog: Dialog, projects: Project[], width: number, lang: Lang): Line[] | null {
	if (dialog.kind === 'merge') return mergeLines(dialog, lang, width);
	if (dialog.kind === 'open-url') return openUrlLines(dialog, lang, width);
	if (dialog.kind !== 'worktree') return null;
	return worktreeLines(dialog, {projectName: projectName(projects, dialog.project), path: worktreeDialogPath(dialog)}, lang, width);
}

function dialogRows(dialog: Dialog | null, lines: Line[] | null): number {
	if (!dialog) return 0;
	if (lines) return lines.length;
	if (dialog.kind === 'add-project') return ADD_PROJECT_DIALOG_ROWS;
	if (dialog.kind === 'remove-project') return REMOVE_PROJECT_DIALOG_ROWS;
	if (dialog.kind === 'new-session') return newSessionDialogRows(dialog);
	return CLOSE_SESSION_DIALOG_ROWS;
}

function DialogView({dialog, projects, width, lang}: {dialog: Dialog; projects: Project[]; width: number; lang: Lang}) {
	if (dialog.kind === 'add-project') return <AddProjectDialog dialog={dialog} width={width} lang={lang} />;
	if (dialog.kind === 'remove-project') return <RemoveProjectDialog dialog={dialog} width={width} lang={lang} />;
	if (dialog.kind === 'close-session') return <CloseSessionDialog dialog={dialog} width={width} lang={lang} />;
	if (dialog.kind !== 'new-session') return null;
	return <NewSessionDialog dialog={dialog} projectName={projectName(projects, dialog.project)} width={width} lang={lang} />;
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
		mergeSettled: state.dialog?.kind === 'merge' && mergeSettled(state.dialog),
	}, lang);
	const lines = state.dialog ? dialogLines(state.dialog, state.projects, inner, lang) : null;
	// A dialog needs the room, and the note would only distract from it.
	const conflicts = state.dialog ? [] : conflictLines(selectedConflicts(state), lang, inner);
	// The answer to the last key outranks a standing notice.
	const message = state.flash ?? state.notice;
	const notice = message ? wrap(messageText(lang, message), inner).map(text => line(text)) : [];
	const footerRows = 1 + hints.length + notice.length + conflicts.length + dialogRows(state.dialog, lines);
	const listHeight = Math.max(0, rows - HEADER_ROWS - footerRows);

	// overflow: in a very short window a tall dialog clips the hints rather
	// than pushing the screen into scrolling.
	return (
		<Box flexDirection="column" width={columns} height={rows} paddingX={1} overflow="hidden">
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
				lang={lang}
			/>
			{conflicts.length > 0 ? <Lines lines={conflicts} width={inner} /> : null}
			{lines ? <Lines lines={lines} width={inner} /> : null}
			{state.dialog && !lines ? <DialogView dialog={state.dialog} projects={state.projects} width={inner} lang={lang} /> : null}
			{notice.length > 0 ? <Lines lines={notice} width={inner} /> : null}
			<Text> </Text>
			<KeyHints lines={hints} width={inner} />
		</Box>
	);
}
