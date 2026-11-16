import {HUD_ROWS} from '../config/layout.ts';
import {writeToTty} from '../infra/fsx.ts';
import {parseTmuxVersion, shellQuote, versionAtLeast, type Tmux} from '../infra/tmux.ts';

export const UI_SESSION = 'ui';

export type UiPanes = {sidebar: string; ai: string; hud: string; hudTty: string};

export type LayoutSnapshot = {
	sidebarActive: boolean;
	zoomed: boolean;
	windowWidth: number;
	windowHeight: number;
	hudWidth: number;
};

// `=name` 只比對 session 名稱；後面要指定視窗或窗格目標必須補上結尾冒號
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

// 側欄窗格死掉（當機或被手動關閉）無法就地修復，必須由 launcher 重建整個 UI session
export async function uiAlive(tmux: Tmux): Promise<boolean> {
	if (!(await tmux.run(['has-session', '-t', sessionTarget])).ok) return false;
	const sidebar = await tmux.out(['show', '-v', '-t', target, '@ap-sidebar']);
	if (!sidebar) return false;
	const panes = await tmux.out(['list-panes', '-t', target, '-F', '#{pane_id}']);
	return panes?.split('\n').includes(sidebar) ?? false;
}

// 必須掛在 window-resized 而非 client-resized：後者觸發時 tmux 還沒算完版面，尺寸會被蓋掉；
// 放大（zoom）期間跳過調整，避免 resize-pane 把 AI 窗格還原成未放大
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
	// HUD 窗格只負責顯示側欄寫入 tty 的文字，停用輸入焦點
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
		// 唯一的全域保留按鍵；切回側欄時也會一併解除 AI 窗格的放大狀態
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

// 側欄重連時重新把自己的 pid 註冊到 tmux hook，焦點或大小一變就立刻發 SIGUSR1 通知重繪
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

export async function detachUi(tmux: Tmux): Promise<void> {
	await tmux.run(['detach-client', '-s', sessionTarget]);
}

export type AiPaneInfo = {tty: string; width: number; height: number};

// 每次都重新讀取：respawn-pane 會替換窗格的 pty
export async function readAiPane(ui: Tmux, panes: UiPanes): Promise<AiPaneInfo | null> {
	const out = await ui.out(['display', '-p', '-t', panes.ai, '#{pane_tty} #{pane_width} #{pane_height}']);
	const [tty, w, h] = out?.split(' ') ?? [];
	if (!tty) return null;
	return {tty, width: Number(w) || 80, height: Number(h) || 24};
}

// 內嵌在右側窗格的 client 在工作階段 server 上會以該窗格的 tty 名稱識別
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

// 透過 switch-client 切換顯示的工作階段而不重開 AI；若還沒有內嵌 client（第一個工作階段或重建 UI 後），
// 則直接 respawn AI 窗格來 attach 目標工作階段
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

// 佔位文字寫在啟動指令裡，切換語言時需重新 respawn；若目前有顯示中的 AI 則不處理
export async function redrawPlaceholder(ui: Tmux, agents: Tmux, panes: UiPanes, command: string): Promise<boolean> {
	const pane = await readAiPane(ui, panes);
	if (!pane || (await embeddedClientSession(agents, pane.tty))) return false;
	return (await ui.run(['respawn-pane', '-k', '-t', panes.ai, command])).ok;
}

// display-popup 會阻塞直到使用者關閉浮動視窗；逾時設長一點只影響等待，不會關掉 server
const POPUP_MAX_MS = 60 * 60 * 1000;

let cachedBorderlessPopup: boolean | undefined;

async function supportsBorderlessPopup(ui: Tmux): Promise<boolean> {
	if (cachedBorderlessPopup !== undefined) return cachedBorderlessPopup;
	const raw = await ui.out(['-V']);
	const ver = raw ? parseTmuxVersion(raw) : null;
	cachedBorderlessPopup = ver ? versionAtLeast(ver, 3, 3) : false;
	return cachedBorderlessPopup;
}

export function popupArgs(borderless: boolean, command: string): string[] {
	// -B 無外框旗標自 tmux 3.3 起才支援，3.2 維持預設外框並一樣放大至滿版
	return ['display-popup', '-E', ...(borderless ? ['-B'] : []), '-w', '100%', '-h', '100%', command];
}

export async function showPopup(ui: Tmux, command: string): Promise<boolean> {
	const borderless = await supportsBorderlessPopup(ui);
	return (await ui.run(popupArgs(borderless, command), {timeoutMs: POPUP_MAX_MS})).ok;
}

export async function clearLabel(ui: Tmux, panes: UiPanes): Promise<void> {
	await ui.run(['set', '-p', '-t', panes.ai, '@ap-label', '']);
}

export async function focusAi(ui: Tmux, panes: UiPanes): Promise<boolean> {
	return (await ui.run(['select-pane', '-t', panes.ai])).ok;
}

export async function zoomAi(ui: Tmux, panes: UiPanes): Promise<boolean> {
	if (!(await focusAi(ui, panes))) return false;
	const zoomed = await ui.out(['display', '-p', '-t', panes.ai, '#{window_zoomed_flag}']);
	if (zoomed === '1') return true;
	return (await ui.run(['resize-pane', '-Z', '-t', panes.ai])).ok;
}
