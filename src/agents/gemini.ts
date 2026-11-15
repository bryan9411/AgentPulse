import {commandHasProgram} from './match.ts';
import type {AgentAdapter} from './types.ts';

// Not tested: Gemini CLI is not installed on the development machine.
export const gemini: AgentAdapter = {
	id: 'gemini',
	displayName: 'Gemini CLI',
	rulesFile: 'GEMINI.md',
	binary: 'gemini',
	launchCommand: () => ['gemini'],
	matchProcess: line => commandHasProgram(line, ['gemini']),
};
