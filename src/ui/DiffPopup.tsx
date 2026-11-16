import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useInput, useWindowSize} from 'ink';
import {strings, type Lang} from '../i18n/strings.ts';
import {formatBuiltinDiff, fileTabLabels, layoutFileStrip, statusBadge, type BuiltinDiffLine} from './diffFormat.ts';
import {useMouseWheel} from './mouseWheel.tsx';
import {clamp, formatScrollRange, nextScrollOffset} from './popupScroll.ts';
import {padEnd, truncate, truncateStart, width as cells} from './text.ts';
import {COLORS} from './theme.ts';

export type DiffFileInfo = {
	path: string;
	from?: string;
	code: string;
	added: number;
	removed: number;
	binary: boolean;
	untracked: boolean;
};

export type LoadedDiff =
	| {kind: 'binary'; usedDelta: false}
	| {kind: 'empty'; usedDelta: false}
	| {kind: 'delta'; lines: string[]; rawDiff: string; usedDelta: true}
	| {kind: 'raw'; rawDiff: string; usedDelta: false};

type Props = {
	lang: Lang;
	title: string;
	deltaAvailable: boolean;
	initialFiles: DiffFileInfo[];
	loadFile: (file: DiffFileInfo, width: number, sideBySide: boolean) => Promise<LoadedDiff>;
	reloadFiles: () => Promise<DiffFileInfo[] | null>;
	onClose: () => void;
};

type ViewRow = {kind: 'ansi'; text: string} | {kind: 'builtin'; line: BuiltinDiffLine};

