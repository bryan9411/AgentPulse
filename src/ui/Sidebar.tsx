import React from 'react';
import {Box, Text} from 'ink';
import {MIN_WINDOW} from '../config/layout.ts';
import {messageText, strings, type Lang} from '../i18n/strings.ts';
import {filterActive, selectedConflicts, selectedIndex, visibleRows, windowTooSmall, worktreeDialogPath} from '../state/selectors.ts';
import type {AppState, Dialog, Project} from '../state/types.ts';
import {conflictLines} from './conflictLines.ts';
import {AddProjectDialog} from './dialogs/AddProjectDialog.tsx';
import {CloseSessionDialog, closeSessionDialogRows} from './dialogs/CloseSessionDialog.tsx';
import {RemoveProjectDialog, REMOVE_PROJECT_DIALOG_ROWS} from './dialogs/RemoveProjectDialog.tsx';
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

// M6 對話框高度會依內容變動，先轉成行資料以便計算高度；固定高度的對話框則直接回傳 null 由元件渲染
function dialogLines(dialog: Dialog, projects: Project[], width: number, lang: Lang): Line[] | null {
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
	if (dialog.kind === 'close-session') return closeSessionDialogRows(dialog);
	return 0;
}

function DialogView({dialog, projects, width, lang}: {dialog: Dialog; projects: Project[]; width: number; lang: Lang}) {
	if (dialog.kind === 'add-project') return <AddProjectDialog dialog={dialog} width={width} lang={lang} />;
	if (dialog.kind === 'remove-project') return <RemoveProjectDialog dialog={dialog} width={width} lang={lang} />;
	if (dialog.kind === 'close-session') return <CloseSessionDialog dialog={dialog} width={width} lang={lang} />;
	if (dialog.kind !== 'new-session') return null;
	return <NewSessionDialog dialog={dialog} projectName={projectName(projects, dialog.project)} width={width} lang={lang} />;
}

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
	const selected = rowsData[index];
	const hints = listHints({
		focus: state.focus,
		dialog: state.dialog?.kind ?? null,
		row: selected?.kind ?? null,
		isDead: selected?.kind === 'session' && selected.session.dead,
		editingFilter: state.filter.editing,
		filtered: filterActive(state),
		worktreeStep: state.dialog?.kind === 'worktree' ? state.dialog.step : undefined,
		canRemoveWorktree: state.dialog?.kind === 'close-session' ? state.dialog.canRemoveWorktree : undefined,
	}, lang);
	const lines = state.dialog ? dialogLines(state.dialog, state.projects, inner, lang) : null;
	const conflicts = state.dialog ? [] : conflictLines(selectedConflicts(state), lang, inner);
	// 最後一次按鍵的即時回饋（flash）優先於常駐通知（notice）
	const message = state.flash ?? state.notice;
	const notice = message ? wrap(messageText(lang, message), inner).map(text => line(text)) : [];
	const footerRows = 1 + hints.length + notice.length + conflicts.length + dialogRows(state.dialog, lines);
	const listHeight = Math.max(0, rows - HEADER_ROWS - footerRows);

	// 視窗過矮時寧可裁掉底部按鍵提示，也不要把整個畫面推出捲軸
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
