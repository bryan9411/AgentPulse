import React from 'react';
import {Text} from 'ink';
import type {Glyphs} from './theme.ts';
import {COLORS} from './theme.ts';
import {padEnd, width as cells} from './text.ts';

type Props = {
	name: string;
	count: number;
	expanded: boolean;
	conflict: boolean;
	selected: boolean;
	width: number;
	glyphs: Glyphs;
};

export function GroupRow({name, count, expanded, conflict, selected, width, glyphs}: Props) {
	const countText = ` ${count}`;
	const mark = conflict ? ' !' : '';
	const nameWidth = Math.max(0, width - 2 - cells(mark) - cells(countText));
	return (
		<Text backgroundColor={selected ? COLORS.selected : undefined}>
			<Text color={COLORS.dim}>{`${expanded ? glyphs.expanded : glyphs.collapsed} `}</Text>
			<Text color={COLORS.text}>{padEnd(name, nameWidth)}</Text>
			{mark ? <Text color={COLORS.warn}>{mark}</Text> : null}
			<Text color={COLORS.dim}>{countText}</Text>
		</Text>
	);
}
