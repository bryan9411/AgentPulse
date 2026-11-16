import React from 'react';
import {Box, Text} from 'ink';
import type {RemoveProjectDialog as Dialog} from '../../state/types.ts';
import {messageText, strings, type Lang} from '../../i18n/strings.ts';
import {COLORS} from '../theme.ts';
import {padEnd} from '../text.ts';

type Props = {dialog: Dialog; width: number; lang: Lang};

export const REMOVE_PROJECT_DIALOG_ROWS = 4;

export function RemoveProjectDialog({dialog, width, lang}: Props) {
	const {project, sessionCount} = dialog;
	const t = strings(lang).removeProject;
	const note = sessionCount > 0 ? t.sessionsWillStop(sessionCount) : t.willRemove;
	const status = dialog.busy ? t.busy : dialog.error ? messageText(lang, dialog.error) : note;
	return (
		<Box flexDirection="column" height={REMOVE_PROJECT_DIALOG_ROWS}>
			<Text color={COLORS.error} bold>
				{padEnd(t.title, width)}
			</Text>
			<Text color={COLORS.project} bold>
				{padEnd(project.name, width)}
			</Text>
			<Text color={dialog.error ? COLORS.text : COLORS.dim}>
				{dialog.error ? <Text color={COLORS.error}>{'! '}</Text> : null}
				{padEnd(status, Math.max(0, width - (dialog.error ? 2 : 0)))}
			</Text>
			<Text color={COLORS.dim}>{padEnd(t.diskUntouched, width)}</Text>
		</Box>
	);
}
