import React from 'react';
import {Box, Text} from 'ink';
import type {AddProjectDialog as Dialog} from '../../state/types.ts';
import {COLORS} from '../theme.ts';
import {padEnd, truncateStart, width as cells} from '../text.ts';

type Props = {dialog: Dialog; width: number};


export function AddProjectDialog({dialog, width}: Props) {
	// Show the tail of a long path: the folder being typed is what matters.
	const field = truncateStart(dialog.value, Math.max(1, width - 1));
	const status = dialog.busy ? 'Checking…' : (dialog.error ?? '');
	return (
		<Box flexDirection="column" height={5}>
			<Text color={COLORS.text}>{padEnd('Add project', width)}</Text>
			<Text color={COLORS.dim}>{padEnd('Folder path (git repo):', width)}</Text>
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
