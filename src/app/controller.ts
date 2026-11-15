import {configFile, loadConfig} from '../config/config.ts';
import {hudFrame, hudLines, topBarFormat, type HudInput} from '../hud/hud.ts';
import {mtimeMs} from '../infra/fsx.ts';
import {logError} from '../infra/log.ts';
import {onRefreshSignal} from '../infra/signal.ts';
import type {Tmux} from '../infra/tmux.ts';
import * as A from '../state/actions.ts';
import {selectedRow, sessionCount, windowTooSmall} from '../state/selectors.ts';
import type {Store} from '../state/store.ts';
import type {AppState} from '../state/types.ts';
import {detachUi, installRefreshHooks, paintHud, readLayout, readPanes, setTopBar, type UiPanes} from '../services/layout.ts';
import {addProject} from '../services/projects.ts';

export type Controller = {
	submitAddProject(): Promise<void>;
	quit(): Promise<void>;
	stop(): void;
};

type Context = {store: Store<AppState>; ui: Tmux; configDir: string; pid: number};

const LAYOUT_POLL_MS = 1000;
const CONFIG_POLL_MS = 2000;
const PANE_DISCOVERY_MS = 200;

function hudInput(state: AppState): HudInput {
	const row = selectedRow(state);
	const path = row?.kind === 'project' ? row.project.path : row?.kind === 'session' ? row.session.project : null;
	const project = state.projects.find(p => p.path === path) ?? null;
	return {tooSmall: windowTooSmall(state), project};
}

// Wraps a poller so a slow round is skipped instead of stacking up.
function exclusive(task: () => Promise<void>): () => Promise<void> {
	let running = false;
	return async () => {
		if (running) return;
		running = true;
		try {
			await task();
		} catch (error) {
			logError(`poll: ${String(error)}`);
		} finally {
			running = false;
		}
	};
}

export function startController({store, ui, configDir, pid}: Context): Controller {
	let panes: UiPanes | null = null;
	let hudWidth = 0;
	let lastFrame = '';
	let lastTopBar = '';
	let configMtime = mtimeMs(configFile(configDir));
	const timers: Array<ReturnType<typeof setInterval>> = [];

	const paintChrome = (force: boolean) => {
		if (!panes || hudWidth <= 0) return;
		const state = store.get();
		const frame = hudFrame(hudLines(hudInput(state), hudWidth));
		if (force || frame !== lastFrame) {
			if (paintHud(panes, frame)) lastFrame = frame;
			else logError('hud: could not write to the HUD tty');
		}
		const topBar = topBarFormat({sessions: sessionCount(state)});
		if (topBar !== lastTopBar) {
			lastTopBar = topBar;
			void setTopBar(ui, topBar).then(ok => {
				if (!ok) {
					lastTopBar = '';
					logError('top bar: set status-format failed');
				}
			});
		}
	};

	const refreshLayout = async (force: boolean) => {
		if (!panes) return;
		const snap = await readLayout(ui, panes);
		if (!snap) return;
		const resized = snap.hudWidth !== hudWidth;
		hudWidth = snap.hudWidth;
		store.set(s => A.setFocus(A.setWindow(s, snap.windowWidth, snap.windowHeight), snap.sidebarActive ? 'list' : 'ai', snap.zoomed));
		paintChrome(force || resized);
	};
	const pollLayout = exclusive(() => refreshLayout(false));
	// A tmux hook fired: sizes or focus changed, so repaint even if the text is identical.
	const forcedLayout = exclusive(() => refreshLayout(true));

	const pollConfig = exclusive(async () => {
		const mtime = mtimeMs(configFile(configDir));
		if (mtime === configMtime) return;
		configMtime = mtime;
		const loaded = loadConfig(configDir);
		store.set(s => {
			const next = A.setNotice(s, loaded.status === 'invalid' ? 'config.json is invalid' : null);
			return loaded.status === 'invalid' ? next : A.setConfig(next, loaded.config);
		});
		if (loaded.status === 'invalid') logError(loaded.error);
	});

	const unsubscribe = store.subscribe(() => paintChrome(false));
	const offSignal = onRefreshSignal(() => void forcedLayout());

	// The launcher creates the HUD and AI panes right after this process starts.
	const discover = setInterval(() => {
		void (async () => {
			if (panes) return;
			const found = await readPanes(ui);
			if (!found || panes) return;
			panes = found;
			clearInterval(discover);
			await installRefreshHooks(ui, found, store.get().config.sidebarWidth, pid);
			await refreshLayout(true);
		})().catch(error => logError(`discover: ${String(error)}`));
	}, PANE_DISCOVERY_MS);
	timers.push(discover);
	timers.push(setInterval(() => void pollLayout(), LAYOUT_POLL_MS));
	timers.push(setInterval(() => void pollConfig(), CONFIG_POLL_MS));

	return {
		async submitAddProject() {
			const dialog = store.get().dialog;
			if (!dialog || dialog.busy) return;
			store.set(s => A.setDialogBusy(s, true));
			const result = await addProject(dialog.value, configDir);
			if (!result.ok) {
				store.set(s => A.setDialogError(s, result.error));
				return;
			}
			configMtime = mtimeMs(configFile(configDir));
			store.set(s => A.closeDialog(A.selectProject(A.setNotice(A.setConfig(s, result.config), null), result.path)));
		},
		async quit() {
			await detachUi(ui);
		},
		stop() {
			for (const timer of timers) clearInterval(timer);
			unsubscribe();
			offSignal();
		},
	};
}
