import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput, useWindowSize} from 'ink';
import {strings, type Lang} from '../i18n/strings.ts';
import {keyLabel} from './helpLines.ts';
import {useMouseWheel} from './mouseWheel.tsx';
import {clamp, formatScrollRange, nextScrollOffset} from './popupScroll.ts';
import {padEnd, truncate, width as cells, wrap} from './text.ts';
import {COLORS, type Glyphs} from './theme.ts';

export type HelpPopupProps = {
	lang: Lang;
	glyphs: Glyphs;
	backKey: string;
	configPath: string;
	logPath: string;
	onClose: () => void;
};

export type HelpSpan = {text: string; color: string; bg?: string; bold?: boolean};
export type HelpRow = {spans: HelpSpan[]};

export function buildHelpRows(input: Omit<HelpPopupProps, 'onClose'>, maxWidth: number): HelpRow[] {
	const t = strings(input.lang).help;
	const g = input.glyphs;
	const back = keyLabel(input.backKey);
	const w = Math.max(30, maxWidth);
	const blank: HelpRow = {spans: [{text: ' ', color: COLORS.text}]};
	const heading = (title: string): HelpRow => ({
		spans: [
			{text: '▎ ', color: COLORS.accent, bold: true},
			{text: title, color: COLORS.text, bold: true},
		],
	});

	const keyRows: [string, string][] = [...t.keys];
	const rawKeyWidth = Math.max(cells(back), cells(t.everythingElse), ...keyRows.map(([k]) => cells(k)));
	const pillWidth = Math.min(rawKeyWidth + 2, Math.max(10, Math.floor(w * 0.42)));
	const descWidth = Math.max(12, w - 2 - pillWidth - 2);
	const keyRow = (label: string, desc: string, dimDesc = false): HelpRow[] => {
		const pill = ` ${padEnd(label, pillWidth - 2)} `;
		const wrapped = wrap(desc, descWidth);
		const lines = wrapped.length > 0 ? wrapped : [''];
		return lines.map((line, i) =>
			i === 0
				? {
						spans: [
							{text: '  ', color: COLORS.text},
							{text: pill, color: COLORS.text, bg: COLORS.selected, bold: true},
							{text: '  ', color: COLORS.text},
							{text: line, color: dimDesc ? COLORS.dim : COLORS.text},
						],
					}
				: {
						spans: [
							{text: ' '.repeat(2 + pillWidth + 2), color: COLORS.text},
							{text: line, color: dimDesc ? COLORS.dim : COLORS.text},
						],
					},
		);
	};

	const states: [string, string, string][] = [
		[g.running, COLORS.running, t.states.running],
		[g.approval, COLORS.warn, t.states.approval],
		[g.idle, COLORS.text, t.states.idle],
		[g.done, COLORS.done, t.states.done],
		[g.error, COLORS.error, t.states.error],
	];

	const pathRow = (label: string, path: string): HelpRow[] => {
		const labelWidth = cells(label);
		const firstWidth = Math.max(10, w - 2 - labelWidth);
		const parts = wrap(path, firstWidth);
		if (parts.length <= 1) {
			return [
				{
					spans: [
						{text: `  ${label}`, color: COLORS.dim},
						{text: path, color: COLORS.text},
					],
				},
			];
		}
		return [
			{spans: [{text: `  ${label}`, color: COLORS.dim}]},
			...wrap(path, Math.max(10, w - 4)).map(part => ({spans: [{text: `    ${part}`, color: COLORS.text}]})),
		];
	};

	const rows: HelpRow[] = [
		heading(t.symbols),
		...states.map(([glyph, color, desc]) => ({
			spans: [
				{text: '  ', color: COLORS.text},
				{text: glyph, color, bold: true},
				{text: '    ', color: COLORS.text},
				{text: desc, color: COLORS.text},
			],
		})),
		{
			spans: [
				{text: `  ${g.expanded} ${g.collapsed}  `, color: COLORS.dim},
				{text: t.folded, color: COLORS.dim},
			],
		},
		blank,
		heading(t.aiSide),
		...keyRow(back, t.back),
		...keyRow(t.everythingElse, t.toAi, true),
		blank,
		heading(t.listSide),
		...keyRows.flatMap(([key, desc]) => keyRow(key, desc)),
		blank,
		heading(t.quitTitle),
		...t.quit(back).flatMap(line => wrap(line, Math.max(12, w - 2)).map(part => ({spans: [{text: `  ${part}`, color: COLORS.dim}]}))),
		blank,
		heading(t.filesTitle),
		...pathRow(t.settings, input.configPath),
		...pathRow(t.log, input.logPath),
	];
	return rows;
}

