import {describe, expect, test} from 'bun:test';
import {dirname} from 'node:path';
import {agy, splitAgyModel} from '../src/agents/agy.ts';
import {claude, findClaudeLog, firstReplyInput, inputTokens, liveConversation, scanTail} from '../src/agents/claude.ts';
import {codex} from '../src/agents/codex.ts';
import type {HostFs} from '../src/infra/fsx.ts';

const HOME = '/h';

function fakeFs(files: Record<string, string>, env: Record<string, string> = {}, mtimes: Record<string, number> = {}): HostFs {
	const dirs = new Map<string, Set<string>>();
	for (const path of Object.keys(files)) {
		let child = path;
		for (let dir = dirname(path); ; dir = dirname(dir)) {
			if (!dirs.has(dir)) dirs.set(dir, new Set());
			dirs.get(dir)!.add(child.slice(dir === '/' ? 1 : dir.length + 1));
			if (dir === '/') break;
			child = dir;
		}
	}
	return {
		home: HOME,
		env: name => env[name],
		exists: path => path in files || dirs.has(path),
		readText: path => files[path] ?? null,
		readTail: (path, bytes) => (path in files ? files[path]!.slice(-bytes) : null),
		readHead: (path, bytes) => (path in files ? files[path]!.slice(0, bytes) : null),
		listDir: path => [...(dirs.get(path) ?? [])],
		mtimeMs: path => (path in files ? (mtimes[path] ?? 0) : null),
	};
}

// 仿造 Claude Code 2.1.325 記錄檔格式（已移除對話內容）
const usageOf = (input: number) => ({input_tokens: 2, cache_creation_input_tokens: 400, cache_read_input_tokens: input - 402, output_tokens: 598});
const assistant = (model: string, effort?: string, input = 1000, extra: Record<string, unknown> = {}) =>
	JSON.stringify({type: 'assistant', isSidechain: false, ...extra, ...(effort ? {effort} : {}), message: {model, role: 'assistant', usage: usageOf(input)}});
const user = JSON.stringify({type: 'user', message: {role: 'user', content: 'hi'}});
const compacted = (post: number) =>
	JSON.stringify({type: 'system', subtype: 'compact_boundary', compactMetadata: {trigger: 'manual', preTokens: 37428, postTokens: post}});

