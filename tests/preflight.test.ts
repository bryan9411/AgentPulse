import {describe, expect, test} from 'bun:test';
import {findProblems, problemReport, type Probe} from '../src/bootstrap/preflight.ts';

const ok: Probe = {tmuxPath: '/opt/homebrew/bin/tmux', tmuxVersionOutput: 'tmux 3.8\n', gitRuns: true, tty: true};

describe('findProblems', () => {
	test('nothing missing', () => {
		expect(findProblems(ok)).toEqual([]);
	});
	test('tmux missing skips the version check', () => {
		expect(findProblems({...ok, tmuxPath: null, tmuxVersionOutput: ''})).toEqual([{kind: 'noTmux'}]);
	});
	test('tmux too old', () => {
		expect(findProblems({...ok, tmuxVersionOutput: 'tmux 3.1c\n'})).toEqual([{kind: 'oldTmux', found: 'tmux 3.1c'}]);
	});
	test('tmux next-3.5 counts as 3.5', () => {
		expect(findProblems({...ok, tmuxVersionOutput: 'tmux next-3.5'})).toEqual([]);
	});
	test('unreadable tmux version is reported as old', () => {
		expect(findProblems({...ok, tmuxVersionOutput: ''})).toEqual([{kind: 'oldTmux', found: ''}]);
	});
	test('git stub that does not run, plus no terminal, all reported', () => {
		expect(findProblems({...ok, tmuxPath: null, gitRuns: false, tty: false}).map(p => p.kind)).toEqual(['noTmux', 'noGit', 'noTty']);
	});
});

describe('problemReport', () => {
	test('English names the install command', () => {
		const text = problemReport('en', [{kind: 'noTmux'}, {kind: 'noGit'}]);
		expect(text).toContain('brew install tmux');
		expect(text).toContain('xcode-select --install');
		expect(text.endsWith('\n')).toBe(true);
	});
	test('Chinese uses the same commands', () => {
		const text = problemReport('zh-TW', [{kind: 'oldTmux', found: ''}]);
		expect(text).toContain('brew upgrade tmux');
		expect(text).toContain('（目前：?）');
	});
	test('no install advice when only the terminal is missing', () => {
		const text = problemReport('en', [{kind: 'noTty'}]);
		expect(text).not.toContain('after installing');
		expect(text.endsWith('terminal.\n') || text.endsWith('Terminal.\n')).toBe(true);
	});
});
