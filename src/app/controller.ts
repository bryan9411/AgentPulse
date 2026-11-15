import {join} from 'node:path';
import {getAgent} from '../agents/index.ts';
import {aiAttachCommand, aiPlaceholderCommand} from '../bootstrap/aiPane.ts';
import {agentsTmuxConf, confPaths} from '../bootstrap/tmuxConf.ts';
import {configFile, loadConfig, saveConfig} from '../config/config.ts';
import {hudFrame, hudLines, topBarFormat, type HudInput} from '../hud/hud.ts';
import {messageText, msg, nextLang, strings, type Lang, type Message} from '../i18n/strings.ts';
import {hostFs, mtimeMs, writeTextAtomic} from '../infra/fsx.ts';
import {currentBranch, gitStats, statusEntries} from '../infra/git.ts';
import {logError} from '../infra/log.ts';
import {platform} from '../infra/platform/index.ts';
import {continueProcessGroup, onRefreshSignal} from '../infra/signal.ts';
import type {Tmux} from '../infra/tmux.ts';
import * as A from '../state/actions.ts';
import {
	agentLabel,
	isViewing,
	mergeSettled,
	selectedProjectPath,
	selectedRow,
	selectedSession,
	sessionCount,
	sessionState,
	statusCounts,
	windowTooSmall,
} from '../state/selectors.ts';
import type {Store} from '../state/store.ts';
import type {AppState, MergeDialog, SessionSummary, WorktreeDialog} from '../state/types.ts';
import {helpLines} from '../ui/helpLines.ts';
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
	redrawPlaceholder,
	setTopBar,
	showPopup,
	showSession,
	zoomAi,
	type UiPanes,
} from '../services/layout.ts';
import {readAccounts} from '../services/accounts.ts';
import {scanProject, type Conflict} from '../services/conflictRadar.ts';
import {diffCommand, pageFileCommand} from '../services/diff.ts';
import {contextView, contextWindow} from '../services/context/usage.ts';
import {gitDue, readFacts} from '../services/details.ts';
import {sessionPorts} from '../services/ports.ts';
import {addProject} from '../services/projects.ts';
import {createScheduler, exclusive} from '../services/scheduler.ts';
import {
	agentChoices,
	captureScreen,
	closeSession,
	createSession,
	listSessions,
	reloadSessionConf,
	sessionExists,
	type CreateResult,
} from '../services/sessions.ts';
import {createWorktree, planMerge, runMerge, type MergeCheck, type MergeTarget} from '../services/worktree.ts';
import {enteredAlert, isStalled, nextStatus, type SessionStatus} from '../services/status/machine.ts';
import {notificationText, resumeAllowed, shouldNotify, type NotifyLog} from '../services/status/notify.ts';

export type Controller = {
	submitDialog(): Promise<void>;
	openNewSession(): void;
	openWorktree(): void;
	openMerge(): void;
	showDiff(): Promise<void>;
	showHelp(): Promise<void>;
	openWeb(): Promise<void>;
	focusAi(): Promise<void>;
	zoomAi(): Promise<void>;
	quit(): Promise<void>;
	toggleLanguage(): void;
	stop(): void;
};

type Context = {store: Store<AppState>; ui: Tmux; agents: Tmux; configDir: string; pid: number};

const LAYOUT_POLL_MS = 1000;
const CONFIG_POLL_MS = 2000;
const SESSION_POLL_MS = 1000;
const STATUS_POLL_MS = 1000;
const BLINK_MS = 500;
const PANE_DISCOVERY_MS = 200;
// SPEC 6.6.
const INFO_POLL_MS = 2000;
const CLOCK_MS = 1000;
const GIT_POLL_MS = 5000;
const PORTS_POLL_MS = 5000;
const FACTS_POLL_MS = 60_000;
const ACCOUNTS_POLL_MS = 60_000;
const RADAR_POLL_MS = 15_000;

