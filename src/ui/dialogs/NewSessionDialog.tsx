import React from 'react';
import {Box, Text} from 'ink';
import type {NewSessionDialog as Dialog} from '../../state/types.ts';
import {messageText, strings, type Lang} from '../../i18n/strings.ts';
import {COLORS} from '../theme.ts';
import {padEnd, spread} from '../text.ts';

type Props = {dialog: Dialog; projectName: string; width: number; lang: Lang};

export function newSessionDialogRows(dialog: Dialog): number {
	return 2 + dialog.options.length + 2;
}

export function NewSessionDialog({dialog, projectName, width, lang}: Props) {
	const t = strings(lang).newSession;
	const status = dialog.busy ? t.busy : dialog.error ? messageText(lang, dialog.error) : '';
	return (
		<Box flexDirection="column" height={newSessionDialogRows(dialog)}>
			<Text color={COLORS.text}>{padEnd(t.title, width)}</Text>
			<Text color={COLORS.dim}>{padEnd(t.inProject(projectName), width)}</Text>
			{dialog.options.map((option, i) => {
				const selected = i === dialog.index;
				const line = spread(`${selected ? '›' : ' '} ${option.id}`, option.installed ? '' : t.notInstalled, width);
				return (
					<Text key={option.id} backgroundColor={selected ? COLORS.selected : undefined} color={option.installed ? COLORS.text : COLORS.dim}>
						{line}
					</Text>
				);
			})}
			<Text color={dialog.error ? COLORS.text : COLORS.dim}>
				{dialog.error ? <Text color={COLORS.error}>{'! '}</Text> : null}
				{padEnd(status, Math.max(0, width - (dialog.error ? 2 : 0)))}
			</Text>
			<Text> </Text>
		</Box>
	);
}
