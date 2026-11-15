import {describe, expect, test} from 'bun:test';
import {agentsTmuxConf, uiTmuxConf} from '../src/bootstrap/tmuxConf.ts';
import {mergePath} from '../src/infra/exec.ts';
import {parseShellPath, SHELL_PATH_SCRIPT} from '../src/infra/platform/darwin.ts';

describe('parseShellPath', () => {
	test('ignores whatever the start-up files print around it', () => {
		const out = 'Welcome back!\n__AGENTPULSE_PATH_BEGIN__\n/Users/me/.nvm/versions/node/v22/bin:/usr/bin\n__AGENTPULSE_PATH_END__\nbye\n';
		expect(parseShellPath(out)).toBe('/Users/me/.nvm/versions/node/v22/bin:/usr/bin');
	});
	test('missing markers or an empty PATH give null', () => {
		expect(parseShellPath('')).toBeNull();
		expect(parseShellPath('__AGENTPULSE_PATH_BEGIN__\n\n__AGENTPULSE_PATH_END__\n')).toBeNull();
	});
	test('the script runs in a real shell', async () => {
		const proc = Bun.spawnSync({cmd: ['/bin/sh', '-c', SHELL_PATH_SCRIPT], env: {PATH: '/a b:/usr/bin:/bin'}});
		expect(parseShellPath(proc.stdout.toString())).toBe('/a b:/usr/bin:/bin');
	});
});

describe('mergePath', () => {
	test('shell entries first, inherited ones kept, no duplicates or blanks', () => {
		expect(mergePath('/nvm/bin:/usr/bin', '/usr/bin:/bin::/sbin')).toBe('/nvm/bin:/usr/bin:/bin:/sbin');
	});
	test('a path with spaces or CJK survives', () => {
		expect(mergePath('/工具/bin', '/My Apps/bin')).toBe('/工具/bin:/My Apps/bin');
	});
});

describe('extended keys', () => {
	test('both servers ask for modifyOtherKeys and the kitty protocol', () => {
		for (const conf of [uiTmuxConf(), agentsTmuxConf()]) {
			expect(conf).toContain(String.raw`Eneks=\E[>4;2m\E[>1u`);
			expect(conf).toContain(String.raw`Dseks=\E[>4m\E[<u`);
		}
	});
});
