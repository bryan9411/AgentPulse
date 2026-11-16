import React from 'react';
import {Box, Text} from 'ink';
import type {CloseSessionDialog as Dialog} from '../../state/types.ts';
import {messageText, strings, type Lang} from '../../i18n/strings.ts';
import {agentColor, COLORS} from '../theme.ts';
import {padEnd, width as cells} from '../text.ts';

type Props = {dialog: Dialog; branch: string; width: number; lang: Lang};

export const CLOSE_SESSION_DIALOG_ROWS = 4;

export function CloseSessionDialog({dialog, branch, width, lang}: Props) {
	const {session} = dialog;
	const t = strings(lang).closeSession;
	const warning = session.dead ? t.exited : t.willStop;
	const status = dialog.busy ? t.busy : dialog.error ? messageText(lang, dialog.error) : warning;
	const summary = `${branch} · ${session.agent}`;
	return (
		<Box flexDirection="column" height={CLOSE_SESSION_DIALOG_ROWS}>
			<Text color={COLORS.warn} bold>
				{padEnd(t.title, width)}
			</Text>
			{cells(summary) <= width ? (
				<Text>
					<Text color={COLORS.branch}>{branch}</Text>
					<Text color={COLORS.subtle}>{' · '}</Text>
					<Text color={agentColor(session.agent)}>{session.agent}</Text>
					{' '.repeat(Math.max(0, width - cells(summary)))}
				</Text>
			) : (
				<Text color={COLORS.text}>{padEnd(summary, width)}</Text>
			)}
			<Text color={dialog.error ? COLORS.text : COLORS.dim}>
				{dialog.error ? <Text color={COLORS.error}>{'! '}</Text> : null}
				{padEnd(status, Math.max(0, width - (dialog.error ? 2 : 0)))}
			</Text>
			<Text> </Text>
		</Box>
	);
}
