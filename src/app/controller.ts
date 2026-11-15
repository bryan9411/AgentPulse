import {aiAttachCommand} from '../bootstrap/aiPane.ts';
import {confPaths} from '../bootstrap/tmuxConf.ts';
import {configFile, loadConfig} from '../config/config.ts';
import {hudFrame, hudLines, topBarFormat, type HudInput} from '../hud/hud.ts';
import {mtimeMs} from '../infra/fsx.ts';
import {logError} from '../infra/log.ts';
import {onRefreshSignal} from '../infra/signal.ts';
import type {Tmux} from '../infra/tmux.ts';
import * as A from '../state/actions.ts';
import {selectedRow, selectedSession, sessionCount, windowTooSmall} from '../state/selectors.ts';
import type {Store} from '../state/store.ts';
import type {AppState, SessionSummary} from '../state/types.ts';
import {
	clearLabel,
	detachUi,
	focusAi,
	installRefreshHooks,
	paintHud,
	readAiPane,
	readLayout,
	readPanes,
	setTopBar,
	showSession,
	zoomAi,
	type UiPanes,
} from '../services/layout.ts';
import {addProject} from '../services/projects.ts';
import {agentChoices, closeSession, createSession, listSessions, reloadSessionConf} from '../services/sessions.ts';

export type Controller = {
	submitDialog(): Promise<void>;
	openNewSession(): void;
	focusAi(): Promise<void>;
	zoomAi(): Promise<void>;
	quit(): Promise<void>;
	stop(): void;
};

type Context = {store: Store<AppState>; ui: Tmux; agents: Tmux; configDir: string; pid: number};

const LAYOUT_POLL_MS = 1000;
const CONFIG_POLL_MS = 2000;
const SESSION_POLL_MS = 1000;
const PANE_DISCOVERY_MS = 200;

function hudInput(state: AppState): HudInput {
	const row = selectedRow(state);
	const path = row?.kind === 'project' ? row.project.path : row?.kind === 'session' ? row.session.project : null;
	const project = state.projects.find(p => p.path === path) ?? null;
	return {tooSmall: windowTooSmall(state), project, session: selectedSession(state)};
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

export function startController({store, ui, agents, configDir, pid}: Context): Controller {
	const agentsConf = confPaths(configDir).agents;
	let panes: UiPanes | null = null;
	// The session the embedded client was last switched to by us.
	let shown: string | null = null;
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

	const refreshSessions = async () => {
		const found = await listSessions(agents);
		if (!found) {
			logError('sessions: listing failed; keeping the previous list');
			return;
		}
		const sessions: SessionSummary[] = found.map(({id, project, cwd, branch, agent, dead, exitStatus}) => ({
			id, project, cwd, branch, agent, dead, exitStatus,
		}));
		const hadSessions = store.get().sessions.length > 0;
		store.set(s => A.setSessions(s, sessions));
		// The embedded client exits with the last session; drop its label too.
		if (sessions.length === 0 && hadSessions) {
			shown = null;
			if (panes) await clearLabel(ui, panes);
		}
	};
	const pollSessions = exclusive(() => syncAi(true).then(refreshSessions));

	// Latest selection wins: a burst of j presses ends on the last row
	// without queueing a switch for every row passed on the way.
	let syncing: Promise<void> | null = null;
	let again = false;
	const syncAi = async (verify = false): Promise<void> => {
		if (syncing) {
			again = true;
			return syncing;
		}
		syncing = (async () => {
			do {
				again = false;
				const session = selectedSession(store.get());
				if (!panes || !session || (!verify && session.id === shown)) continue;
				const ok = await showSession(ui, agents, panes, {
					id: session.id,
					label: session.agent,
					attachCommand: aiAttachCommand(agents, session.id),
				});
				shown = ok ? session.id : null;
				if (!ok) logError(`show: could not display ${session.id}`);
			} while (again);
		})().finally(() => {
			syncing = null;
		});
		return syncing;
	};

	let lastSelected = store.get().selected;
	const unsubscribe = store.subscribe(() => {
		paintChrome(false);
		const selected = store.get().selected;
		if (selected !== lastSelected) {
			lastSelected = selected;
			void syncAi();
		}
	});
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
	timers.push(setInterval(() => void pollSessions(), SESSION_POLL_MS));
	void reloadSessionConf(agents, agentsConf).then(() => pollSessions());

	const submitAddProject = async (value: string) => {
		const result = await addProject(value, configDir);
		if (!result.ok) {
			store.set(s => A.setDialogError(s, result.error));
			return;
		}
		configMtime = mtimeMs(configFile(configDir));
		store.set(s => A.closeDialog(A.selectProject(A.setNotice(A.setConfig(s, result.config), null), result.path)));
	};

	const giveFocus = async (zoom: boolean) => {
		const session = selectedSession(store.get());
		if (!panes || !session) return;
		await syncAi();
		if (shown !== session.id) {
			store.set(s => A.setNotice(s, 'Could not show this session'));
			return;
		}
		store.set(s => A.setNotice(s, null));
		const ok = zoom ? await zoomAi(ui, panes) : await focusAi(ui, panes);
		if (!ok) logError(`focus: select-pane failed (zoom=${zoom})`);
	};

	const submitNewSession = async (project: string, agent: string) => {
		if (!panes) return;
		const size = await readAiPane(ui, panes);
		const result = await createSession(agents, {
			agent,
			project,
			cwd: project,
			confPath: agentsConf,
			width: size?.width ?? 120,
			height: size?.height ?? 36,
		});
		if (!result.ok) {
			logError(`new session: ${result.error}`);
			store.set(s => A.setDialogError(s, result.error));
			return;
		}
		await refreshSessions();
		store.set(s => A.closeDialog(A.selectSession(s, result.id)));
		// A new AI is opened to be talked to.
		await giveFocus(false);
	};

	const submitCloseSession = async (id: string) => {
		if (!(await closeSession(agents, id))) {
			store.set(s => A.setDialogError(s, 'Could not close the session'));
			return;
		}
		if (shown === id) shown = null;
		await refreshSessions();
		store.set(A.closeDialog);
		await syncAi(true);
	};

	return {
		async submitDialog() {
			const dialog = store.get().dialog;
			if (!dialog || dialog.busy) return;
			if (dialog.kind === 'new-session') {
				const option = dialog.options[dialog.index];
				if (!option) return;
				if (!option.installed) {
					store.set(s => A.setDialogError(s, `${option.id} is not installed`));
					return;
				}
			}
			store.set(s => A.setDialogBusy(s, true));
			try {
				if (dialog.kind === 'add-project') await submitAddProject(dialog.value);
				else if (dialog.kind === 'new-session') await submitNewSession(dialog.project, dialog.options[dialog.index]?.id ?? '');
				else await submitCloseSession(dialog.session.id);
			} catch (error) {
				logError(`dialog ${dialog.kind}: ${String(error)}`);
				store.set(s => A.setDialogError(s, 'Something went wrong; see agentpulse.log'));
			}
		},
		openNewSession() {
			store.set(s => A.openNewSession(s, agentChoices()));
		},
		focusAi: () => giveFocus(false),
		zoomAi: () => giveFocus(true),
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
