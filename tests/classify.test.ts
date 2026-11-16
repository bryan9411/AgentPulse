import {describe, expect, test} from 'bun:test';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {getAgent} from '../src/agents/index.ts';
import type {ScreenState} from '../src/agents/types.ts';

const FIXTURES = join(import.meta.dir, 'fixtures');
const screen = (agent: string, name: string) => readFileSync(join(FIXTURES, agent, `${name}.txt`), 'utf8');

// 每個樣本檔都必須在這裡定義預期狀態，底下覆蓋率測試才會通過
const EXPECTED: Record<string, Record<string, ScreenState | null>> = {
	claude: {
		'approval-trust-folder': 'needs-approval',
		'approval-bash': 'needs-approval',
		'approval-bash-blink': 'needs-approval',
		'approval-edit': 'needs-approval',
		'approval-question': 'needs-approval',
		'running-thinking': 'running',
		'running-after-approval': 'running',
		'running-retrying': 'running',
		'idle-fresh': 'idle',
		'idle-after-done': 'idle',
		'idle-after-reject': 'idle',
		'idle-after-question-cancel': 'idle',
		// 週額度使用橫幅不是錯誤狀態
		'idle-usage-banner': 'idle',
		'resumed-with-draft': 'idle',
		'constructed-resumed-notice-above': 'idle',
		'error-api': 'error',
		'suspended': null,
		'suspended-with-draft': null,
		'exited-after-suspend': null,
	},
	agy: {
		'approval-trust-folder': 'needs-approval',
		// agy 授權選單底行一樣有 "esc to cancel"，必須先於執行中判斷
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
		lines.splice(box, 0, '❯ try again', '⏺ Done.');
		expect(getAgent('claude')!.classify(lines.join('\n'))).toBe('idle');
	});

	// 未針對真實 Codex CLI 實測，僅依公開提示字串驗證
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
