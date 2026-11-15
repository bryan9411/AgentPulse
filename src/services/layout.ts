import {HUD_ROWS} from '../config/layout.ts';
import {writeToTty} from '../infra/fsx.ts';
import {shellQuote, type Tmux} from '../infra/tmux.ts';

export const UI_SESSION = 'ui';

export type UiPanes = {sidebar: string; ai: string; hud: string; hudTty: string};

export type LayoutSnapshot = {
	sidebarActive: boolean;
	zoomed: boolean;
	windowWidth: number;
	windowHeight: number;
	hudWidth: number;
};

// `=name` (exact match) is accepted for session targets only; commands that
// take a pane or window target need the trailing colon.
const sessionTarget = `=${UI_SESSION}`;
const target = `=${UI_SESSION}:`;

export async function readPanes(tmux: Tmux): Promise<UiPanes | null> {
	const ids = await tmux.out(['display', '-p', '-t', target, '#{@ap-sidebar} #{@ap-ai} #{@ap-hud}']);
	const [sidebar, ai, hud] = ids?.split(' ') ?? [];
	if (!sidebar || !ai || !hud) return null;
	const hudTty = await tmux.out(['display', '-p', '-t', hud, '#{pane_tty}']);
	if (!hudTty) return null;
	return {sidebar, ai, hud, hudTty};
}

// A UI session whose sidebar pane died (crash, killed by hand) cannot be
// repaired in place, so the launcher rebuilds it.
export async function uiAlive(tmux: Tmux): Promise<boolean> {
	if (!(await tmux.run(['has-session', '-t', sessionTarget])).ok) return false;
	const sidebar = await tmux.out(['show', '-v', '-t', target, '@ap-sidebar']);
	if (!sidebar) return false;
	const panes = await tmux.out(['list-panes', '-t', target, '-F', '#{pane_id}']);
	return panes?.split('\n').includes(sidebar) ?? false;
}

// window-resized, not client-resized: the latter fires before tmux
// recomputes the layout and the sizes get overwritten (M0). Skipped while
// zoomed because resize-pane would unzoom the AI pane.
export function fixSizesCommand(panes: {sidebar: string; hud: string}, sidebarWidth: number): string {
	const fix = `resize-pane -t ${panes.sidebar} -x ${sidebarWidth} ; resize-pane -t ${panes.hud} -y ${HUD_ROWS}`;
	return `if -F "#{?window_zoomed_flag,0,1}" "${fix}"`;
}

export type BuildOptions = {
	confPath: string;
	width: number;
	height: number;
	sidebarWidth: number;
	sidebarCommand: string;
	aiPlaceholderCommand: string;
	backKey: string;
	cwd: string;
};

export async function buildUiLayout(tmux: Tmux, opts: BuildOptions): Promise<UiPanes | string> {
	const created = await tmux.run([
		'-f', opts.confPath, 'new-session', '-d', '-s', UI_SESSION, '-n', 'main',
		'-x', String(opts.width), '-y', String(opts.height), '-c', opts.cwd,
		'-P', '-F', '#{pane_id}', opts.sidebarCommand,
	]);
	if (!created.ok) return created.message;
	const sidebar = created.stdout.trim();
	const ai = await tmux.out([
		'split-window', '-h', '-d', '-t', sidebar, '-l', String(Math.max(10, opts.width - opts.sidebarWidth - 1)),
		'-c', opts.cwd, '-P', '-F', '#{pane_id}', opts.aiPlaceholderCommand,
	]);
	if (!ai) return 'could not create the AI pane';
	// The HUD pane only displays what the sidebar writes to its tty; it never takes input.
	const hud = await tmux.out([
		'split-window', '-v', '-b', '-d', '-t', ai, '-l', String(HUD_ROWS), '-c', opts.cwd, '-P', '-F', '#{pane_id}',
		`sh -c ${shellQuote('printf "\\033[?25l"; stty -echo; while :; do sleep 86400; done')}`,
	]);
	if (!hud) return 'could not create the HUD pane';
	const hudTty = await tmux.out(['display', '-p', '-t', hud, '#{pane_tty}']);
	if (!hudTty) return 'could not read the HUD tty';

	const fix = fixSizesCommand({sidebar, hud}, opts.sidebarWidth);
	const steps: string[][] = [
		['select-pane', '-t', hud, '-d'],
		['set', '-t', target, '@ap-sidebar', sidebar],
		['set', '-t', target, '@ap-ai', ai],
		['set', '-t', target, '@ap-hud', hud],
		['set-hook', '-g', 'window-resized', fix],
		['set-hook', '-g', 'client-attached', fix],
		// The one reserved key (CLAUDE.md rule 5). Selecting another pane also unzooms.
		['bind-key', '-n', opts.backKey, 'select-pane', '-t', sidebar],
		['resize-pane', '-t', sidebar, '-x', String(opts.sidebarWidth)],
		['resize-pane', '-t', hud, '-y', String(HUD_ROWS)],
		['select-pane', '-t', sidebar],
	];
	for (const step of steps) {
		const result = await tmux.run(step);
		if (!result.ok) return result.message;
	}
	return {sidebar, ai, hud, hudTty};
}

