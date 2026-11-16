import {describe, expect, test} from 'bun:test';
import {agentsTmuxConf, uiTmuxConf} from '../src/bootstrap/tmuxConf.ts';
import {escapeFormat, parseTmuxVersion, shellQuote, tmuxEnv, versionAtLeast} from '../src/infra/tmux.ts';
import {fixSizesCommand} from '../src/services/layout.ts';
import {COLORS} from '../src/ui/theme.ts';
import {viewportStart} from '../src/ui/viewport.ts';

describe('tmux helpers', () => {
	test('version parsing and comparison', () => {
		expect(parseTmuxVersion('tmux 3.8')).toEqual({major: 3, minor: 8});
		expect(parseTmuxVersion('tmux 3.3a')).toEqual({major: 3, minor: 3});
		expect(parseTmuxVersion('tmux next-3.6')).toEqual({major: 3, minor: 6});
		expect(parseTmuxVersion('garbage')).toBeNull();
		expect(versionAtLeast({major: 3, minor: 2}, 3, 2)).toBe(true);
		expect(versionAtLeast({major: 3, minor: 1}, 3, 2)).toBe(false);
		expect(versionAtLeast({major: 4, minor: 0}, 3, 2)).toBe(true);
	});

	test('env drops TMUX and Claude Code variables and guarantees UTF-8', () => {
		const env = tmuxEnv({PATH: '/bin', TMUX: 'x', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', LANG: 'C'});
		expect(env).toEqual({PATH: '/bin', LANG: 'en_US.UTF-8'});
		expect(tmuxEnv({LC_ALL: 'zh_TW.UTF-8'})).toEqual({LC_ALL: 'zh_TW.UTF-8'});
	});

	test('quoting', () => {
		expect(escapeFormat('a#b')).toBe('a##b');
		expect(shellQuote("it's")).toBe(`'it'\\''s'`);
	});

	test('fixed sizes are skipped while zoomed', () => {
		expect(fixSizesCommand({sidebar: '%0', hud: '%2'}, 30)).toBe(
			'if -F "#{?window_zoomed_flag,0,1}" "resize-pane -t %0 -x 30 ; resize-pane -t %2 -y 4"',
		);
	});

	test('generated configs carry the agreed settings', () => {
		const ui = uiTmuxConf();
		expect(ui).toContain('set -g prefix None');
		expect(ui).toContain('set -s escape-time 0');
		expect(ui).toContain(`window-style "bg=${COLORS.bg}`);
		expect(ui).not.toContain('remain-on-exit');
		const ag = agentsTmuxConf();
		expect(ag).toContain('set -g remain-on-exit on');
		expect(ag).toContain('set -g history-limit 50000');
		expect(ag).toContain('set -g status off');
		expect(ag).toContain('AI exited (status #{pane_dead_status})');
		expect(agentsTmuxConf('zh-TW')).toContain('AI 已結束（結束碼 #{pane_dead_status}）· 按 ctrl+q 回到左邊，再按 enter 重新啟動或 x 關閉');
		expect(ui).toContain('bind-key -T root MouseDrag1Pane if-shell -F "#{||:#{pane_in_mode},#{mouse_any_flag}}" { send-keys -M } { }');
		expect(ag).toContain('copy-pipe-no-clear');
		expect(ag).toContain('MouseUp1Pane send-keys -X cancel');
	});
});

describe('viewport', () => {
	test('keeps the selection visible', () => {
		expect(viewportStart(5, 4, 10)).toBe(0);
		expect(viewportStart(100, 0, 10)).toBe(0);
		expect(viewportStart(100, 50, 10)).toBe(45);
		expect(viewportStart(100, 99, 10)).toBe(90);
		expect(viewportStart(100, -1, 10)).toBe(0);
		expect(viewportStart(100, 5, 0)).toBe(0);
	});
});
