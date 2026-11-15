import {describe, expect, test} from 'bun:test';
import {AGENTS, getAgent} from '../src/agents/index.ts';

describe('agent adapters', () => {
	test('all three are registered with a launch command', () => {
		expect(AGENTS.map(a => a.id)).toEqual(['claude', 'codex', 'agy']);
		for (const agent of AGENTS) expect(agent.launchCommand({cwd: '/tmp', sessionId: null})[0]).toBe(agent.binary);
		expect(getAgent('nope')).toBeNull();
	});

	test('matchProcess recognises direct and node-wrapped launches', () => {
		const claude = getAgent('claude')!;
		expect(claude.matchProcess('claude')).toBe(true);
		expect(claude.matchProcess('/Users/me/.nvm/versions/node/v22/bin/claude --resume')).toBe(true);
		expect(claude.matchProcess('node /Users/me/.nvm/versions/node/v22/bin/claude')).toBe(true);
		expect(claude.matchProcess('vim claude-notes.md')).toBe(false);
		expect(getAgent('aider')).toBeNull();
		expect(getAgent('codex')!.matchProcess('node /x/codex/bin/codex.js')).toBe(true);
		expect(getAgent('gemini')).toBeNull();
		expect(getAgent('agy')!.matchProcess('/Users/me/.local/bin/agy --continue')).toBe(true);
		expect(getAgent('agy')!.matchProcess('agy-ide')).toBe(false);
	});
});
