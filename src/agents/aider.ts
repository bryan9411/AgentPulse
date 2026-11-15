import {commandHasProgram} from './match.ts';
import type {AgentAdapter} from './types.ts';

// Not tested: Aider is not installed on the development machine. It is a
// Python program, so a process listing may show `python … aider`.
export const aider: AgentAdapter = {
	id: 'aider',
	displayName: 'Aider',
	rulesFile: null,
	binary: 'aider',
	launchCommand: () => ['aider'],
	matchProcess: line => commandHasProgram(line, ['aider']),
};
