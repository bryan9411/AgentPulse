import React from 'react';
import {Box, Text} from 'ink';
import type {CloseSessionDialog as Dialog} from '../../state/types.ts';
import {messageText, strings, type Lang} from '../../i18n/strings.ts';
import {COLORS} from '../theme.ts';
import {padEnd} from '../text.ts';

type Props = {dialog: Dialog; width: number; lang: Lang};

export function closeSessionDialogRows(dialog: Dialog): number {
	return dialog.canRemoveWorktree ? 6 : 4;
}

export function CloseSessionDialog({dialog, width, lang}: Props) {
	const {session} = dialog;
	const t = strings(lang).closeSession;
	const warning = dialog.canRemoveWorktree ? t.keepBranchNote : session.dead ? t.exited : t.willStop;
	const status = dialog.busy ? t.busy : dialog.error ? messageText(lang, dialog.error) : warning;
	const choices = [t.keepFolder, t.removeFolder];
	return (
		<Box flexDirection="column" height={closeSessionDialogRows(dialog)}>
			<Text color={COLORS.text}>{padEnd(t.title, width)}</Text>
			<Text color={COLORS.text}>{padEnd(`${session.branch} · ${session.agent}`, width)}</Text>
			{dialog.canRemoveWorktree
				? choices.map((label, i) => {
						const selected = i === dialog.index;
						return (
							<Text key={label} backgroundColor={selected ? COLORS.selected : undefined} color={COLORS.text}>
								{padEnd(`${selected ? '›' : ' '} ${label}`, width)}
							</Text>
						);
					})
				: null}
			<Text color={dialog.error ? COLORS.text : COLORS.dim}>
				{dialog.error ? <Text color={COLORS.error}>{'! '}</Text> : null}
				{padEnd(status, Math.max(0, width - (dialog.error ? 2 : 0)))}
			</Text>
			<Text> </Text>
		</Box>
	);
}