export function DiffPopup({lang, title, deltaAvailable, initialFiles, loadFile, reloadFiles, onClose}: Props) {
	const {columns, rows} = useWindowSize();
	const innerWidth = Math.max(24, columns - 2);
	const t = strings(lang).diff;

	const [files, setFiles] = useState<DiffFileInfo[]>(initialFiles);
	const [fileIndex, setFileIndex] = useState(0);
	const [sideBySide, setSideBySide] = useState(false);
	const [scroll, setScroll] = useState(0);
	const [reloadSeq, setReloadSeq] = useState(0);
	const [loaded, setLoaded] = useState<{index: number; data: LoadedDiff} | null>(null);
	const reqRef = useRef(0);

	const activeIndex = clamp(fileIndex, 0, Math.max(0, files.length - 1));
	const activeFile = files[activeIndex];
	const showStrip = files.length > 1;
	const headerRows = showStrip ? 4 : 3;
	const footerRows = 2;
	const bodyRows = Math.max(1, rows - headerRows - footerRows);

	const fetchFile = useCallback(
		async (file: DiffFileInfo, targetIndex: number, w: number, sbs: boolean, resetScroll: boolean) => {
			const id = ++reqRef.current;
			try {
				const data = await loadFile(file, w, sbs);
				if (reqRef.current !== id) return;
				setLoaded({index: targetIndex, data});
				if (resetScroll) setScroll(0);
			} catch {
				if (reqRef.current !== id) return;
				setLoaded({index: targetIndex, data: {kind: 'empty', usedDelta: false}});
			}
		},
		[loadFile],
	);

	// 切換檔案時重置捲動位置並重新載入 Diff
	const prevIndexRef = useRef(activeIndex);
	useEffect(() => {
		if (!activeFile) {
			setLoaded(null);
			return;
		}
		const switched = prevIndexRef.current !== activeIndex;
		prevIndexRef.current = activeIndex;
		void fetchFile(activeFile, activeIndex, innerWidth, sideBySide, switched);
	}, [activeFile, activeIndex, innerWidth, sideBySide, reloadSeq, fetchFile]);

	const viewRows: ViewRow[] = useMemo(() => {
		if (!activeFile) return [{kind: 'builtin', line: {spans: [{text: t.noChanges, color: COLORS.dim}]}}];
		if (!loaded || loaded.index !== activeIndex) return [{kind: 'builtin', line: {spans: [{text: t.loading, color: COLORS.dim}]}}];
		const d = loaded.data;
		if (d.kind === 'binary') return [{kind: 'builtin', line: {spans: [{text: t.binaryFile, color: COLORS.warn}]}}];
		if (d.kind === 'empty') {
			const note = activeFile.untracked ? t.emptyFile : t.noChanges;
			return [{kind: 'builtin', line: {spans: [{text: note, color: COLORS.dim}]}}];
		}
		if (d.kind === 'delta') return d.lines.map(text => ({kind: 'ansi', text}));
		const formatted = formatBuiltinDiff(d.rawDiff, innerWidth);
		if (formatted.length === 0) {
			return [{kind: 'builtin', line: {spans: [{text: activeFile.untracked ? t.emptyFile : t.modeOnly, color: COLORS.dim}]}}];
		}
		return formatted.map(line => ({kind: 'builtin', line}));
	}, [activeFile, activeIndex, loaded, innerWidth, t]);

	const maxScroll = Math.max(0, viewRows.length - bodyRows);
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
		if (files.length > 1 && (key.leftArrow || input === 'h' || input === '[')) {
			setFileIndex(i => Math.max(0, i - 1));
			return;
		}
		if (files.length > 1 && (key.rightArrow || input === 'l' || input === ']')) {
			setFileIndex(i => Math.min(files.length - 1, i + 1));
			return;
		}
		if (input === 's' && deltaAvailable) {
			setSideBySide(v => !v);
			return;
		}
		if (input === 'r') {
			void reloadFiles().then(next => {
				if (!next) return;
				setFiles(next);
				setFileIndex(i => clamp(i, 0, Math.max(0, next.length - 1)));
				setReloadSeq(n => n + 1);
			});
			return;
		}
		const next = nextScrollOffset(clampedScroll, maxScroll, bodyRows, input, key);
		if (next !== null) setScroll(next);
	});

	const usedDelta = loaded?.index === activeIndex ? loaded.data.usedDelta : deltaAvailable;
	const modeBadge = usedDelta ? `${t.rendererDelta} · ${sideBySide ? t.sideBySide : t.unified}` : t.rendererBuiltin;
	const modeText = ` ${modeBadge} `;
	const headerLeftMax = Math.max(8, innerWidth - cells(modeText) - 2);
	const titleLine = truncate(`${t.title} · ${title}`, headerLeftMax);

	const tabLabels = useMemo(() => fileTabLabels(files.map(f => f.path)), [files]);
	const strip = useMemo(() => layoutFileStrip(tabLabels, activeIndex, innerWidth), [tabLabels, activeIndex, innerWidth]);

	const visible = viewRows.slice(clampedScroll, clampedScroll + bodyRows);
	const padLines = Math.max(0, bodyRows - visible.length);

	const hintRight = formatScrollRange(clampedScroll, bodyRows, viewRows.length);
	const hintBase = deltaAvailable ? `${t.hintBase} · ${t.hintSideToggle}` : `${t.hintBase} · ${t.hintDeltaTip}`;
	const hintLeft = truncate(hintBase, Math.max(10, innerWidth - cells(hintRight) - 2));

	return (
		<Box flexDirection="column" width={columns} height={rows} paddingX={1}>
			<Box justifyContent="space-between" width={innerWidth} height={1}>
				<Text bold color={COLORS.text} wrap="truncate-end">
					{titleLine}
				</Text>
				<Text backgroundColor={COLORS.selected} color={usedDelta ? COLORS.running : COLORS.dim}>
					{modeText}
				</Text>
			</Box>

			<FileHeaderBar file={activeFile} index={activeIndex} total={files.length} width={innerWidth} noChanges={t.noChanges} />

			{showStrip ? (
				<Box width={innerWidth} height={1}>
					{strip.moreLeft ? <Text color={COLORS.dim}>{'‹ '}</Text> : null}
					{strip.items.map((item, idx) => (
						<React.Fragment key={item.index}>
							{idx > 0 ? <Text>{' '}</Text> : null}
							<Text
								backgroundColor={item.active ? COLORS.selected : undefined}
								color={item.active ? COLORS.text : COLORS.dim}
								bold={item.active}
							>
								{item.label}
							</Text>
						</React.Fragment>
					))}
					{strip.moreRight ? <Text color={COLORS.dim}>{' ›'}</Text> : null}
				</Box>
			) : null}

			<Text color={COLORS.rule}>{'─'.repeat(innerWidth)}</Text>

			<Box flexDirection="column" height={bodyRows} width={innerWidth}>
				{visible.map((row, idx) =>
					row.kind === 'ansi' ? (
						<Text key={clampedScroll + idx} wrap="truncate-end">
							{row.text}
						</Text>
					) : (
						<Text key={clampedScroll + idx} backgroundColor={row.line.bg} wrap="truncate-end">
							{row.line.spans.map((s, j) => (
								<Text key={j} color={s.color} bold={s.bold}>
									{s.text}
								</Text>
							))}
							{row.line.bg ? ' '.repeat(Math.max(0, innerWidth - row.line.spans.reduce((acc, s) => acc + cells(s.text), 0))) : ''}
						</Text>
					),
				)}
				{Array.from({length: padLines}, (_, idx) => (
					<Text key={`pad-${idx}`}> </Text>
				))}
			</Box>

			<Text color={COLORS.rule}>{'─'.repeat(innerWidth)}</Text>
			<Box justifyContent="space-between" width={innerWidth} height={1}>
				<Text color={COLORS.dim} wrap="truncate-end">
					{hintLeft}
				</Text>
				<Text color={COLORS.dim}>{hintRight}</Text>
			</Box>
		</Box>
	);
}

