import {join} from 'node:path';
import {homedir} from 'node:os';
import {configDir, loadConfig} from '../config/config.ts';
import {exec, execInteractive} from '../infra/exec.ts';
import {writeTextAtomic} from '../infra/fsx.ts';
import {gitBin} from '../infra/git.ts';
import {configureLog, logError} from '../infra/log.ts';
import {createTmux, parseTmuxVersion, shellQuote, tmuxBin, tmuxEnv, UI_SOCKET, versionAtLeast} from '../infra/tmux.ts';
import {buildUiLayout, uiAlive, UI_SESSION} from '../services/layout.ts';
import {addProjectFromCwd} from '../services/projects.ts';
import {messageText} from '../i18n/strings.ts';
import {aiPlaceholderCommand} from './aiPane.ts';
import {agentsTmuxConf, confPaths, uiTmuxConf} from './tmuxConf.ts';

export type LaunchOptions = {restartUi: boolean};

function fail(message: string): never {
	process.stderr.write(`AgentPulse: ${message}\n`);
	process.exit(1);
}

// How the sidebar pane re-runs this same program, compiled or from source.
export function selfCommand(role: string): string {
	const compiled = Bun.main.startsWith('/$bunfs') || !/\.(tsx?|jsx?)$/.test(Bun.main);
	return compiled
		? `${shellQuote(process.execPath)} --role=${role}`
		: `${shellQuote(process.execPath)} run ${shellQuote(Bun.main)} --role=${role}`;
}

export async function launch(opts: LaunchOptions): Promise<number> {
	const tmuxPath = tmuxBin();
	if (!tmuxPath) fail('tmux not found. Install it with: brew install tmux');
	if (!gitBin()) fail('git not found. Install it with: xcode-select --install');
	const versionOut = (await exec([tmuxPath, '-V'])).stdout;
	const version = parseTmuxVersion(versionOut);
	if (!version || !versionAtLeast(version, 3, 2)) fail(`tmux 3.2 or later is required (found: ${versionOut.trim() || 'unknown'})`);
	if (!process.stdin.isTTY || !process.stdout.isTTY) fail('must be started from a terminal');

	const dir = configDir();
	configureLog(join(dir, 'agentpulse.log'));
	const loaded = loadConfig(dir);
	if (loaded.status === 'invalid') logError(loaded.error);
	const added = await addProjectFromCwd(process.cwd(), dir);
	if (added && !added.ok) logError(`auto-add ${process.cwd()}: ${messageText('en', added.error)}`);
	const config = added?.ok ? added.config : loaded.config;

	const {ui: uiConf, agents: agentsConf} = confPaths(dir);
	writeTextAtomic(uiConf, uiTmuxConf());
	writeTextAtomic(agentsConf, agentsTmuxConf(config.language));

	const ui = createTmux(UI_SOCKET, tmuxPath);
	if (opts.restartUi || !(await uiAlive(ui))) {
		// Only our own UI server; AI sessions live on the other socket and survive.
		await ui.run(['kill-server']);
		const built = await buildUiLayout(ui, {
			confPath: uiConf,
			width: process.stdout.columns || 120,
			height: process.stdout.rows || 36,
			sidebarWidth: config.sidebarWidth,
			sidebarCommand: selfCommand('sidebar'),
			aiPlaceholderCommand: aiPlaceholderCommand(config.language),
			backKey: config.keys.back,
			cwd: homedir(),
		});
		if (typeof built === 'string') {
			await ui.run(['kill-server']);
			fail(`could not build the layout: ${built}`);
		}
	}
	return execInteractive(ui.argv(['attach-session', '-t', `=${UI_SESSION}`]), {env: tmuxEnv()});
}
