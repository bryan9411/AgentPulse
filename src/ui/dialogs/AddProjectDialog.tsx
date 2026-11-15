import React from 'react';
import {Box, Text} from 'ink';
import type {AddProjectDialog as Dialog} from '../../state/types.ts';
import {messageText, strings, type Lang} from '../../i18n/strings.ts';
import {COLORS} from '../theme.ts';
import {padEnd, truncateStart, width as cells} from '../text.ts';

type Props = {dialog: Dialog; width: number; lang: Lang};

export function AddProjectDialog({dialog, width, lang}: Props) {
	const t = strings(lang).addProject;
	// Show the tail of a long path: the folder being typed is what matters.
	const field = truncateStart(dialog.value, Math.max(1, width - 1));
	const status = dialog.busy ? t.busy : dialog.error ? messageText(lang, dialog.error) : '';
	return (
		<Box flexDirection="column" height={5}>
			<Text color={COLORS.text}>{padEnd(t.title, width)}</Text>
			<Text color={COLORS.dim}>{padEnd(t.label, width)}</Text>
			<Text backgroundColor={COLORS.selected}>
				<Text color={COLORS.text}>{field}</Text>
				<Text color={COLORS.dim}>{padEnd('▏', Math.max(1, width - cells(field)))}</Text>
			</Text>
			<Text color={dialog.error ? COLORS.text : COLORS.dim}>
				{dialog.error ? <Text color={COLORS.error}>{'! '}</Text> : null}
				{padEnd(status, Math.max(0, width - (dialog.error ? 2 : 0)))}
			</Text>
			<Text> </Text>
		</Box>
	);
}
