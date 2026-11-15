import {getAgent} from '../agents/index.ts';
import {aiAttachCommand} from '../bootstrap/aiPane.ts';
import {confPaths} from '../bootstrap/tmuxConf.ts';
import {configFile, loadConfig} from '../config/config.ts';
import {hudFrame, hudLines, topBarFormat, type HudInput} from '../hud/hud.ts';
import {mtimeMs} from '../infra/fsx.ts';
import {logError} from '../infra/log.ts';
import {platform} from '../infra/platform/index.ts';
import {continueProcessGroup, onRefreshSignal} from '../infra/signal.ts';
import type {Tmux} from '../infra/tmux.ts';
import * as A from '../state/actions.ts';
import {isViewing, selectedRow, selectedSession, sessionCount, statusCounts, windowTooSmall} from '../state/selectors.ts';
import type {Store} from '../state/store.ts';
import type {AppState, SessionSummary} from '../state/types.ts';
import {GLYPHS} from '../ui/theme.ts';
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
import {createScheduler, exclusive} from '../services/scheduler.ts';
import {agentChoices, captureScreen, closeSession, createSession, listSessions, reloadSessionConf} from '../services/sessions.ts';
import {enteredAlert, isStalled, nextStatus, type SessionStatus} from '../services/status/machine.ts';
import {notificationText, resumeAllowed, shouldNotify, type NotifyLog} from '../services/status/notify.ts';

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
const STATUS_POLL_MS = 1000;
const BLINK_MS = 500;
const PANE_DISCOVERY_MS = 200;

function hudInput(state: AppState): HudInput {
	const row = selectedRow(state);
	const path = row?.kind === 'project' ? row.project.path : row?.kind === 'session' ? row.session.project : null;
	const project = state.projects.find(p => p.path === path) ?? null;
	const session = selectedSession(state);
	const status = session ? state.statuses[session.id] : undefined;
	return {
		tooSmall: windowTooSmall(state),
		glyphs: GLYPHS[state.config.glyphs],
		project,
		session: session && {
			...session,
			state: status?.state ?? null,
			stalled: status ? isStalled(status, Date.now()) : false,
		},
	};
}

const reportError = (name: string, error: unknown) => logError(`${name}: ${String(error)}`);

