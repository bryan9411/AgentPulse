import React from 'react';
import {Text} from 'ink';
import type {Glyphs} from './theme.ts';
import {COLORS} from './theme.ts';
import {padEnd, width as cells} from './text.ts';

type Props = {name: string; count: number; expanded: boolean; selected: boolean; width: number; glyphs: Glyphs};

export function GroupRow({name, count, expanded, selected, width, glyphs}: Props) {
	const countText = ` ${count}`;
	const nameWidth = Math.max(0, width - 2 - cells(countText));
	return (
		<Text backgroundColor={selected ? COLORS.selected : undefined}>
			<Text color={COLORS.dim}>{`${expanded ? glyphs.expanded : glyphs.collapsed} `}</Text>
			<Text color={COLORS.text}>{padEnd(name, nameWidth)}</Text>
			<Text color={COLORS.dim}>{countText}</Text>
		</Text>
	);
}
