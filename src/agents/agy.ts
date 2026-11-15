import {commandHasProgram} from './match.ts';
import {findInputBox, lastNonEmpty, screenLines} from './screen.ts';
import type {AgentAdapter, ScreenState} from './types.ts';

// Antigravity CLI 1.5.9, a native binary installed to ~/.local/bin. The
// rules come from screens captured from it (tests/fixtures/agy/) unless
// marked "not tested".

const PROMPT = '>';

// Trust and command-permission dialogs replace the input box and list
// their keys at the bottom.
const DIALOG_HINT = /↑\/↓ Navigate/;

// The footer reads "esc to cancel" while a turn runs. Dialogs show it too,
// which is why they are checked first.
const BUSY_HINT = /^esc to cancel\b/;

// Not tested: no error screen was captured, so errors are not recognised
// and an agy that failed shows as idle.
function classify(screen: string): ScreenState | null {
	const lines = screenLines(screen);
	const box = findInputBox(lines, PROMPT);
	if (!box) return lastNonEmpty(lines, 4).some(line => DIALOG_HINT.test(line)) ? 'needs-approval' : null;
	if (box.footer.some(line => BUSY_HINT.test(line))) return 'running';
	return 'idle';
}

// The status row under the input box always carries right-aligned model
// info, so it is either indented or has a wide gap in the middle. Text typed
// while stopped is echoed raw below the box and has neither.
const STATUS_ROW = /^ {3,}\S|\S {3,}\S/;

// ctrl+z stops agy without printing anything; what is left is the input box
// with its status row gone.
function isSuspended(screen: string): boolean {
	const box = findInputBox(screenLines(screen), PROMPT);
	return box !== null && !box.footer.some(line => STATUS_ROW.test(line));
}

export const agy: AgentAdapter = {
	id: 'agy',
	displayName: 'Antigravity CLI',
	// Not tested: the binary mentions both GEMINI.md and AGENTS.md; settled in M4.
	rulesFile: 'GEMINI.md',
	binary: 'agy',
	launchCommand: () => ['agy'],
	matchProcess: line => commandHasProgram(line, ['agy']),
	classify,
	isSuspended,
};
