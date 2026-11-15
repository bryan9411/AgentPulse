import {describe, expect, test} from 'bun:test';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {getAgent} from '../src/agents/index.ts';
import type {ScreenState} from '../src/agents/types.ts';

const FIXTURES = join(import.meta.dir, 'fixtures');
const screen = (agent: string, name: string) => readFileSync(join(FIXTURES, agent, `${name}.txt`), 'utf8');

// Every captured screen has an expected state; a new fixture without an
// entry here fails the coverage test below.
const EXPECTED: Record<string, Record<string, ScreenState | null>> = {
	claude: {
		'approval-trust-folder': 'needs-approval',
		'approval-bash': 'needs-approval',
		// The ⏺ next to the pending command blinks while it waits.
		'approval-bash-blink': 'needs-approval',
		'approval-edit': 'needs-approval',
		'approval-question': 'needs-approval',
		'running-thinking': 'running',
		'running-after-approval': 'running',
		// Connection retries are still a running turn, not an error yet.
		'running-retrying': 'running',
		'idle-fresh': 'idle',
		'idle-after-done': 'idle',
		'idle-after-reject': 'idle',
		'idle-after-question-cancel': 'idle',
		// "You've used 75% of your weekly limit" is a banner, not an error.
		'idle-usage-banner': 'idle',
		'resumed-with-draft': 'idle',
		'constructed-resumed-notice-above': 'idle',
		'error-api': 'error',
		'suspended': null,
		'suspended-with-draft': null,
		// The pane is dead here; the status machine never asks the adapter.
		'exited-after-suspend': null,
	},
	agy: {
		'approval-trust-folder': 'needs-approval',
		// Its footer also says "esc to cancel", like a running turn.
		'approval-command': 'needs-approval',
		'running-generating': 'running',
		'running-command': 'running',
		'idle-fresh': 'idle',
		'idle-fresh-auto-mode': 'idle',
		'idle-after-done': 'idle',
		'resumed-with-draft': 'idle',
		'suspended-with-draft': 'idle',
		'suspended-typed-while-stopped': 'idle',
	},
};

const SUSPENDED: Record<string, string[]> = {
	claude: ['suspended', 'suspended-with-draft', 'exited-after-suspend'],
	agy: ['suspended-with-draft', 'suspended-typed-while-stopped'],
};

describe('classify', () => {
	for (const [agentId, cases] of Object.entries(EXPECTED)) {
		const agent = getAgent(agentId)!;
		for (const [name, expected] of Object.entries(cases)) {
			test(`${agentId} ${name} → ${expected}`, () => {
				expect(agent.classify(screen(agentId, name))).toBe(expected);
			});
		}
		test(`${agentId}: every fixture has an expectation`, () => {
			const files = readdirSync(join(FIXTURES, agentId)).map(f => f.replace(/\.txt$/, ''));
			expect(files.sort()).toEqual(Object.keys(cases).sort());
		});
	}

	test('an empty or unknown screen is not guessed', () => {
		for (const id of ['claude', 'agy', 'codex']) {
			expect(getAgent(id)!.classify('')).toBeNull();
			expect(getAgent(id)!.classify('$ ls\nfoo bar\n')).toBeNull();
		}
	});

	test('an old API error above a newer prompt is history', () => {
		const lines = screen('claude', 'error-api').split('\n');
		const box = lines.findIndex(l => l.startsWith('──'));
		// Answer the error with a new message whose reply was fine.
		lines.splice(box, 0, '❯ try again', '⏺ Done.');
		expect(getAgent('claude')!.classify(lines.join('\n'))).toBe('idle');
	});

	// Not tested against a real Codex: these mirror its documented prompts.
	test('codex follows its documented prompts', () => {
		const codex = getAgent('codex')!;
		expect(codex.classify('Would you like to run the following command?\n\n  $ ls\n\n› 1. Yes, proceed')).toBe('needs-approval');
		expect(codex.classify('• Working (12s • esc to interrupt)\n\n› \n')).toBe('running');
		expect(codex.isSuspended('anything')).toBe(false);
	});
});

describe('isSuspended', () => {
	for (const [agentId, files] of Object.entries(SUSPENDED)) {
		const agent = getAgent(agentId)!;
		for (const [name] of Object.entries(EXPECTED[agentId] ?? {})) {
			const expected = files.includes(name);
			test(`${agentId} ${name} → ${expected ? 'suspended' : 'live'}`, () => {
				expect(agent.isSuspended(screen(agentId, name))).toBe(expected);
			});
		}
	}
});