export function startController({store, ui, agents, configDir, pid}: Context): Controller {
	const agentsConf = confPaths(configDir).agents;
	let panes: UiPanes | null = null;
	// The session the embedded client was last switched to by us.
	let shown: string | null = null;
	let hudWidth = 0;
	let lastFrame = '';
	let lastTopBar = '';
	let configMtime = mtimeMs(configFile(configDir));
	const scheduler = createScheduler(reportError);
	const timers: Array<ReturnType<typeof setInterval>> = [];
	// The pane process of each live session, for SIGCONT.
	const pids = new Map<string, number>();
	const resumeSent = new Map<string, number>();
	const notified: NotifyLog = new Map();

	const paintChrome = (force: boolean) => {
		if (!panes || hudWidth <= 0) return;
		const state = store.get();
		const frame = hudFrame(hudLines(hudInput(state), hudWidth));
		if (force || frame !== lastFrame) {
			if (paintHud(panes, frame)) lastFrame = frame;
			else logError('hud: could not write to the HUD tty');
		}
		const topBar = topBarFormat({sessions: sessionCount(state), counts: statusCounts(state), glyphs: GLYPHS[state.config.glyphs]});
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
	// A tmux hook fired: sizes or focus changed, so repaint even if the text is identical.
	const forcedLayout = exclusive('layout', () => refreshLayout(true), reportError);

	const pollConfig = async () => {
		const mtime = mtimeMs(configFile(configDir));
		if (mtime === configMtime) return;
		configMtime = mtime;
		const loaded = loadConfig(configDir);
		store.set(s => {
			const next = A.setNotice(s, loaded.status === 'invalid' ? 'config.json is invalid' : null);
			return loaded.status === 'invalid' ? next : A.setConfig(next, loaded.config);
		});
		if (loaded.status === 'invalid') logError(loaded.error);
	};

	const refreshSessions = async () => {
		const found = await listSessions(agents);
		if (!found) {
			logError('sessions: listing failed; keeping the previous list');
			return;
		}
		const sessions: SessionSummary[] = found.map(({id, project, cwd, branch, agent, dead, exitStatus}) => ({
			id, project, cwd, branch, agent, dead, exitStatus,
		}));
		pids.clear();
		for (const record of found) if (!record.dead && record.pid) pids.set(record.id, record.pid);
		const hadSessions = store.get().sessions.length > 0;
		store.set(s => A.setSessions(s, sessions));
		// The embedded client exits with the last session; drop its label too.
		if (sessions.length === 0 && hadSessions) {
			shown = null;
			if (panes) await clearLabel(ui, panes);
		}
	};

	// SPEC 5.3: capture every live session, classify it, wake it if it
	// stopped itself on ctrl+z, then notify on entering approval or error.
	const observe = async (session: SessionSummary, now: number, seen: boolean, prev: SessionStatus | null) => {
		if (session.dead) {
			return nextStatus(prev, {dead: true, exitStatus: session.exitStatus, screenState: null, screen: null, now, seen});
		}
		const screen = await captureScreen(agents, session.id);
		if (screen === null) return prev;
		const adapter = getAgent(session.agent);
		// Dead panes never get here: an exited Claude Code still shows its old
		// suspend notice (M0).
		if (adapter?.isSuspended(screen)) {
			const pid = pids.get(session.id);
			if (pid && resumeAllowed(resumeSent, session.id, now)) {
				const how = continueProcessGroup(pid);
				if (how === 'failed') logError(`resume: SIGCONT to ${session.id} (pid ${pid}) failed`);
			}
		}
		return nextStatus(prev, {
			dead: false,
			exitStatus: null,
			screenState: adapter?.classify(screen) ?? null,
			screen: String(Bun.hash(screen)),
			now,
			seen,
		});
	};

	const refreshStatuses = async () => {
		const before = store.get();
		const now = Date.now();
		const results = await Promise.all(
			before.sessions.map(async session => {
				const prev = before.statuses[session.id] ?? null;
				const next = await observe(session, now, isViewing(before, session.id), prev);
				return {session, prev, next};
			}),
		);
		const statuses: Record<string, SessionStatus> = {};
		const entered: SessionSummary[] = [];
		for (const {session, prev, next} of results) {
			if (!next) continue;
			statuses[session.id] = next;
			if (enteredAlert(prev, next)) entered.push(session);
		}
		store.set(s => A.applyStatuses(s, statuses, entered.map(e => e.id)));
		const state = store.get();
		for (const session of entered) {
			const status = statuses[session.id]!;
			const ok = shouldNotify(notified, {
				id: session.id,
				state: status.state,
				now,
				viewing: isViewing(state, session.id),
				enabled: state.config.notifications,
			});
			if (!ok) continue;
			const project = state.projects.find(p => p.path === session.project)?.name ?? session.project;
			const {title, body} = notificationText(session, project, status.state);
			void platform.notify(title, body).then(sent => {
				if (!sent) logError(`notify: osascript failed for ${session.id}`);
			});
		}
	};

	// Toggles only while something blinks, so an idle list is not redrawn.
	const blink = () => {
		const state = store.get();
		store.set(s => A.setBlink(s, state.attention.length > 0 ? !state.blinkOn : true));
	};

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
	scheduler.every(LAYOUT_POLL_MS, 'layout', () => refreshLayout(false));
	scheduler.every(CONFIG_POLL_MS, 'config', pollConfig);
	const pollSessions = scheduler.every(SESSION_POLL_MS, 'sessions', () => syncAi(true).then(refreshSessions));
	scheduler.every(STATUS_POLL_MS, 'status', refreshStatuses);
	timers.push(setInterval(blink, BLINK_MS));
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
			scheduler.stop();
			unsubscribe();
			offSignal();
		},
	};
}