export function HelpPopup({lang, glyphs, backKey, configPath, logPath, onClose}: HelpPopupProps) {
	const {columns, rows} = useWindowSize();
	const innerWidth = Math.max(24, columns - 2);
	const t = strings(lang).help;
	const back = keyLabel(backKey);

	const headerRows = 2;
	const footerRows = 2;
	const bodyRows = Math.max(1, rows - headerRows - footerRows);

	const allRows = useMemo(
		() => buildHelpRows({lang, glyphs, backKey, configPath, logPath}, innerWidth),
		[lang, glyphs, backKey, configPath, logPath, innerWidth],
	);

	const maxScroll = Math.max(0, allRows.length - bodyRows);
	const [scroll, setScroll] = useState(0);
	const clampedScroll = clamp(scroll, 0, maxScroll);

	useEffect(() => {
		if (scroll !== clampedScroll) setScroll(clampedScroll);
	}, [scroll, clampedScroll]);

	useMouseWheel(delta => {
		setScroll(s => clamp(s + delta, 0, maxScroll));
	});

	useInput((input, key) => {
		if (input === 'q' || key.escape || (key.ctrl && input === 'c')) {
			onClose();
			return;
		}
		const next = nextScrollOffset(clampedScroll, maxScroll, bodyRows, input, key);
		if (next !== null) setScroll(next);
	});

	const visible = allRows.slice(clampedScroll, clampedScroll + bodyRows);
	const padLines = Math.max(0, bodyRows - visible.length);
	const rightHeader = ` ${back} · ${t.langLabel} `;
	const leftHeader = truncate(t.title, Math.max(8, innerWidth - cells(rightHeader) - 2));
	const scrollRight = formatScrollRange(clampedScroll, bodyRows, allRows.length);
	const hintLeft = truncate(t.scrollHint, Math.max(8, innerWidth - cells(scrollRight) - 2));

	return (
		<Box flexDirection="column" width={columns} height={rows} paddingX={1}>
			<Box justifyContent="space-between" width={innerWidth} height={1}>
				<Text bold color={COLORS.text}>
					{leftHeader}
				</Text>
				<Text backgroundColor={COLORS.selected} color={COLORS.dim}>
					{rightHeader}
				</Text>
			</Box>

			<Text color={COLORS.rule}>{'─'.repeat(innerWidth)}</Text>

			<Box flexDirection="column" height={bodyRows} width={innerWidth}>
				{visible.map((row, idx) => (
					<Text key={clampedScroll + idx} wrap="truncate-end">
						{row.spans.map((span, j) => (
							<Text key={j} color={span.color} backgroundColor={span.bg} bold={span.bold}>
								{span.text}
							</Text>
						))}
					</Text>
				))}
				{Array.from({length: padLines}, (_, idx) => (
					<Text key={`pad-${idx}`}> </Text>
				))}
			</Box>

			<Text color={COLORS.rule}>{'─'.repeat(innerWidth)}</Text>
			<Box justifyContent="space-between" width={innerWidth} height={1}>
				<Text color={COLORS.dim}>{hintLeft}</Text>
				<Text color={COLORS.dim}>{scrollRight}</Text>
			</Box>
		</Box>
	);
}
