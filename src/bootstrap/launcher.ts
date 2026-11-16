import {statSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {configDir, loadConfig} from '../config/config.ts';
import {execInteractive, mergePath} from '../infra/exec.ts';
import {writeTextAtomic} from '../infra/fsx.ts';
import {configureLog, logError} from '../infra/log.ts';
import {platform} from '../infra/platform/index.ts';
import {createTmux, shellQuote, tmuxBin, tmuxEnv, UI_SOCKET} from '../infra/tmux.ts';
import {buildUiLayout, uiAlive, UI_SESSION} from '../services/layout.ts';
import {addProjectFromCwd} from '../services/projects.ts';
import {messageText} from '../i18n/strings.ts';
import {aiPlaceholderCommand} from './aiPane.ts';
import {findProblems, probe, problemReport} from './preflight.ts';
import {agentsTmuxConf, confPaths, uiTmuxConf} from './tmuxConf.ts';

export type LaunchOptions = {restartUi: boolean};

function fail(message: string): never {
	process.stderr.write(`AgentPulse: ${message}\n`);
	process.exit(1);
}

function isCompiled(): boolean {
	return Bun.main.startsWith('/$bunfs') || !/\.(tsx?|jsx?)$/.test(Bun.main);
}

function currentBuildStamp(): string {
	const compiled = isCompiled();
	const target = compiled ? process.execPath : Bun.main;
	try {
		const stat = statSync(target);
		return `${compiled ? 'bin' : 'src'}:${stat.mtimeMs}:${stat.size}`;
	} catch {
		return compiled ? 'bin:unknown' : `src:${Bun.main}`;
	}
}

export function selfCommand(role: string): string {
	return isCompiled()
		? `${shellQuote(process.execPath)} --role=${role}`
		: `${shellQuote(process.execPath)} run ${shellQuote(Bun.main)} --role=${role}`;
}

export async function launch(opts: LaunchOptions): Promise<number> {
	const dir = configDir();
	configureLog(join(dir, 'agentpulse.log'));
	// 先讀設定檔，讓底下啟動檢查的錯誤訊息能以使用者的介面語言顯示
	const loaded = loadConfig(dir);
	// 從 App bundle 或 iTerm2 profile 直接啟動時不會經過 login shell，PATH 會缺少 nvm 等路徑，
	// 必須在建立任何 tmux server 或啟動 AI 前先補齊
	const shellPath = await platform.loginShellPath();
	if (shellPath) process.env.PATH = mergePath(shellPath, process.env.PATH ?? '');
	else logError('could not read PATH from the login shell; using the inherited one');
	const problems = findProblems(await probe());
	if (problems.length > 0) {
		// 回傳非零結束碼，讓雙擊開啟的 Terminal 視窗停住顯示說明而不直接關閉
		process.stderr.write(problemReport(loaded.config.language, problems));
		return 1;
	}
	const tmuxPath = tmuxBin() ?? 'tmux';

	if (loaded.status === 'invalid') logError(loaded.error);
	const added = await addProjectFromCwd(process.cwd(), dir);
	if (added && !added.ok) logError(`auto-add ${process.cwd()}: ${messageText('en', added.error)}`);
	const config = added?.ok ? added.config : loaded.config;

	const {ui: uiConf, agents: agentsConf} = confPaths(dir);
	writeTextAtomic(uiConf, uiTmuxConf());
	writeTextAtomic(agentsConf, agentsTmuxConf(config.language));

	const buildStamp = currentBuildStamp();
	const ui = createTmux(UI_SOCKET, tmuxPath);
	const runningBuild = (await uiAlive(ui)) ? await ui.out(['show', '-v', '-t', `=${UI_SESSION}:`, '@ap-binary']) : null;
	if (opts.restartUi || runningBuild !== buildStamp) {
		// 只重建 UI server；背景 AI 工作階段放在另一座 socket 上不受影響
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
		await ui.run(['set', '-t', `=${UI_SESSION}:`, '@ap-binary', buildStamp]);
	}
	return execInteractive(ui.argv(['attach-session', '-t', `=${UI_SESSION}`]), {env: tmuxEnv()});
}
