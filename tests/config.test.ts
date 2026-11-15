import {describe, expect, test} from 'bun:test';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configFile, DEFAULT_CONFIG, loadConfig, normalizeConfig, saveConfig, withProject} from '../src/config/config.ts';

const tempDir = () => join(mkdtempSync(join(tmpdir(), 'ap-config-')), 'agentpulse');

describe('config', () => {
	test('missing file is created with defaults', () => {
		const dir = tempDir();
		const r = loadConfig(dir);
		expect(r.status).toBe('created');
		expect(r.config).toEqual(DEFAULT_CONFIG);
		expect(JSON.parse(readFileSync(configFile(dir), 'utf8'))).toEqual(DEFAULT_CONFIG);
	});

	test('save then load round-trips', () => {
		const dir = tempDir();
		const config = withProject(DEFAULT_CONFIG, '/tmp/repo');
		saveConfig(dir, config);
		expect(loadConfig(dir)).toEqual({status: 'ok', config});
	});

	test('invalid JSON keeps the file and reports the error', () => {
		const dir = tempDir();
		loadConfig(dir);
		writeFileSync(configFile(dir), '{ broken');
		const r = loadConfig(dir);
		expect(r.status).toBe('invalid');
		expect(readFileSync(configFile(dir), 'utf8')).toBe('{ broken');
	});

	test('wrong fields fall back to defaults individually', () => {
		const c = normalizeConfig({
			projects: ['/a', 'relative', 42, '/a', '/b'],
			sidebarWidth: 5,
			glyphs: 'ascii',
			keys: {back: ''},
			contextWarnAt: 'x',
			contextWindows: {m: 1000, bad: -1},
			unknown: true,
		});
		expect(c.projects).toEqual(['/a', '/b']);
		expect(c.sidebarWidth).toBe(30);
		expect(c.glyphs).toBe('ascii');
		expect(c.keys.back).toBe('C-q');
		expect(c.contextWarnAt).toBe(80);
		expect(c.contextWindows).toEqual({m: 1000});
	});

	test('contextWarnAt keeps valid percentage and rejects out-of-range values', () => {
		expect(normalizeConfig({contextWarnAt: 75}).contextWarnAt).toBe(75);
		expect(normalizeConfig({contextWarnAt: 0}).contextWarnAt).toBe(80);
		expect(normalizeConfig({contextWarnAt: 101}).contextWarnAt).toBe(80);
	});

	test('language accepts en and zh-TW only', () => {
		expect(DEFAULT_CONFIG.language).toBe('en');
		expect(normalizeConfig({language: 'zh-TW'}).language).toBe('zh-TW');
		expect(normalizeConfig({language: 'zh'}).language).toBe('en');
		expect(normalizeConfig({}).language).toBe('en');
	});

	test('withProject does not duplicate', () => {
		const once = withProject(DEFAULT_CONFIG, '/x');
		expect(withProject(once, '/x')).toBe(once);
		expect(once.projects).toEqual(['/x']);
		expect(DEFAULT_CONFIG.projects).toEqual([]);
	});
});
