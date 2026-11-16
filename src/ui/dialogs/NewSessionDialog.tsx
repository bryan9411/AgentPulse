import React from 'react';
import {Box, Text} from 'ink';
import type {NewSessionDialog as Dialog} from '../../state/types.ts';
import {messageText, strings, type Lang} from '../../i18n/strings.ts';
import {COLORS} from '../theme.ts';
import {padEnd, spread, truncate, width as cells} from '../text.ts';

type Props = {dialog: Dialog; projectName: string; width: number; lang: Lang};

export function newSessionDialogRows(dialog: Dialog): number {
	const noneInstalled = dialog.options.every(o => !o.installed);
	return 2 + dialog.options.length + (noneInstalled ? 1 : 0) + 2;
}

export function NewSessionDialog({dialog, projectName, width, lang}: Props) {
	const t = strings(lang).newSession;
	const noneInstalled = dialog.options.every(o => !o.installed);
	const status = dialog.busy ? t.busy : dialog.error ? messageText(lang, dialog.error) : '';
	return (
		<Box flexDirection="column" height={newSessionDialogRows(dialog)}>
			<Text color={COLORS.text}>{padEnd(t.title, width)}</Text>
			<Text color={COLORS.dim}>{padEnd(t.inProject(projectName, dialog.branch || null), width)}</Text>
			{dialog.options.map((option, i) => {
				const selected = i === dialog.index;
				const right = !option.installed ? t.notInstalled : option.signedIn === false ? t.notSignedIn : '';
				const left = `${selected ? '›' : ' '} ${option.id}`;
				if (!option.installed || !right) {
					return (
						<Text key={option.id} backgroundColor={selected ? COLORS.selected : undefined} color={option.installed ? COLORS.text : COLORS.dim}>
							{spread(left, right, width)}
						</Text>
					);
				}
				const rightWidth = cells(right);
				const leftPad = padEnd(left, Math.max(0, width - rightWidth - 1));
				return (
					<Text key={option.id} backgroundColor={selected ? COLORS.selected : undefined}>
						<Text color={COLORS.text}>{`${leftPad} `}</Text>
						<Text color={COLORS.dim}>{truncate(right, width)}</Text>
					</Text>
				);
			})}
			{noneInstalled ? <Text color={COLORS.warn}>{padEnd(t.noAiHint, width)}</Text> : null}
			<Text color={dialog.error ? COLORS.text : COLORS.dim}>
				{dialog.error ? <Text color={COLORS.error}>{'! '}</Text> : null}
				{padEnd(status, Math.max(0, width - (dialog.error ? 2 : 0)))}
			</Text>
			<Text> </Text>
		</Box>
	);
}