function FileHeaderBar({
	file,
	index,
	total,
	width,
	noChanges,
}: {
	file: DiffFileInfo | undefined;
	index: number;
	total: number;
	width: number;
	noChanges: string;
}) {
	if (!file) {
		return (
			<Box width={width} height={1}>
				<Text color={COLORS.dim}>{padEnd(noChanges, width)}</Text>
			</Box>
		);
	}
	const badge = statusBadge(file.code);
	const navPrefix = total > 1 ? `${index > 0 ? '◀' : ' '} ${index + 1}/${total} ${index < total - 1 ? '▶' : ' '} ` : '1/1 ';
	const badgeText = ` ${badge.tag} `;
	const addStr = file.added > 0 ? `+${file.added}` : '';
	const delStr = file.removed > 0 ? `-${file.removed}` : '';
	const statParts = [addStr, delStr].filter(Boolean).join(' ');
	const statStr = file.binary ? 'bin' : statParts || '0';
	const pathBudget = Math.max(8, width - cells(navPrefix) - cells(badgeText) - cells(statStr) - 3);
	const fullPath = file.from ? `${file.from} → ${file.path}` : file.path;
	const shownPath = truncateStart(fullPath, pathBudget);

	return (
		<Box justifyContent="space-between" width={width} height={1}>
			<Text wrap="truncate-end">
				<Text color={COLORS.dim}>{navPrefix}</Text>
				<Text backgroundColor={COLORS.selected} color={badge.color} bold>
					{badgeText}
				</Text>
				<Text color={COLORS.text} bold>
					{` ${shownPath}`}
				</Text>
			</Text>
			<Text>
				{file.binary ? (
					<Text color={COLORS.warn}>bin</Text>
				) : (
					<>
						{addStr ? <Text color={COLORS.running}>{addStr}</Text> : null}
						{addStr && delStr ? <Text>{' '}</Text> : null}
						{delStr ? <Text color={COLORS.error}>{delStr}</Text> : null}
						{!addStr && !delStr ? <Text color={COLORS.dim}>0</Text> : null}
					</>
				)}
			</Text>
		</Box>
	);
}