function hudInput(state: AppState): HudInput {
	const row = selectedRow(state);
	const path = row?.kind === 'project' ? row.project.path : row?.kind === 'session' ? row.session.project : null;
	const project = state.projects.find(p => p.path === path) ?? null;
	const session = selectedSession(state);
	const status = session ? state.statuses[session.id] : undefined;
	const d = session ? state.details[session.id] : undefined;
	const now = Date.now();
	const usage = d?.info?.context ?? null;
	const builtIn = (session && getAgent(session.agent)?.contextWindows) ?? {};
	const window = contextWindow(d?.info?.model ?? null, builtIn, state.config.contextWindows);
	return {
		tooSmall: windowTooSmall(state),
		glyphs: GLYPHS[state.config.glyphs],
		lang: state.config.language,
		now,
		contextWarnAt: state.config.contextWarnAt,
		project,
		session: session && {
			...session,
			agent: agentLabel(state, session),
			state: status?.state ?? null,
			stalled: status ? isStalled(status, now) : false,
			details: d && {
				model: d.info?.model ?? null,
				effort: d.info?.effort ?? null,
				mcp: d.facts ? d.facts.mcp : null,
				skills: d.facts?.skills ?? null,
				rules: d.facts?.rules ?? null,
				git: d.git ?? null,
				ports: d.ports ?? [],
				createdAt: session.created > 0 ? session.created * 1000 : null,
				changedAt: status?.changedAt ?? null,
				context: usage && contextView(usage, window),
			},
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
	// While a popup is up, HUD writes show through it (M6), so they wait.
	let popupOpen = false;
	let configMtime = mtimeMs(configFile(configDir));
	const scheduler = createScheduler(reportError);
	const timers: Array<ReturnType<typeof setInterval>> = [];
	// The pane process of each live session, for SIGCONT.
	const pids = new Map<string, number>();
	const resumeSent = new Map<string, number>();
	const notified: NotifyLog = new Map();
	// Latest capture per session, for localhost:<port> mentions (SPEC 5.5).
	const screens = new Map<string, string>();
	const fs = hostFs();

	const paintChrome = (force: boolean) => {
		if (!panes || hudWidth <= 0) return;
		const state = store.get();
		const frame = hudFrame(hudLines(hudInput(state), hudWidth));
		if (!popupOpen && (force || frame !== lastFrame)) {
			if (paintHud(panes, frame)) lastFrame = frame;
			else logError('hud: could not write to the HUD tty');
		}
		const topBar = topBarFormat({
			sessions: sessionCount(state),
			counts: statusCounts(state),
			glyphs: GLYPHS[state.config.glyphs],
			accounts: state.accounts,
			lang: state.config.language,
		});
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

	const refreshPlaceholder = async () => {
		if (!panes || shown !== null) return;
		await redrawPlaceholder(ui, agents, panes, aiPlaceholderCommand(store.get().config.language));
	};

	// The exit line lives in the AI server's config, outside Ink (SPEC 3.3).
	const applyLanguage = async (lang: Lang) => {
		writeTextAtomic(agentsConf, agentsTmuxConf(lang));
		await reloadSessionConf(agents, agentsConf);
		await refreshPlaceholder();
	};

	const pollConfig = async () => {
		const mtime = mtimeMs(configFile(configDir));
		if (mtime === configMtime) return;
		configMtime = mtime;
		const loaded = loadConfig(configDir);
		const before = store.get().config.language;
		store.set(s => {
			const next = A.setNotice(s, loaded.status === 'invalid' ? msg('configInvalid') : null);
			return loaded.status === 'invalid' ? next : A.setConfig(next, loaded.config);
		});
		if (loaded.status === 'invalid') logError(loaded.error);
		else if (loaded.config.language !== before) await applyLanguage(loaded.config.language);
	};

	const refreshSessions = async () => {
		const found = await listSessions(agents);
		if (!found) {
			logError('sessions: listing failed; keeping the previous list');
			return;
		}
		const sessions: SessionSummary[] = found.map(({id, project, cwd, branch, agent, dead, exitStatus, created, agentSession, worktree, base}) => ({
			id, project, cwd, branch, agent, dead, exitStatus, created, agentSession, worktree, base,
		}));
		pids.clear();
		for (const record of found) if (!record.dead && record.pid) pids.set(record.id, record.pid);
		const before = store.get().sessions;
		const hadSessions = before.length > 0;
		store.set(s => A.setSessions(s, sessions));
		void pollNewFacts();
		// A folder joined or left: the conflict note should not lag 15 s behind.
		if (store.get().sessions !== before) void pollRadar();
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
		screens.set(session.id, screen);
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
			const {title, body} = notificationText(session, project, status.state, state.config.language);
			void platform.notify(title, body).then(sent => {
				if (!sent) logError(`notify: osascript failed for ${session.id}`);
			});
		}
	};

	// ---- HUD data (SPEC 5.5, 6.6). Each keeps the last result on failure. ----

	const refreshInfo = async () => {
		const session = selectedSession(store.get());
		const adapter = session && getAgent(session.agent);
		if (!session || !adapter) return;
		const info = adapter.sessionInfo(fs, {
			cwd: session.cwd,
			sessionId: session.agentSession || null,
			pid: pids.get(session.id) ?? null,
		});
		store.set(s => A.setDetails(s, session.id, {info}));
	};

	const refreshFacts = async (onlyMissing: boolean) => {
		const state = store.get();
		for (const session of state.sessions) {
			if (onlyMissing && state.details[session.id]?.facts) continue;
			const adapter = getAgent(session.agent);
			if (!adapter) continue;
			const facts = readFacts(adapter, fs, session.cwd);
			store.set(s => A.setDetails(s, session.id, {facts}));
		}
	};

	const refreshGit = async () => {
		const state = store.get();
		const selected = selectedSession(state)?.id;
		const now = Date.now();
		const due = state.sessions.filter(s => gitDue(state.details[s.id], s.id === selected, now));
		await Promise.all(
			due.map(async session => {
				const git = await gitStats(session.cwd);
				store.set(s => A.setDetails(s, session.id, {git, gitAt: now}));
			}),
		);
	};

	const refreshPorts = async () => {
		const session = selectedSession(store.get());
		if (!session) return;
		if (session.dead) {
			store.set(s => A.setDetails(s, session.id, {ports: []}));
			return;
		}
		const [listening, tree] = await Promise.all([platform.listeningPorts(), platform.processTree()]);
		if (!listening || !tree) {
			logError('ports: lsof or ps failed; keeping the previous ports');
			return;
		}
		const cwds = await platform.processCwds([...new Set(listening.map(l => l.pid))]);
		const ports = sessionPorts({
			root: pids.get(session.id) ?? 0,
			agents: new Set(pids.values()),
			folder: session.cwd,
			tree,
			listening,
			cwds,
			screen: screens.get(session.id) ?? null,
		});
		store.set(s => A.setDetails(s, session.id, {ports}));
	};

	const refreshAccounts = async () => {
		const accounts = readAccounts(fs);
		store.set(s => A.setAccounts(s, accounts));
	};

	// SPEC 5.10: only projects whose sessions work in two or more folders.
	const refreshConflicts = async () => {
		const folders = new Map<string, Map<string, string>>();
		for (const session of store.get().sessions) {
			const byCwd = folders.get(session.project) ?? new Map<string, string>();
			if (!byCwd.has(session.cwd)) byCwd.set(session.cwd, session.branch);
			folders.set(session.project, byCwd);
		}
		const scanned = await Promise.all(
			[...folders]
				.filter(([, byCwd]) => byCwd.size >= 2)
				.map(async ([project, byCwd]) => {
					const found = await scanProject(project, [...byCwd].map(([cwd, branch]) => ({cwd, branch})));
					return [project, found] as const;
				}),
		);
		const conflicts: Record<string, Conflict[]> = {};
		for (const [project, found] of scanned) if (found.length > 0) conflicts[project] = found;
		store.set(s => A.setConflicts(s, conflicts));
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
					attachCommand: aiAttachCommand(agents, session.id, store.get().config.language),
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
			// The HUD should not wait a full interval after moving the cursor.
			void pollInfo();
			void pollGit();
			void pollPorts();
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
	const pollInfo = scheduler.every(INFO_POLL_MS, 'info', refreshInfo);
	const pollGit = scheduler.every(GIT_POLL_MS, 'git', refreshGit);
	const pollPorts = scheduler.every(PORTS_POLL_MS, 'ports', refreshPorts);
	// A new session gets its facts on the next sessions poll, not a minute later.
	const pollNewFacts = exclusive('facts-new', () => refreshFacts(true), reportError);
	scheduler.every(FACTS_POLL_MS, 'facts', () => refreshFacts(false));
	const pollAccounts = scheduler.every(ACCOUNTS_POLL_MS, 'accounts', refreshAccounts);
	void pollAccounts();
	const pollRadar = scheduler.every(RADAR_POLL_MS, 'radar', refreshConflicts);
	timers.push(setInterval(blink, BLINK_MS));
	// "up 42m" and "output 3s ago" age without any state change.
	timers.push(setInterval(() => paintChrome(false), CLOCK_MS));
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
			store.set(s => A.setNotice(s, msg('cannotShow')));
			return;
		}
		store.set(s => A.setNotice(s, null));
		const ok = zoom ? await zoomAi(ui, panes) : await focusAi(ui, panes);
		if (!ok) logError(`focus: select-pane failed (zoom=${zoom})`);
	};

	// Sized to the AI pane so the first frame is not drawn for another size.
	const startSession = async (opts: {agent: string; project: string; cwd: string; base?: string}): Promise<CreateResult> => {
		const size = panes && (await readAiPane(ui, panes));
		return createSession(agents, {
			...opts,
			worktree: opts.base !== undefined,
			confPath: agentsConf,
			width: size?.width ?? 120,
			height: size?.height ?? 36,
		});
	};

	// A new AI is opened to be talked to.
	const enterSession = async (id: string) => {
		await refreshSessions();
		store.set(s => A.closeDialog(A.selectSession(s, id)));
		await giveFocus(false);
	};

	const submitNewSession = async (project: string, agent: string) => {
		const result = await startSession({agent, project, cwd: project});
		if (!result.ok) {
			logError(`new session: ${messageText('en', result.error)}`);
			store.set(s => A.setDialogError(s, result.error));
			return;
		}
		await enterSession(result.id);
	};

	// True once the session is gone, whoever closed it.
	const closeAndForget = async (id: string): Promise<boolean> => {
		if (!(await closeSession(agents, id)) && (await sessionExists(agents, id))) return false;
		if (shown === id) shown = null;
		return true;
	};

	const afterClose = async () => {
		await syncAi(true);
		// The fallback placeholder carries the language of when it was attached.
		if (shown === null) await refreshPlaceholder();
	};

	const submitCloseSession = async (id: string) => {
		if (!(await closeAndForget(id))) {
			store.set(s => A.setDialogError(s, msg('cannotClose')));
			return;
		}
		await refreshSessions();
		store.set(A.closeDialog);
		await afterClose();
	};

	// ---- Worktrees, merge, diff, open (SPEC 5.9–5.11) ----

	const flash = (message: Message) => store.set(s => A.setFlash(s, message));

	const submitWorktree = async (dialog: WorktreeDialog, agent: string) => {
		const made = await createWorktree(dialog.project, dialog.value);
		if (!made.ok) {
			store.set(s => A.setDialogError(s, made.error));
			return;
		}
		const result = await startSession({agent, project: dialog.project, cwd: made.path, base: made.base});
		if (!result.ok) {
			// Not rolled back: removing a worktree and its branch is the user's call.
			logError(`worktree ${made.path}: ${messageText('en', result.error)}`);
			store.set(s => A.setDialogError(s, msg('worktreeNoAi')));
			return;
		}
		await enterSession(result.id);
	};

	const mergeTarget = (session: SessionSummary): MergeTarget => ({
		project: session.project,
		cwd: session.cwd,
		base: session.base,
		worktree: session.worktree,
		running: sessionState(store.get(), session) === 'running',
	});

	const submitMerge = async (dialog: MergeDialog) => {
		const id = dialog.session.id;
		// The session as it is now: the AI may have started working since m.
		const target = mergeTarget(store.get().sessions.find(s => s.id === id) ?? dialog.session);
		const outcome = await runMerge(target, dialog.value, {closeSession: () => closeAndForget(id)});
		if (outcome.kind === 'blocked') {
			// What the dialog shows is out of date; lay the steps out again.
			const check = await planMerge(target);
			store.set(s => A.setMergeCheck(s, id, check));
			if (check.ok) store.set(s => A.setDialogError(s, outcome.error));
			return;
		}
		logError(`merge ${target.cwd}: ${JSON.stringify(outcome)}`);
		await refreshSessions();
		if (outcome.kind === 'merged') store.set(s => A.setFlash(A.closeDialog(s), msg('merged', outcome.branch, outcome.base)));
		else store.set(s => A.setMergeOutcome(s, id, outcome));
		await afterClose();
		void pollGit();
	};

	const openPort = async (port: number): Promise<boolean> => {
		const ok = await platform.openUrl(`http://localhost:${port}`);
		if (!ok) logError(`open: could not open http://localhost:${port}`);
		return ok;
	};

	// One popup at a time: tmux holds this call until the user closes it.
	const showDiff = exclusive(
		'diff',
		async () => {
			const session = selectedSession(store.get());
			if (!session) return;
			const changes = await statusEntries(session.cwd);
			if (!changes || changes.length === 0) {
				flash(msg(changes ? 'noChanges' : 'diffFailed'));
				return;
			}
			const labels = strings(store.get().config.language).diff;
			popupOpen = true;
			try {
				if (!(await showPopup(ui, diffCommand(session.cwd, labels)))) logError(`diff: the popup for ${session.id} did not end cleanly`);
			} finally {
				popupOpen = false;
				paintChrome(true);
			}
		},
		reportError,
	);

	const showHelp = exclusive(
		'help',
		async () => {
			const state = store.get();
			const lang = state.config.language;
			const file = join(configDir, 'help.txt');
			const lines = helpLines({
				lang,
				glyphs: GLYPHS[state.config.glyphs],
				backKey: state.config.keys.back,
				configPath: configFile(configDir),
				logPath: join(configDir, 'agentpulse.log'),
				color: true,
			});
			writeTextAtomic(file, `${lines.join('\n')}\n`);
			popupOpen = true;
			try {
				if (!(await showPopup(ui, pageFileCommand(file, strings(lang).help.prompt)))) logError('help: the popup did not end cleanly');
			} finally {
				popupOpen = false;
				paintChrome(true);
			}
		},
		reportError,
	);

	return {
		async submitDialog() {
			const dialog = store.get().dialog;
			if (!dialog || dialog.busy) return;
			if (dialog.kind === 'merge') {
				// Refused, or done: there is only something to read.
				if (mergeSettled(dialog)) store.set(A.closeDialog);
				if (mergeSettled(dialog) || !dialog.plan) return;
				if (dialog.plan.dirty > 0 && !dialog.value.trim()) {
					store.set(s => A.setDialogError(s, msg('needMessage')));
					return;
				}
			}
			let agent = '';
			if (dialog.kind === 'new-session' || dialog.kind === 'worktree') {
				const option = dialog.options[dialog.index];
				if (!option) return;
				if (!option.installed) {
					store.set(s => A.setDialogError(s, msg('notInstalled', option.id)));
					return;
				}
				agent = option.id;
			}
			store.set(s => A.setDialogBusy(s, true));
			const working = store.get().dialog;
			try {
				if (dialog.kind === 'add-project') await submitAddProject(dialog.value);
				else if (dialog.kind === 'new-session') await submitNewSession(dialog.project, agent);
				else if (dialog.kind === 'worktree') await submitWorktree(dialog, agent);
				else if (dialog.kind === 'merge') await submitMerge(dialog);
				else if (dialog.kind === 'open-url') {
					const port = dialog.ports[dialog.index];
					if (port !== undefined && (await openPort(port))) store.set(A.closeDialog);
					else store.set(s => A.setDialogError(s, msg('openFailed')));
				} else await submitCloseSession(dialog.session.id);
			} catch (error) {
				logError(`dialog ${dialog.kind}: ${String(error)}`);
				store.set(s => A.setDialogError(s, msg('failed')));
			} finally {
				// Keys are ignored while busy, so it must never be left set.
				store.set(s => (s.dialog === working ? A.setDialogBusy(s, false) : s));
			}
		},
		openNewSession() {
			store.set(s => A.openNewSession(s, agentChoices()));
		},
		openWorktree() {
			const project = selectedProjectPath(store.get());
			if (!project) return;
			// Opened at once so the next keys are typed into it; the branch it
			// will be cut from is filled in when git answers.
			store.set(s => A.openWorktree(s, agentChoices()));
			void currentBranch(project).then(base => {
				if (base) store.set(s => A.setWorktreeBase(s, project, base));
				else store.set(s => (s.dialog?.kind === 'worktree' && s.dialog.project === project ? A.setDialogError(s, msg('mainNoBranch')) : s));
			});
		},
		openMerge() {
			const session = selectedSession(store.get());
			if (!session) return;
			if (!session.worktree) {
				flash(msg('notWorktree'));
				return;
			}
			store.set(A.openMerge);
			void planMerge(mergeTarget(session))
				.catch((error): MergeCheck => {
					logError(`merge check: ${String(error)}`);
					return {ok: false, error: msg('failed')};
				})
				.then(check => store.set(s => A.setMergeCheck(s, session.id, check)));
		},
		showDiff,
		showHelp,
		async openWeb() {
			const state = store.get();
			const session = selectedSession(state);
			if (!session) return;
			const ports = state.details[session.id]?.ports ?? [];
			if (ports.length === 0) flash(msg('noPorts'));
			else if (ports.length > 1) store.set(s => A.openUrlChoice(s, [...ports]));
			else if (!(await openPort(ports[0] ?? 0))) flash(msg('openFailed'));
		},
		focusAi: () => giveFocus(false),
		zoomAi: () => giveFocus(true),
		async quit() {
			await detachUi(ui);
		},
		toggleLanguage() {
			const lang = nextLang(store.get().config.language);
			// Re-read so an edit made in another window is not overwritten.
			const loaded = loadConfig(configDir);
			if (loaded.status === 'invalid') {
				store.set(s => A.setNotice(A.setLanguage(s, lang), msg('languageNotSaved')));
			} else {
				const config = {...loaded.config, language: lang};
				saveConfig(configDir, config);
				configMtime = mtimeMs(configFile(configDir));
				store.set(s => A.setConfig(s, config));
			}
			paintChrome(false);
			void applyLanguage(lang).catch(error => logError(`language: ${String(error)}`));
		},
		stop() {
			for (const timer of timers) clearInterval(timer);
			scheduler.stop();
			unsubscribe();
			offSignal();
		},
	};
}
