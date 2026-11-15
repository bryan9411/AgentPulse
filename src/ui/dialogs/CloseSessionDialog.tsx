import React from 'react';
import {Box, Text} from 'ink';
import type {CloseSessionDialog as Dialog} from '../../state/types.ts';
import {COLORS} from '../theme.ts';
import {padEnd} from '../text.ts';

type Props = {dialog: Dialog; width: number};

export const CLOSE_SESSION_DIALOG_ROWS = 4;

export function CloseSessionDialog({dialog, width}: Props) {
	const {session} = dialog;
	const warning = session.dead ? 'The AI has already exited.' : 'The AI will be stopped.';
	const status = dialog.busy ? 'Closing…' : (dialog.error ?? warning);
	return (
		<Box flexDirection="column" height={CLOSE_SESSION_DIALOG_ROWS}>
			<Text color={COLORS.text}>{padEnd('Close session?', width)}</Text>
			<Text color={COLORS.text}>{padEnd(`${session.branch} · ${session.agent}`, width)}</Text>
			<Text color={dialog.error ? COLORS.text : COLORS.dim}>
				{dialog.error ? <Text color={COLORS.error}>{'! '}</Text> : null}
				{padEnd(status, Math.max(0, width - (dialog.error ? 2 : 0)))}
			</Text>
			<Text> </Text>
		</Box>
	);
}