describe('claude data', () => {
	const id = '4f935b49-b92f-497b-80e4-ada2f0f17758';
	const log = `${HOME}/.claude/projects/-w-shop/${id}.jsonl`;

	test('account: env var or the oauthAccount key, never its value', () => {
		expect(claude.accountStatus(fakeFs({}))).toBe('not-set');
		expect(claude.accountStatus(fakeFs({}, {ANTHROPIC_API_KEY: 'x'}))).toBe('signed-in');
		expect(claude.accountStatus(fakeFs({}, {ANTHROPIC_API_KEY: ''}))).toBe('not-set');
		expect(claude.accountStatus(fakeFs({[`${HOME}/.claude.json`]: '{"oauthAccount":{}}'}))).toBe('signed-in');
		expect(claude.accountStatus(fakeFs({[`${HOME}/.claude.json`]: '{"projects":{}}'}))).toBe('not-set');
	});

	test('MCP: user, local and project servers; disabled project ones left out', () => {
		const fs = fakeFs({
			[`${HOME}/.claude.json`]: JSON.stringify({
				mcpServers: {github: {}},
				projects: {'/w/shop': {mcpServers: {postgres: {}}, disabledMcpjsonServers: ['off']}, '/other': {mcpServers: {nope: {}}}},
			}),
			'/w/shop/.mcp.json': JSON.stringify({mcpServers: {github: {}, figma: {}, off: {}}}),
		});
		expect(claude.mcpServers(fs, '/w/shop')).toEqual(['github', 'postgres', 'figma']);
		expect(claude.mcpServers(fakeFs({[`${HOME}/.claude.json`]: '{}'}), '/w/shop')).toEqual([]);
		expect(claude.mcpServers(fakeFs({[`${HOME}/.claude.json`]: '{broken'}), '/w/shop')).toBeNull();
	});

	test('skills: folders with SKILL.md in the user and project roots', () => {
		const fs = fakeFs({
			[`${HOME}/.claude/skills/a/SKILL.md`]: '',
			[`${HOME}/.claude/skills/notes.txt`]: '',
			[`${HOME}/.claude/skills/empty/readme.md`]: '',
			'/w/shop/.claude/skills/b/SKILL.md': '',
		});
		expect(claude.skillsCount(fs, '/w/shop')).toBe(2);
	});

	test('skills also come from claude.ai sync buckets and enabled plugins', () => {
		const plugin = `${HOME}/.claude/plugins/cache/vendor/tools/1.0.0`;
		const fs = fakeFs({
			[`${HOME}/.claude/skills/synced/bucket-1/pdf/SKILL.md`]: '',
			[`${HOME}/.claude/skills/synced/bucket-1/docx/SKILL.md`]: '',
			[`${HOME}/.claude/skills/synced/.bucket-1`]: '',
			[`${HOME}/.claude/settings.json`]: JSON.stringify({enabledPlugins: {'tools@vendor': true, 'off@vendor': false}}),
			[`${HOME}/.claude/plugins/installed_plugins.json`]: JSON.stringify({
				plugins: {'tools@vendor': [{installPath: plugin}], 'off@vendor': [{installPath: '/off'}]},
			}),
			[`${plugin}/skills/a/SKILL.md`]: '',
			'/off/skills/b/SKILL.md': '',
		});
		expect(claude.skillsCount(fs, '/w/shop')).toBe(3);
	});

	test('the pinned log is found by its id in any project folder', () => {
		const fs = fakeFs({[log]: '', [`${HOME}/.claude/projects/-w-shop/other.jsonl`]: ''});
		expect(findClaudeLog(fs, '/somewhere/else', id)).toBe(log);
		expect(findClaudeLog(fs, '/w/shop', 'missing')).toBeNull();
	});

	test('without an id the newest log in the folder is used', () => {
		const a = `${HOME}/.claude/projects/-w----api/a.jsonl`;
		const b = `${HOME}/.claude/projects/-w----api/b.jsonl`;
		const fs = fakeFs({[a]: '', [b]: ''}, {}, {[a]: 1, [b]: 2});
		expect(findClaudeLog(fs, '/w/商店.api', null)).toBe(b);
	});

	test('model and effort come from the latest real reply', () => {
		const text = [assistant('claude-opus-5-5', 'high'), user, assistant('claude-sonnet-5-5', 'medium'), assistant('<synthetic>'), user].join('\n');
		expect(scanTail(text)).toMatchObject({model: 'claude-sonnet-5-5', effort: 'medium'});
		expect(scanTail(`l":"x"}}\n${assistant('claude-opus-5-5')}`)).toMatchObject({model: 'claude-opus-5-5', effort: null});
		expect(scanTail(user)).toBeNull();
	});

	test('input tokens add cached and uncached input, never output', () => {
		expect(inputTokens(usageOf(37125))).toBe(37125);
		expect(inputTokens({output_tokens: 5})).toBeNull();
		expect(inputTokens(undefined)).toBeNull();
	});

	test('subagent replies are not the main conversation', () => {
		const text = [assistant('claude-opus-5-5', 'high', 50_000), assistant('claude-haiku-5-5', undefined, 900, {isSidechain: true})].join('\n');
		expect(scanTail(text)).toMatchObject({model: 'claude-opus-5-5', input: 50_000, compactedTo: null});
		expect(firstReplyInput([user, assistant('claude-haiku-5-5', undefined, 900, {isSidechain: true}), assistant('claude-opus-5-5', undefined, 37_005)].join('\n'))).toBe(37_005);
	});

	test('a compaction after the latest reply is reported, an older one is not', () => {
		expect(scanTail([assistant('claude-opus-5-5', 'high', 37_125), compacted(7783), user].join('\n'))).toMatchObject({input: 37_125, compactedTo: 7783});
		expect(scanTail([compacted(7783), assistant('claude-opus-5-5', 'high', 20_000)].join('\n'))).toMatchObject({input: 20_000, compactedTo: null});
	});

	test('sessionInfo: context used is the latest input, the base the first', () => {
		const fs = fakeFs({[log]: [user, assistant('claude-opus-5-5', 'low', 37_005), user, assistant('claude-opus-5-5', 'low', 52_000)].join('\n')});
		expect(claude.sessionInfo(fs, {cwd: '/w/shop', sessionId: id, pid: null})).toEqual({
			model: 'claude-opus-5-5',
			effort: 'low',
			context: {used: 52_000, base: 37_005},
		});
	});

	test('sessionInfo: after a compaction, base plus the compacted size', () => {
		const other = `${HOME}/.claude/projects/-w-shop/0b9f7c1e-0000-4000-8000-000000000001.jsonl`;
		const fs = fakeFs({[other]: [user, assistant('claude-opus-5-5', 'low', 37_125), compacted(7783)].join('\n')});
		expect(claude.sessionInfo(fs, {cwd: '/w/shop', sessionId: '0b9f7c1e-0000-4000-8000-000000000001', pid: null}).context).toEqual({used: 44_908, base: 37_125});
	});

	test('sessionInfo follows the process to the conversation /clear started', () => {
		const fresh = '89b25759-e0dc-47f7-893e-cca1d6811ae7';
		const freshLog = `${HOME}/.claude/projects/-w-shop/${fresh}.jsonl`;
		const files = {
			[log]: assistant('claude-opus-5-5', 'low', 90_000),
			[freshLog]: assistant('claude-opus-5-5', 'high', 37_125),
			[`${HOME}/.claude/sessions/13528.json`]: JSON.stringify({pid: 13528, sessionId: fresh, status: 'idle'}),
		};
		const fs = fakeFs(files);
		expect(liveConversation(fs, 13528)).toBe(fresh);
		expect(claude.sessionInfo(fs, {cwd: '/w/shop', sessionId: id, pid: 13528})).toMatchObject({effort: 'high', context: {used: 37_125}});
		expect(claude.sessionInfo(fs, {cwd: '/w/shop', sessionId: id, pid: 999})).toMatchObject({context: {used: 90_000}});
		const stale = fakeFs({...files, [`${HOME}/.claude/sessions/13528.json`]: JSON.stringify({pid: 1, sessionId: fresh})});
		expect(liveConversation(stale, 13528)).toBeNull();
		expect(liveConversation(fakeFs({[`${HOME}/.claude/sessions/5.json`]: '{"sessionId":"../../etc"}'}), 5)).toBeNull();
	});

	test('sessionInfo falls back to the default model before the first reply', () => {
		const settings = `${HOME}/.claude/settings.json`;
		expect(claude.sessionInfo(fakeFs({[log]: user, [settings]: '{"model":"opus"}'}), {cwd: '/w/shop', sessionId: id, pid: null})).toEqual({
			model: 'opus',
			effort: null,
			context: null,
		});
		expect(claude.sessionInfo(fakeFs({}), {cwd: '/w/shop', sessionId: id, pid: null})).toEqual({model: null, effort: null, context: null});
	});

	test('launch pins the conversation id', () => {
		expect(claude.launchCommand({cwd: '/w', sessionId: id})).toEqual(['claude', '--session-id', id]);
	});

	test('restartCommand resumes when a conversation log exists and falls back to --session-id otherwise', () => {
		expect(claude.restartCommand?.(fakeFs({[log]: user}), {cwd: '/w/shop', sessionId: id})).toEqual(['claude', '--resume', id]);
		expect(claude.restartCommand?.(fakeFs({}), {cwd: '/w/shop', sessionId: id})).toEqual(['claude', '--session-id', id]);
		expect(claude.restartCommand?.(fakeFs({}), {cwd: '/w/shop', sessionId: null})).toEqual(['claude']);
	});
});

