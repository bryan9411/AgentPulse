import React from 'react';
import {Text} from 'ink';
import type {Glyphs} from './theme.ts';
import {COLORS} from './theme.ts';
import {truncate, width as cells} from './text.ts';

type Props = {
	name: string;
	branch: string | null;
	count: number;
	expanded: boolean;
	selected: boolean;
	width: number;
	glyphs: Glyphs;
};

export function GroupRow({name, branch, count, expanded, selected, width, glyphs}: Props) {
	const countText = ` ${count}`;
	const room = Math.max(0, width - 2 - cells(countText));
	let shownName = name;
	let shownBranch = branch ? ` (${branch})` : '';
	if (cells(shownName) + cells(shownBranch) > room) {
		const maxName = branch ? Math.max(4, Math.min(cells(name), Math.ceil(room * 0.6))) : room;
		shownName = truncate(name, maxName);
		const branchRoom = room - cells(shownName);
		shownBranch = branch && branchRoom >= 5 ? `${truncate(` (${branch}`, branchRoom - 1)})` : '';
	}
	const spacer = ' '.repeat(Math.max(0, room - cells(shownName) - cells(shownBranch)));
	return (
		<Text backgroundColor={selected ? COLORS.selected : undefined}>
			<Text color={COLORS.dim}>{`${expanded ? glyphs.expanded : glyphs.collapsed} `}</Text>
			<Text color={COLORS.text}>{shownName}</Text>
			{shownBranch ? <Text color={COLORS.dim}>{shownBranch}</Text> : null}
			<Text color={COLORS.dim}>{`${spacer}${countText}`}</Text>
		</Text>
	);
}
