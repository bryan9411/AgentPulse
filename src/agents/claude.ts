import {commandHasProgram} from './match.ts';
import {findInputBox, isRule, lastNonEmpty, screenLines} from './screen.ts';
import type {AgentAdapter, ScreenState} from './types.ts';

// Every rule below comes from screens captured from Claude Code 2.1.325
// (tests/fixtures/claude/) unless marked "not tested".

const PROMPT = '❯';

// Trust, tool approval and AskUserQuestion dialogs all end with this hint
// and replace the input box while they are open.
const DIALOG_HINT = /\bEsc to cancel\b/;

// Shown in the footer for as long as a turn runs, retries included.
const BUSY_HINT = /\besc to interrupt\b/;

const ERROR_LINES = [
	/^(?:⏺\s*)?API Error\b/,
	// Not tested: wording taken from reports of these failures.
	/^(?:⏺\s*)?(?:Invalid API key|OAuth token has expired|Please run \/login)\b/,
	/^(?:⏺\s*)?(?:Credit balance is too low|Claude usage limit reached|You've hit your limit)\b/,
];

// Only the reply to the latest message counts; an old error above an
// answered prompt is history. The weekly-usage banner ("You've used 75% of
// your weekly limit") sits in this region too and must not match.
function lastReply(lines: readonly string[], boxTop: number): string[] {
	let start = 0;
	for (let i = boxTop - 1; i >= 0; i--) {
		if ((lines[i] ?? '').startsWith(`${PROMPT} `)) {
			start = i + 1;
			break;
		}
	}
	return lines.slice(start, boxTop);
}

function classify(screen: string): ScreenState | null {
	const lines = screenLines(screen);
	const box = findInputBox(lines, PROMPT);
	if (!box) {
		const tail = lastNonEmpty(lines, 1)[0] ?? '';
		return DIALOG_HINT.test(tail) ? 'needs-approval' : null;
	}
	if (box.footer.some(line => BUSY_HINT.test(line))) return 'running';
	const reply = lastReply(lines, box.top).map(line => line.trim());
	if (reply.some(line => ERROR_LINES.some(re => re.test(line)))) return 'error';
	return 'idle';
}

// ctrl+z prints this, hands the tty back and waits for SIGCONT.
const SUSPEND_NOTICE = 'Claude Code has been suspended';

function isSuspended(screen: string): boolean {
	const lines = screenLines(screen);
	const at = lines.findLastIndex(line => line.includes(SUSPEND_NOTICE));
	if (at === -1) return false;
	// A redrawn input box below the notice means it is already running again.
	return !lines.slice(at + 1).some(isRule);
}

export const claude: AgentAdapter = {
	id: 'claude',
	displayName: 'Claude Code',
	rulesFile: 'CLAUDE.md',
	binary: 'claude',
	launchCommand: () => ['claude'],
	matchProcess: line => commandHasProgram(line, ['claude']),
	classify,
	isSuspended,
};
