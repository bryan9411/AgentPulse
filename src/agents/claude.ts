import {commandHasProgram} from './match.ts';
import type {AgentAdapter} from './types.ts';

// Tested with Claude Code 2.1.325.
export const claude: AgentAdapter = {
	id: 'claude',
	displayName: 'Claude Code',
	rulesFile: 'CLAUDE.md',
	binary: 'claude',
	launchCommand: () => ['claude'],
	matchProcess: line => commandHasProgram(line, ['claude']),
};