describe('agy data', () => {
	const gem = `${HOME}/.gemini`;

	test('account: env var, oauth file, or antigravity onboarding cache', () => {
		expect(agy.accountStatus(fakeFs({}))).toBe('not-set');
		expect(agy.accountStatus(fakeFs({}, {GEMINI_API_KEY: 'k'}))).toBe('signed-in');
		expect(agy.accountStatus(fakeFs({[`${gem}/oauth_creds.json`]: 'never parsed'}))).toBe('signed-in');
		const onboarding = `${gem}/antigravity-cli/cache/onboarding.json`;
		expect(agy.accountStatus(fakeFs({[onboarding]: '{"onboardingComplete":false}'}))).toBe('not-set');
		expect(agy.accountStatus(fakeFs({[onboarding]: '{"onboardingComplete":true}'}))).toBe('signed-in');
		expect(agy.accountStatus(fakeFs({[onboarding]: '{"consumerOnboardingComplete":true}'}))).toBe('signed-in');
	});

	test('model setting splits off the level in brackets', () => {
		expect(splitAgyModel('Gemini 4 Hydrogen (Medium)')).toEqual({model: 'Gemini 4 Hydrogen', effort: 'Medium'});
		expect(splitAgyModel('Gemini 4 Flash')).toEqual({model: 'Gemini 4 Flash', effort: null});
		expect(splitAgyModel(null)).toEqual({model: null, effort: null});
		const fs = fakeFs({[`${gem}/antigravity-cli/settings.json`]: '{"model":"Gemini 4 Hydrogen (Medium)","trustedWorkspaces":[]}'});
		expect(agy.sessionInfo(fs, {cwd: '/w', sessionId: null, pid: null})).toEqual({model: 'Gemini 4 Hydrogen', effort: 'Medium', context: null});
	});

	test('MCP: empty or missing file means none', () => {
		const path = `${gem}/config/mcp_config.json`;
		expect(agy.mcpServers(fakeFs({[path]: ''}), '/w')).toEqual([]);
		expect(agy.mcpServers(fakeFs({}), '/w')).toEqual([]);
		expect(agy.mcpServers(fakeFs({[path]: '{"mcpServers":{"github":{}}}'}), '/w')).toEqual(['github']);
		expect(agy.mcpServers(fakeFs({[path]: '{oops'}), '/w')).toBeNull();
	});

	test('skills: global config and the project .agents folder', () => {
		const fs = fakeFs({[`${gem}/config/skills/x/SKILL.md`]: '', '/w/.agents/skills/y/SKILL.md': ''});
		expect(agy.skillsCount(fs, '/w')).toBe(2);
	});
});

test('codex data is deferred: everything unknown', () => {
	const fs = fakeFs({[`${HOME}/.codex/auth.json`]: '{}'}, {OPENAI_API_KEY: 'k'});
	expect(codex.accountStatus(fs)).toBeNull();
	expect(codex.mcpServers(fs, '/w')).toBeNull();
	expect(codex.skillsCount(fs, '/w')).toBeNull();
});
