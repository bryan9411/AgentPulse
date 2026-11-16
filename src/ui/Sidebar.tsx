import React from 'react';
import {Box, Text} from 'ink';
import {MIN_WINDOW} from '../config/layout.ts';
import {messageText, strings, type Lang} from '../i18n/strings.ts';
import {filterActive, liveSessionBranch, selectedIndex, visibleRows, windowTooSmall} from '../state/selectors.ts';
import type {AppState, Dialog, Project} from '../state/types.ts';
import {AddProjectDialog} from './dialogs/AddProjectDialog.tsx';
import {CloseSessionDialog, CLOSE_SESSION_DIALOG_ROWS} from './dialogs/CloseSessionDialog.tsx';
import {RemoveProjectDialog, REMOVE_PROJECT_DIALOG_ROWS} from './dialogs/RemoveProjectDialog.tsx';
import {NewSessionDialog, newSessionDialogRows} from './dialogs/NewSessionDialog.tsx';
import {openUrlLines} from './dialogs/openUrlLines.ts';
import {KeyHints, listHints} from './KeyHints.tsx';
import {Lines} from './Lines.tsx';
import {line, type Line} from './lineParts.ts';
import {SessionList} from './SessionList.tsx';
import {COLORS, GLYPHS, type Glyphs} from './theme.ts';
import {padEnd, truncate, truncateStart, width as cells, wrap} from './text.ts';

type Props = {state: AppState; columns: number; rows: number};

const HEADER_ROWS = 2;
const ADD_PROJECT_DIALOG_ROWS = 5;

const projectName = (projects: Project[], path: string) => projects.find(p => p.path === path)?.name ?? path;

function dialogLines(dialog: Dialog, width: number, lang: Lang): Line[] | null {
	if (dialog.kind === 'open-url') return openUrlLines(dialog, lang, width);
	return null;
}

function dialogRows(dialog: Dialog | null, lines: Line[] | null): number {
	if (!dialog) return 0;
	if (lines) return lines.length;
	if (dialog.kind === 'add-project') return ADD_PROJECT_DIALOG_ROWS;
	if (dialog.kind === 'remove-project') return REMOVE_PROJECT_DIALOG_ROWS;
	if (dialog.kind === 'new-session') return newSessionDialogRows(dialog);
	if (dialog.kind === 'close-session') return CLOSE_SESSION_DIALOG_ROWS;
	return 0;
}

function DialogView({state, dialog, projects, width, lang}: {state: AppState; dialog: Dialog; projects: Project[]; width: number; lang: Lang}) {
	if (dialog.kind === 'add-project') return <AddProjectDialog dialog={dialog} width={width} lang={lang} />;
	if (dialog.kind === 'remove-project') return <RemoveProjectDialog dialog={dialog} width={width} lang={lang} />;
	if (dialog.kind === 'close-session') {
		return <CloseSessionDialog dialog={dialog} branch={liveSessionBranch(state, dialog.session)} width={width} lang={lang} />;
	}
	if (dialog.kind !== 'new-session') return null;
	return <NewSessionDialog dialog={dialog} projectName={projectName(projects, dialog.project)} width={width} lang={lang} />;
}

function HeaderLine({title, width, glyphs}: {title: string; width: number; glyphs: Glyphs}) {
	const shown = truncate(title, Math.max(1, width - 2));
	const rest = Math.max(0, width - 2 - cells(shown));
	const barChar = glyphs.guide === '|' ? '-' : '─';
	const rule = rest >= 2 ? ` ${barChar.repeat(rest - 1)}` : ' '.repeat(rest);
	return (
		<Text>
			<Text color={COLORS.accent} bold>{`${glyphs.cursor} `}</Text>
			<Text color={COLORS.text} bold>
				{shown}
			</Text>
			<Text color={COLORS.rule}>{rule}</Text>
		</Text>
	);
}

function FilterLine({state, width, glyphs}: {state: AppState; width: number; glyphs: Glyphs}) {
	const {text, editing} = state.filter;
	const t = strings(state.config.language).list;
	const only = state.attentionOnly ? t.attentionOnly(glyphs.approval, glyphs.error) : '';
	if (!editing && !text && !only) {
		const slashPrefix = t.filter.startsWith('/ ') ? '/ ' : '';
		const label = slashPrefix ? t.filter.slice(2) : t.filter;
		return (
			<Text>
				{slashPrefix ? <Text color={COLORS.branch}>{slashPrefix}</Text> : null}
				<Text color={COLORS.dim}>{padEnd(label, Math.max(0, width - cells(slashPrefix)))}</Text>
			</Text>
		);
	}
	const keyword = editing || text ? `/ ${text}` : '';
	const cursor = editing ? '▏' : '';
	const tail = only ? `${keyword ? ' · ' : ''}${only}` : '';
	const field = truncateStart(keyword, Math.max(0, width - cells(cursor) - cells(tail)));
	const hasSlash = field.startsWith('/ ');
	const sep = only && keyword ? ' · ' : '';
	const pad = ' '.repeat(Math.max(0, width - cells(field) - cells(cursor) - cells(tail)));
	return (
		<Text>
			{hasSlash ? (
				<Text color={COLORS.accent} bold>
					{'/ '}
				</Text>
			) : null}
			<Text color={COLORS.text}>{hasSlash ? field.slice(2) : field}</Text>
			{cursor ? <Text color={COLORS.accent}>{cursor}</Text> : null}
			{sep ? <Text color={COLORS.subtle}>{sep}</Text> : null}
			{only ? <Text color={COLORS.warn}>{only}</Text> : null}
			{pad}
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
	const isEmptyProject = selected?.kind === 'project' && state.sessions.every(s => s.project !== selected.project.path);
	const hints = listHints({
		focus: state.focus,
		dialog: state.dialog?.kind ?? null,
		row: selected?.kind ?? null,
		isDead: selected?.kind === 'session' && selected.session.dead,
		isEmptyProject,
		editingFilter: state.filter.editing,
		filtered: filterActive(state),
	}, lang);
	const lines = state.dialog ? dialogLines(state.dialog, inner, lang) : null;
	// 最後一次按鍵的即時回饋（flash）優先於常駐通知（notice）
	const message = state.flash ?? state.notice;
	const notice = message ? wrap(messageText(lang, message), inner).map(text => line(text)) : [];
	const footerRows = 1 + hints.length + notice.length + dialogRows(state.dialog, lines);
	const listHeight = Math.max(0, rows - HEADER_ROWS - footerRows);

	const barChar = glyphs.guide === '|' ? '-' : '─';

	// 視窗過矮時寧可裁掉底部按鍵提示，也不要把整個畫面推出捲軸
	return (
		<Box flexDirection="column" width={columns} height={rows} paddingX={1} overflow="hidden">
			<HeaderLine title={t.title} width={inner} glyphs={glyphs} />
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
			{lines ? <Lines lines={lines} width={inner} /> : null}
			{state.dialog && !lines ? <DialogView state={state} dialog={state.dialog} projects={state.projects} width={inner} lang={lang} /> : null}
			{notice.length > 0 ? <Lines lines={notice} width={inner} /> : null}
			<Text color={COLORS.rule}>{barChar.repeat(inner)}</Text>
			<KeyHints lines={hints} width={inner} />
		</Box>
	);
}