// The sidebar re-registers the hooks with its pid so tmux can poke it the
// moment focus or sizes change.
export async function installRefreshHooks(tmux: Tmux, panes: UiPanes, sidebarWidth: number, pid: number): Promise<void> {
	const poke = `run-shell -b "kill -USR1 ${pid}"`;
	const fix = fixSizesCommand(panes, sidebarWidth);
	await tmux.run(['set-hook', '-g', 'window-resized', `${fix} ; ${poke}`]);
	await tmux.run(['set-hook', '-g', 'client-attached', `${fix} ; ${poke}`]);
	await tmux.run(['set-hook', '-g', 'window-pane-changed', poke]);
	await tmux.run(['set-hook', '-g', 'after-resize-pane', poke]);
}

export async function readLayout(tmux: Tmux, panes: UiPanes): Promise<LayoutSnapshot | null> {
	const info = await tmux.out(['display', '-p', '-t', panes.sidebar, '#{pane_active} #{window_zoomed_flag} #{window_width} #{window_height}']);
	const hudWidth = await tmux.out(['display', '-p', '-t', panes.hud, '#{pane_width}']);
	if (!info || !hudWidth) return null;
	const [active, zoomed, w, h] = info.split(' ');
	return {
		sidebarActive: active === '1',
		zoomed: zoomed === '1',
		windowWidth: Number(w) || 0,
		windowHeight: Number(h) || 0,
		hudWidth: Number(hudWidth) || 0,
	};
}

export async function setTopBar(tmux: Tmux, format: string): Promise<boolean> {
	return (await tmux.run(['set', '-g', 'status-format[0]', format])).ok;
}

export function paintHud(panes: UiPanes, frame: string): boolean {
	return writeToTty(panes.hudTty, frame);
}

// Leaves the UI session and every AI running; the launcher's attach returns.
export async function detachUi(tmux: Tmux): Promise<void> {
	await tmux.run(['detach-client', '-s', sessionTarget]);
}

export type AiPaneInfo = {tty: string; width: number; height: number};

// Read fresh each time: respawn-pane gives the pane a new pty.
export async function readAiPane(ui: Tmux, panes: UiPanes): Promise<AiPaneInfo | null> {
	const out = await ui.out(['display', '-p', '-t', panes.ai, '#{pane_tty} #{pane_width} #{pane_height}']);
	const [tty, w, h] = out?.split(' ') ?? [];
	if (!tty) return null;
	return {tty, width: Number(w) || 80, height: Number(h) || 24};
}

// The embedded client is named after the AI pane's tty on the session server.
export async function embeddedClientSession(agents: Tmux, tty: string): Promise<string | null> {
	const out = await agents.out(['list-clients', '-F', '#{client_tty}\t#{session_name}']);
	for (const line of out?.split('\n') ?? []) {
		const [clientTty, session] = line.split('\t');
		if (clientTty === tty && session) return session;
	}
	return null;
}

export type ShowOptions = {
	id: string;
	label: string;
	attachCommand: string;
};

const ATTACH_WAIT_MS = 1500;

// switch-client keeps the AI running and only changes what the pane shows
// (SPEC 5.2). Without a client yet (first session, or after a UI rebuild)
// the pane is respawned straight into an attach of the wanted session.
export async function showSession(ui: Tmux, agents: Tmux, panes: UiPanes, opts: ShowOptions): Promise<boolean> {
	await ui.run(['set', '-p', '-t', panes.ai, '@ap-label', opts.label]);
	const pane = await readAiPane(ui, panes);
	if (!pane) return false;
	const current = await embeddedClientSession(agents, pane.tty);
	if (current === opts.id) return true;
	if (current) return (await agents.run(['switch-client', '-c', pane.tty, '-t', `=${opts.id}`])).ok;
	if (!(await ui.run(['respawn-pane', '-k', '-t', panes.ai, opts.attachCommand])).ok) return false;
	const deadline = Date.now() + ATTACH_WAIT_MS;
	while (Date.now() < deadline) {
		const fresh = await readAiPane(ui, panes);
		if (fresh && (await embeddedClientSession(agents, fresh.tty)) === opts.id) return true;
		await Bun.sleep(50);
	}
	return false;
}

export async function clearLabel(ui: Tmux, panes: UiPanes): Promise<void> {
	await ui.run(['set', '-p', '-t', panes.ai, '@ap-label', '']);
}

// enter: hand the keyboard to the AI. ctrl+q (bound in the UI server) takes it back.
export async function focusAi(ui: Tmux, panes: UiPanes): Promise<boolean> {
	return (await ui.run(['select-pane', '-t', panes.ai])).ok;
}

// z: full-window AI. ctrl+q selects the sidebar, which also unzooms.
export async function zoomAi(ui: Tmux, panes: UiPanes): Promise<boolean> {
	if (!(await focusAi(ui, panes))) return false;
	const zoomed = await ui.out(['display', '-p', '-t', panes.ai, '#{window_zoomed_flag}']);
	if (zoomed === '1') return true;
	return (await ui.run(['resize-pane', '-Z', '-t', panes.ai])).ok;
}
