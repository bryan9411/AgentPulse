import {describe, expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const scripts = ['install.sh', 'uninstall.sh', 'packaging/launcher.sh', 'packaging/AgentPulse.command', 'packaging/make-icon.sh'];

describe('packaging (SPEC 7.1)', () => {
	test('every shell script parses', () => {
		for (const path of scripts) {
			const result = Bun.spawnSync({cmd: ['/bin/sh', '-n', path]});
			expect({path, code: result.exitCode, err: result.stderr.toString()}).toEqual({path, code: 0, err: ''});
		}
	});

	test('Info.plist is valid and names the launcher and icon that exist', () => {
		expect(Bun.spawnSync({cmd: ['/usr/bin/plutil', '-lint', 'packaging/Info.plist']}).exitCode).toBe(0);
		const field = (key: string) =>
			Bun.spawnSync({cmd: ['/usr/bin/plutil', '-extract', key, 'raw', '-o', '-', 'packaging/Info.plist']}).stdout.toString().trim();
		expect(field('CFBundleIdentifier')).toBe('local.agentpulse.app');
		expect(field('CFBundleExecutable')).toBe('AgentPulse');
		expect(field('LSUIElement')).toBe('true');
		expect(read('install.sh')).toContain('cp packaging/launcher.sh "$app/Contents/MacOS/AgentPulse"');
		expect(field('CFBundleIconFile')).toBe('AppIcon');
		expect(Bun.file('packaging/AppIcon.icns').size).toBeGreaterThan(10_000);
	});

	test('install and uninstall agree on the bundle id they check before deleting', () => {
		for (const path of ['install.sh', 'uninstall.sh']) expect(read(path)).toContain('BUNDLE_ID=local.agentpulse.app');
		expect(read('uninstall.sh')).toContain('tccutil reset AppleEvents "$BUNDLE_ID"');
	});

	test('the Bun download is pinned and checked', () => {
		const install = read('install.sh');
		expect(install).toMatch(/^BUN_VERSION=\d+\.\d+\.\d+$/m);
		expect(install).toMatch(/^BUN_SHA256_ARM64=[0-9a-f]{64}$/m);
		expect(install).toMatch(/^BUN_SHA256_X64=[0-9a-f]{64}$/m);
		expect(install).toContain('shasum -a 256');
	});

	test('build:mac is unchanged (CLAUDE.md)', () => {
		const pkg = JSON.parse(read('package.json')) as {scripts: Record<string, string>};
		expect(pkg.scripts['build:mac']).toBe('bun build ./src/index.tsx --compile --outfile dist/AgentPulse');
	});
});
