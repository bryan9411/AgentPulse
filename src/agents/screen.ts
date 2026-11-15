// Shared parsing for full-screen agent TUIs captured with `capture-pane -p`.

export function screenLines(screen: string): string[] {
	const lines = screen.split('\n').map(line => line.trimEnd());
	while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
	return lines;
}

// Box borders are long runs of U+2500. Short runs show up inside answers.
export function isRule(line: string): boolean {
	return /^─{20,}$/.test(line);
}

export type InputBox = {
	top: number;
	bottom: number;
	// Non-empty lines below the box (the agent's status / hint row).
	footer: string[];
};

// Footers are one or two rows; anything taller below the last border is a
// dialog (approval prompt, question), not the idle input box.
const MAX_FOOTER_LINES = 3;

function lastRuleBefore(lines: readonly string[], end: number): number {
	for (let i = end - 1; i >= 0; i--) if (isRule(lines[i] ?? '')) return i;
	return -1;
}

// The input box is the last two borders on screen with the prompt glyph
// right under the upper one. Earlier borders around echoed user messages
// look the same, so only the bottom-most pair counts.
export function findInputBox(lines: readonly string[], prompt: string): InputBox | null {
	const bottom = lastRuleBefore(lines, lines.length);
	if (bottom < 1) return null;
	const footer = lines.slice(bottom + 1).filter(line => line.trim() !== '');
	if (footer.length > MAX_FOOTER_LINES) return null;
	const top = lastRuleBefore(lines, bottom);
	if (top < 0 || top + 1 >= bottom) return null;
	// Claude Code puts a no-break space after the prompt glyph in the box
	// and a plain one in echoed messages.
	const first = lines[top + 1] ?? '';
	if (first !== prompt && !first.startsWith(`${prompt} `) && !first.startsWith(`${prompt} `)) return null;
	return {top, bottom, footer};
}

export function lastNonEmpty(lines: readonly string[], count: number): string[] {
	return lines.filter(line => line.trim() !== '').slice(-count);
}
