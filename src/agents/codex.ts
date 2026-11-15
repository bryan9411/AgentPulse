import {commandHasProgram} from './match.ts';
import type {AgentAdapter} from './types.ts';

// Not tested: Codex CLI is not installed on the development machine.
export const codex: AgentAdapter = {
	id: 'codex',
	displayName: 'Codex CLI',
	rulesFile: 'AGENTS.md',
	binary: 'codex',
	launchCommand: () => ['codex'],
	matchProcess: line => commandHasProgram(line, ['codex']),
};
