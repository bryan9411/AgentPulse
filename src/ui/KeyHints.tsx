import React from 'react';
import {Box, Text} from 'ink';
import {DEFAULT_LANG, strings, type Lang} from '../i18n/strings.ts';
import type {Dialog} from '../state/types.ts';
import {COLORS} from './theme.ts';
import {truncate, width as cells} from './text.ts';

type Props = {lines: string[]; width: number};

const KEY_TOKEN_RE = /^(ctrl\+\S+|enter \/ n|enter|esc|↑↓|←→|\/|\?|[a-z])(?=$|\s)/;

function HintLine({text, width}: {text: string; width: number}) {
	const clipped = truncate(text, width);
	const parts = clipped.split(' · ');
	const pad = ' '.repeat(Math.max(0, width - cells(clipped)));
	return (
		<Text>
			{parts.map((part, i) => {
				const match = KEY_TOKEN_RE.exec(part);
				const keyText = match?.[1] ?? '';
				const rest = keyText ? part.slice(keyText.length) : part;
				return (
					<React.Fragment key={i}>
						{i > 0 ? <Text color={COLORS.subtle}>{' · '}</Text> : null}
						{keyText ? (
							<Text color={COLORS.accent} bold>
								{keyText}
							</Text>
						) : null}
						{rest ? <Text color={COLORS.dim}>{rest}</Text> : null}
					</React.Fragment>
				);
			})}
			{pad}
		</Text>
	);
}

export function KeyHints({lines, width}: Props) {
	return (
		<Box flexDirection="column">
			{lines.map((line, i) => (
				<HintLine key={i} text={line} width={width} />
			))}
		</Box>
	);
}

export type HintContext = {
	focus: 'list' | 'ai';
	dialog: Dialog['kind'] | null;
	row: 'project' | 'session' | null;
	isDead?: boolean;
	isEmptyProject?: boolean;
	editingFilter?: boolean;
	filtered?: boolean;
};

// 各狀態的提示列行數保持一致，避免游標在專案與工作階段列之間移動時清單高度跳動
export function listHints({focus, dialog, row, isDead, isEmptyProject, editingFilter, filtered}: HintContext, lang: Lang = DEFAULT_LANG): string[] {
	const h = strings(lang).hints;
	if (dialog === 'add-project') return h.addProject;
	if (dialog === 'remove-project') return h.removeProject;
	if (dialog === 'new-session') return h.newSession;
	if (dialog === 'close-session') return h.closeSession;
	if (dialog === 'open-url') return h.openUrl;
	if (focus === 'ai') return h.ai;
	if (editingFilter) return h.editingFilter;
	const filter = filtered ? h.filterOn : h.filterOff;
	const projectBase = isEmptyProject ? h.projectEmpty : h.project;
	const base = row === 'session' ? (isDead ? h.sessionDead : h.session) : projectBase;
	return [...base, filter, ...h.tail];
}
