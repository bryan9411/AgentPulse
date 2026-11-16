import React from 'react';
import {Box, Text} from 'ink';
import type {NewSessionDialog as Dialog} from '../../state/types.ts';
import {messageText, strings, type Lang} from '../../i18n/strings.ts';
import {agentColor, COLORS} from '../theme.ts';
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
	const prefix = t.inProject('', null);
	const branchText = dialog.branch ? ` (${dialog.branch})` : '';
	const fullSubtitle = t.inProject(projectName, dialog.branch || null);
	const fitsFull = cells(fullSubtitle) <= width;
	return (
		<Box flexDirection="column" height={newSessionDialogRows(dialog)}>
			<Text color={COLORS.accent} bold>
				{padEnd(t.title, width)}
			</Text>
			{fitsFull ? (
				<Text>
					{prefix ? <Text color={COLORS.dim}>{prefix}</Text> : null}
					<Text color={COLORS.project} bold>
						{projectName}
					</Text>
					{branchText ? <Text color={COLORS.branch}>{branchText}</Text> : null}
					{' '.repeat(Math.max(0, width - cells(fullSubtitle)))}
				</Text>
			) : (
				<Text color={COLORS.dim}>{padEnd(fullSubtitle, width)}</Text>
			)}
			{dialog.options.map((option, i) => {
				const selected = i === dialog.index;
				const right = !option.installed ? t.notInstalled : option.signedIn === false ? t.notSignedIn : '';
				const marker = selected ? '› ' : '  ';
				const left = `${marker}${option.id}`;
				const nameColor = option.installed ? agentColor(option.id) : COLORS.dim;
				const rightColor = !option.installed ? COLORS.subtle : COLORS.warn;
				if (!right) {
					const pad = ' '.repeat(Math.max(0, width - cells(left)));
					return (
						<Text key={option.id} backgroundColor={selected ? COLORS.selected : undefined}>
							<Text color={selected ? COLORS.accent : COLORS.dim} bold={selected}>
								{marker}
							</Text>
							<Text color={nameColor} bold={selected && option.installed}>
								{option.id}
							</Text>
							{pad}
						</Text>
					);
				}
				const rightWidth = cells(right);
				const nameRoom = Math.max(0, width - rightWidth - 1 - cells(marker));
				const nameShown = padEnd(option.id, nameRoom);
				return (
					<Text key={option.id} backgroundColor={selected ? COLORS.selected : undefined}>
						<Text color={selected ? COLORS.accent : COLORS.dim} bold={selected}>
							{marker}
						</Text>
						<Text color={nameColor} bold={selected && option.installed}>
							{`${nameShown} `}
						</Text>
						<Text color={rightColor}>{truncate(right, width)}</Text>
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
