import {strings, type Lang} from '../../i18n/strings.ts';
import type {OpenUrlDialog} from '../../state/types.ts';
import {choiceLine, line, statusLines, type Line} from '../lineParts.ts';
import {truncate} from '../text.ts';

export function openUrlLines(dialog: OpenUrlDialog, lang: Lang, width: number): Line[] {
	const t = strings(lang).openUrl;
	return [
		line(truncate(t.title, width)),
		...dialog.ports.map((port, i) => choiceLine(`localhost:${port}`, '', i === dialog.index, true, width)),
		...statusLines(dialog, t.busy, lang, width),
	];
}
