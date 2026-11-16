import {basename, join} from 'node:path';
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
import type {AppState, MergeDialog, NewSessionDialog, SessionSummary, WorktreeDialog} from '../state/types.ts';
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
import {diffPopupCommand, helpPopupCommand} from '../services/diff.ts';
import {contextView, contextWindow} from '../services/context/usage.ts';
import {gitDue, readFacts} from '../services/details.ts';
import {sessionPorts} from '../services/ports.ts';
import {addProject, removeProject} from '../services/projects.ts';
import {createScheduler, exclusive} from '../services/scheduler.ts';
import {
	agentChoices,
	captureScreen,
	closeSession,
	createSession,
	isPaneDead,
	listSessions,
	reloadSessionConf,
	respawnSession,
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
	// 記錄最後切換到內嵌 client 的工作階段 ID，避免重複執行 switch-client
	let shown: string | null = null;
	let hudWidth = 0;
	let lastFrame = '';
	let lastTopBar = '';
	// 浮動視窗開啟期間暫停更新 HUD，否則直接寫入 tty 會穿透蓋住浮動視窗
	let popupOpen = false;
	let configMtime = mtimeMs(configFile(configDir));
	const scheduler = createScheduler(reportError);
	const timers: Array<ReturnType<typeof setInterval>> = [];
	const pids = new Map<string, number>();
	const resumeSent = new Map<string, number>();
	const notified: NotifyLog = new Map();
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
	// hook 觸發表示尺寸或焦點有變動，即使文字內容相同也要強制重繪
	const forcedLayout = exclusive('layout', () => refreshLayout(true), reportError);

	const refreshPlaceholder = async () => {
		if (!panes || shown !== null) return;
		await redrawPlaceholder(ui, agents, panes, aiPlaceholderCommand(store.get().config.language));
	};

	// 結束提示文字寫在 AI server 的 tmux 設定裡，切換語言時需重新寫檔並載入
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
		// 工作階段新增或關閉時立即重掃衝突，不必等 15 秒輪詢
		if (store.get().sessions !== before) void pollRadar();
		// 最後一個工作階段關閉時內嵌 client 會退回佔位畫面，同步清掉邊框標題
		if (sessions.length === 0 && hadSessions) {
			shown = null;
			if (panes) await clearLabel(ui, panes);
		}
	};

	const observe = async (session: SessionSummary, now: number, seen: boolean, prev: SessionStatus | null) => {
		if (session.dead) {
			return nextStatus(prev, {dead: true, exitStatus: session.exitStatus, screenState: null, screen: null, now, seen});
		}
		const screen = await captureScreen(agents, session.id);
		if (screen === null) return prev;
		screens.set(session.id, screen);
		const adapter = getAgent(session.agent);
		// 已結束的窗格不會進到這裡（例如 Claude 結束後畫面上仍可能殘留更早之前的暫停訊息）
		if (adapter?.isSuspended(screen)) {
			const pid = pids.get(session.id);
			if (pid && resumeAllowed(resumeSent, session.id, now)) {
				const how = continueProcessGroup(pid);
				if (how === 'failed' && !(await isPaneDead(agents, session.id))) {
					logError(`resume: SIGCONT to ${session.id} (pid ${pid}) failed`);
				}
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

	// 失敗時沿用舊結果，不覆蓋或清空既有顯示資料
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

	// 只掃描橫跨兩個以上工作資料夾的專案
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

	// 只在有警告閃爍項目時切換相位，閒置清單不會白白重繪
	const blink = () => {
		const state = store.get();
		store.set(s => A.setBlink(s, state.attention.length > 0 ? !state.blinkOn : true));
	};

	// 快速連按 j/k 時只切換到最後選中的工作階段，不為途中經過的每一列排隊切換
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
			void pollInfo();
			void pollGit();
			void pollPorts();
		}
	});
	const offSignal = onRefreshSignal(() => void forcedLayout());

	// launcher 在啟動側欄後才會建立 HUD 與 AI 窗格，因此短間隔輪詢直到偵測到窗格
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
	// 新工作階段建好後立刻抓一次環境資料，不必等 60 秒輪詢
	const pollNewFacts = exclusive('facts-new', () => refreshFacts(true), reportError);
	scheduler.every(FACTS_POLL_MS, 'facts', () => refreshFacts(false));
	const pollAccounts = scheduler.every(ACCOUNTS_POLL_MS, 'accounts', refreshAccounts);
	void pollAccounts();
	const pollRadar = scheduler.every(RADAR_POLL_MS, 'radar', refreshConflicts);
	timers.push(setInterval(blink, BLINK_MS));
	// 讓「已開 42分」「3秒前有輸出」等相對時間隨時間經過持續更新
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

	const submitRemoveProject = async (projectPath: string) => {
		const under = store.get().sessions.filter(s => s.project === projectPath);
		for (const session of under) {
			if (!(await closeAndForget(session.id))) {
				store.set(s => A.setDialogError(s, msg('cannotClose')));
				return;
			}
		}
		const result = removeProject(projectPath, configDir);
		if (!result.ok) {
			store.set(s => A.setDialogError(s, result.error));
			return;
		}
		configMtime = mtimeMs(configFile(configDir));
		if (under.length > 0) {
			await refreshSessions();
		}
		store.set(s => A.closeDialog(A.setConfig(s, result.config)));
		if (under.length > 0) {
			await afterClose();
		}
	};

	const focusAiPane = async (sessionId: string, zoom: boolean) => {
		await syncAi(true);
		if (shown !== sessionId) {
			store.set(s => A.setNotice(s, msg('cannotShow')));
			return;
		}
		store.set(s => A.setNotice(s, null));
		const ok = zoom ? await zoomAi(ui, panes!) : await focusAi(ui, panes!);
		if (!ok) logError(`focus: select-pane failed (zoom=${zoom})`);
		await refreshLayout(true);
	};

	const restartDeadSession = async (session: SessionSummary, zoom = false): Promise<boolean> => {
		const result = await respawnSession(agents, session);
		if (!result.ok) {
			logError(`restart session ${session.id}: ${messageText('en', result.error)}`);
			store.set(s => A.setFlash(s, result.error));
			return false;
		}
		resumeSent.delete(session.id);
		screens.delete(session.id);
		store.set(s => A.selectSession(s, session.id));
		await refreshSessions();
		const updated = store.get().sessions.find(s => s.id === session.id);
		if (updated?.dead) {
			const error = msg('startFailed', `exit ${updated.exitStatus ?? '?'}`);
			logError(`restart session ${session.id}: ${messageText('en', error)}`);
			store.set(s => A.setFlash(s, error));
			return false;
		}
		if (panes) await focusAiPane(session.id, zoom);
		void refreshStatuses();
		return true;
	};

	const giveFocus = async (zoom: boolean) => {
		if (!panes) return;
		await refreshSessions();
		const session = selectedSession(store.get());
		if (!session) return;
		if (session.dead) {
			await restartDeadSession(session, zoom);
			return;
		}
		const pid = pids.get(session.id);
		if (pid && (await platform.isProcessStopped(pid))) {
			continueProcessGroup(pid);
		}
		await focusAiPane(session.id, zoom);
	};

	// 依目前右側 AI 窗格大小啟動，避免第一幀就用錯誤寬度排版
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

	const enterSession = async (id: string) => {
		await refreshSessions();
		store.set(s => A.closeDialog(A.selectSession(s, id)));
		await giveFocus(false);
	};

	const handleExistingSession = async (project: string, branch: string, agent: string): Promise<'none' | 'blocked' | 'restarted'> => {
		await refreshSessions();
		const existing = store.get().sessions.find(s => s.project === project && s.branch === branch && s.agent === agent);
		if (!existing) return 'none';
		if (!existing.dead) {
			store.set(s => A.setDialogError(s, msg('agentBranchExists', agent, branch)));
			return 'blocked';
		}
		store.set(A.closeDialog);
		await restartDeadSession(existing);
		return 'restarted';
	};

	const submitNewSession = async (dialog: NewSessionDialog, agent: string) => {
		const cwd = dialog.cwd ?? dialog.project;
		const branch = (await currentBranch(cwd)) ?? dialog.branch ?? 'HEAD';
		if ((await handleExistingSession(dialog.project, branch, agent)) !== 'none') return;
		const result = await startSession({agent, project: dialog.project, cwd, base: dialog.base});
		if (!result.ok) {
			logError(`new session: ${messageText('en', result.error)}`);
			store.set(s => A.setDialogError(s, result.error));
			return;
		}
		await enterSession(result.id);
	};

	const closeAndForget = async (id: string): Promise<boolean> => {
		if (!(await closeSession(agents, id)) && (await sessionExists(agents, id))) return false;
		if (shown === id) shown = null;
		return true;
	};

	const afterClose = async () => {
		await syncAi(true);
		// 退回佔位畫面時順便以目前語言重繪提示
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

	const flash = (message: Message) => store.set(s => A.setFlash(s, message));

	const submitWorktree = async (dialog: WorktreeDialog, agent: string) => {
		const branch = dialog.value.trim();
		if (branch && (await handleExistingSession(dialog.project, branch, agent)) !== 'none') return;
		const made = await createWorktree(dialog.project, dialog.value);
		if (!made.ok) {
			store.set(s => A.setDialogError(s, made.error));
			return;
		}
		const result = await startSession({agent, project: dialog.project, cwd: made.path, base: made.base});
		if (!result.ok) {
			// AI 啟動失敗時不自動回滾刪除資料夾與分支，保留給使用者自行處理
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
		// 以最新清單重抓 session，避免開啟對話框期間 AI 突然開始執行
		const target = mergeTarget(store.get().sessions.find(s => s.id === id) ?? dialog.session);
		const outcome = await runMerge(target, dialog.value, {closeSession: () => closeAndForget(id)});
		if (outcome.kind === 'blocked') {
			// 狀態已過期，重算並更新確認對話框顯示的步驟與阻擋原因
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

	// 同時只開一個浮動視窗，tmux 會等到使用者關閉視窗才返回
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
			const state = store.get();
			const lang = state.config.language;
			const projectName = state.projects.find(p => p.path === session.project)?.name ?? basename(session.cwd);
			const title = session.branch ? `${projectName} (${session.branch})` : projectName;
			popupOpen = true;
			try {
				if (!(await showPopup(ui, diffPopupCommand(session.cwd, lang, title)))) {
					logError(`diff: the popup for ${session.id} did not end cleanly`);
				}
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
			const lang = store.get().config.language;
			popupOpen = true;
			try {
				if (!(await showPopup(ui, helpPopupCommand(lang)))) logError('help: the popup did not end cleanly');
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
				else if (dialog.kind === 'remove-project') await submitRemoveProject(dialog.project.path);
				else if (dialog.kind === 'new-session') await submitNewSession(dialog, agent);
				else if (dialog.kind === 'worktree') await submitWorktree(dialog, agent);
				else if (dialog.kind === 'merge') await submitMerge(dialog);
				else if (dialog.kind === 'open-url') {
					const port = dialog.ports[dialog.index];
					if (port !== undefined && (await openPort(port))) store.set(A.closeDialog);
					else store.set(s => A.setDialogError(s, msg('openFailed')));
				} else if (dialog.kind === 'close-session') await submitCloseSession(dialog.session.id);
			} catch (error) {
				logError(`dialog ${dialog.kind}: ${String(error)}`);
				store.set(s => A.setDialogError(s, msg('failed')));
			} finally {
				// 忙線時會鎖住按鍵，結束後必須確保解除 busy 旗標
				store.set(s => (s.dialog === working ? A.setDialogBusy(s, false) : s));
			}
		},
		openNewSession() {
			store.set(s => A.openNewSession(s, agentChoices()));
			const row = selectedRow(store.get());
			if (row?.kind === 'project') {
				void currentBranch(row.project.path).then(branch => {
					if (branch) {
						store.set(s => (s.dialog?.kind === 'new-session' && s.dialog.project === row.project.path && !s.dialog.branch ? {...s, dialog: {...s.dialog, branch}} : s));
					}
				});
			}
		},
		openWorktree() {
			const project = selectedProjectPath(store.get());
			if (!project) return;
			// 先開啟對話框讓使用者立刻打字，來源分支背景查完再補顯示
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
			// 寫回前重讀一次，避免蓋掉使用者在其他視窗手動修改的設定
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
