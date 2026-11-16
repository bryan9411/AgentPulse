import React from 'react';
import {join} from 'node:path';
import {render} from 'ink';
import {configDir, loadConfig} from '../config/config.ts';
import {msg} from '../i18n/strings.ts';
import {configureLog, logError} from '../infra/log.ts';
import {AGENT_SOCKET, createTmux, UI_SOCKET} from '../infra/tmux.ts';
import * as A from '../state/actions.ts';
import {createStore} from '../state/store.ts';
import {App} from './App.tsx';
import {startController} from './controller.ts';

export function runSidebar(): void {
	const dir = configDir();
	configureLog(join(dir, 'agentpulse.log'));
	const loaded = loadConfig(dir);
	let state = A.initialState(loaded.config);
	if (loaded.status === 'invalid') {
		logError(loaded.error);
		state = A.setNotice(state, msg('configInvalid'));
	}
	const store = createStore(state);
	const controller = startController({
		store,
		ui: createTmux(UI_SOCKET),
		agents: createTmux(AGENT_SOCKET),
		configDir: dir,
		pid: process.pid,
	});
	// 不開啟 incrementalRendering，否則窗格縮放後會留下殘影
	render(<App store={store} controller={controller} />, {exitOnCtrlC: false, alternateScreen: true});
}
