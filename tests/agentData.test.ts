import {describe, expect, test} from 'bun:test';
import {dirname} from 'node:path';
import {agy, splitAgyModel} from '../src/agents/agy.ts';
import {claude, findClaudeLog, lastReplyInfo} from '../src/agents/claude.ts';
import {codex} from '../src/agents/codex.ts';
import type {HostFs} from '../src/infra/fsx.ts';

const HOME = '/h';

// Files by absolute path; folders are implied by the paths.
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
		listDir: path => [...(dirs.get(path) ?? [])],
		mtimeMs: path => (path in files ? (mtimes[path] ?? 0) : null),
	};
}

// Shape of Claude Code 2.1.325 log lines, contents removed.
const assistant = (model: string, effort?: string) =>
	JSON.stringify({type: 'assistant', ...(effort ? {effort} : {}), message: {model, role: 'assistant', usage: {input_tokens: 2}}});
const user = JSON.stringify({type: 'user', message: {role: 'user', content: 'hi'}});

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
		// Non-ASCII characters and dots become dashes too.
		expect(findClaudeLog(fs, '/w/商店.api', null)).toBe(b);
	});

	test('model and effort come from the latest real reply', () => {
		const text = [assistant('claude-opus-5-5', 'high'), user, assistant('claude-sonnet-5-5', 'medium'), assistant('<synthetic>'), user].join('\n');
		expect(lastReplyInfo(text)).toEqual({model: 'claude-sonnet-5-5', effort: 'medium'});
		// A tail usually starts mid-line.
		expect(lastReplyInfo(`l":"x"}}\n${assistant('claude-opus-5-5')}`)).toEqual({model: 'claude-opus-5-5', effort: null});
		expect(lastReplyInfo(user)).toBeNull();
	});

	test('sessionInfo falls back to the default model before the first reply', () => {
		const settings = `${HOME}/.claude/settings.json`;
		expect(claude.sessionInfo(fakeFs({[log]: `${user}\n${assistant('claude-opus-5-5', 'low')}\n`}), {cwd: '/w/shop', sessionId: id})).toEqual({
			model: 'claude-opus-5-5',
			effort: 'low',
		});
		expect(claude.sessionInfo(fakeFs({[log]: user, [settings]: '{"model":"opus"}'}), {cwd: '/w/shop', sessionId: id})).toEqual({
			model: 'opus',
			effort: null,
		});
		expect(claude.sessionInfo(fakeFs({}), {cwd: '/w/shop', sessionId: id})).toEqual({model: null, effort: null});
	});

	test('launch pins the conversation id', () => {
		expect(claude.launchCommand({cwd: '/w', sessionId: id})).toEqual(['claude', '--session-id', id]);
	});
});

describe('agy data', () => {
	const gem = `${HOME}/.gemini`;

	test('account: env var or the oauth file existing', () => {
		expect(agy.accountStatus(fakeFs({}))).toBe('not-set');
		expect(agy.accountStatus(fakeFs({}, {GEMINI_API_KEY: 'k'}))).toBe('signed-in');
		expect(agy.accountStatus(fakeFs({[`${gem}/oauth_creds.json`]: 'never parsed'}))).toBe('signed-in');
	});

	test('model setting splits off the level in brackets', () => {
		expect(splitAgyModel('Gemini 4 Hydrogen (Medium)')).toEqual({model: 'Gemini 4 Hydrogen', effort: 'Medium'});
		expect(splitAgyModel('Gemini 4 Flash')).toEqual({model: 'Gemini 4 Flash', effort: null});
		expect(splitAgyModel(null)).toEqual({model: null, effort: null});
		const fs = fakeFs({[`${gem}/antigravity-cli/settings.json`]: '{"model":"Gemini 4 Hydrogen (Medium)","trustedWorkspaces":[]}'});
		expect(agy.sessionInfo(fs, {cwd: '/w', sessionId: null})).toEqual({model: 'Gemini 4 Hydrogen', effort: 'Medium'});
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
