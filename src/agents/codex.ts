import {commandHasProgram} from './match.ts';
import {lastNonEmpty, screenLines} from './screen.ts';
import type {AgentAdapter, ScreenState} from './types.ts';

// Not tested: Codex CLI is not installed on the development machine. The
// patterns follow the prompts in Codex's public documentation and source;
// anything else returns null so the screen-change fallback decides.

const APPROVAL = /Would you like to (?:run|make|apply)\b|Allow command\?/;
const BUSY_HINT = /\besc to interrupt\b/i;

function classify(screen: string): ScreenState | null {
	const lines = screenLines(screen);
	if (lastNonEmpty(lines, 12).some(line => APPROVAL.test(line))) return 'needs-approval';
	if (lastNonEmpty(lines, 6).some(line => BUSY_HINT.test(line))) return 'running';
	return null;
}

export const codex: AgentAdapter = {
	id: 'codex',
	displayName: 'Codex CLI',
	rulesFiles: ['AGENTS.md'],
	binary: 'codex',
	pinsSessionId: false,
	launchCommand: () => ['codex'],
	matchProcess: line => commandHasProgram(line, ['codex']),
	classify,
	// Not tested: whether Codex stops itself on ctrl+z is unknown.
	isSuspended: () => false,
	// Deferred until the user has a Codex account (2026-11-15): no data
	// sources yet, so the HUD shows — and the top bar leaves codex out.
	accountStatus: () => null,
	mcpServers: () => null,
	skillsCount: () => null,
	contextWindows: {},
	sessionInfo: () => ({model: null, effort: null, context: null}),
};
