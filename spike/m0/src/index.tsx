// M0 throwaway spike. Verifies: Bun compile + Ink (G1), nested tmux embed (G2),
// focus keys (G3), HUD drawn into a slim pane's tty (G4), persistence (G5),
// binary resolution when launched from Finder (G6), glyph width (G7).
// Also: auto-resume after ctrl+z suspends Claude Code (SPEC 5.3).
import React, {useEffect, useRef, useState} from 'react';
import {render, Box, Text, useInput, useWindowSize} from 'ink';
import stringWidth from 'string-width';
import {mkdirSync, writeFileSync, appendFileSync, openSync, writeSync, readSync, closeSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const UI = 'ap-spike-ui';
const AG = 'ap-spike';
const REPO = '/Users/admin/Documents/agentpulse';
// Fixed location so a Finder-launched run and a shell can both find the diagnostics.
const DIR = join(REPO, 'spike/m0/.run');
const SIDEBAR_WIDTH = 30;
const HUD_ROWS = 4;
const C = {
	fg: '#c9cacd',
	dim: '#73767d',
	sel: '#2b2d32',
	amber: '#d0a24c',
	green: '#86b07f',
	red: '#cf7575',
};

function findBin(name: string): string | null {
	const onPath = Bun.which(name);
	if (onPath) return onPath;
	for (const dir of ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']) {
		const candidate = join(dir, name);
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

const TMUX = findBin('tmux') ?? 'tmux';

// A tmux server started without a UTF-8 locale makes every program inside it
// (and the nested client) fall back to ASCII, so guarantee one.
const hasUtf8Locale = /UTF-?8/i.test(`${process.env.LC_ALL ?? ''}${process.env.LC_CTYPE ?? ''}${process.env.LANG ?? ''}`);
const ENV = hasUtf8Locale ? process.env : {...process.env, LANG: 'en_US.UTF-8'};

function run(cmd: string[]) {
	const r = Bun.spawnSync({cmd, stdout: 'pipe', stderr: 'pipe', env: ENV});
	return {ok: r.exitCode === 0, out: r.stdout.toString().trimEnd(), err: r.stderr.toString().trimEnd()};
}

const ui = (...args: string[]) => run([TMUX, '-L', UI, ...args]);
const ag = (...args: string[]) => run([TMUX, '-L', AG, ...args]);

// ---------- text helpers ----------

function truncate(text: string, width: number): string {
	if (stringWidth(text) <= width) return text;
	let out = '';
	let used = 0;
	for (const ch of text) {
		const w = stringWidth(ch);
		if (used + w > width - 1) break;
		out += ch;
		used += w;
	}
	return out + '…';
}

function pad(text: string, width: number): string {
	const t = truncate(text, width);
	return t + ' '.repeat(Math.max(0, width - stringWidth(t)));
}

function spread(left: string, right: string, width: number): string {
	const room = Math.max(0, width - stringWidth(right) - 1);
	return pad(left, room) + ' ' + right;
}

const rgb = (hex: string) => {
	const n = Number.parseInt(hex.slice(1), 16);
	return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
};

// ---------- demo data ----------

type Item = {group: string; name: string; agent: string; glyph: string; color: string; session: string};

const ITEMS: Item[] = [
	{group: 'agentpulse', name: 'main', agent: 'claude', glyph: '◐', color: C.amber, session: 'agentpulse-demo-claude'},
	{group: 'agentpulse', name: '修正/登入錯誤', agent: 'shell', glyph: '○', color: C.fg, session: 'agentpulse-demo-shell'},
	{group: 'demo', name: 'feat/hero', agent: 'colors', glyph: '●', color: C.green, session: 'agentpulse-demo-colors'},
	{group: 'demo', name: 'refactor/etl', agent: 'aider', glyph: '✕', color: C.red, session: 'agentpulse-demo-colors'},
	{group: 'demo', name: 'feat/done', agent: 'codex', glyph: '✓', color: C.fg, session: 'agentpulse-demo-colors'},
];

// ---------- sidebar (the only long-running program) ----------

type Panes = {self: string; ai: string; hud: string; aiTty: string; hudTty: string};

function discoverPanes(): Panes | null {
	const self = process.env.TMUX_PANE ?? '';
	const ai = ui('show', '-v', '-t', 'ui', '@ap-ai').out;
	const hud = ui('show', '-v', '-t', 'ui', '@ap-hud').out;
	if (!self || !ai || !hud) return null;
	const aiTty = ui('display', '-p', '-t', ai, '#{pane_tty}').out;
	const hudTty = ui('display', '-p', '-t', hud, '#{pane_tty}').out;
	if (!aiTty || !hudTty) return null;
	return {self, ai, hud, aiTty, hudTty};
}

function drawHud(panes: Panes, item: Item, startedAt: number) {
	const width = Number(ui('display', '-p', '-t', panes.hud, '#{pane_width}').out) || 80;
	const inner = width - 2;
	const secs = Math.floor((Date.now() - startedAt) / 1000);
	const fg = rgb(C.fg);
	const dim = rgb(C.dim);
	const amber = rgb(C.amber);
	const barWidth = Math.max(4, inner - 12 - 30);
	const used = Math.round(barWidth * 0.82);
	const lines = [
		`${fg}\x1b[1m${item.name}\x1b[22m${dim}${pad(` · ${item.group} · ${item.agent}`, Math.max(0, inner - stringWidth(item.name) - 8))}${pad(`${item.glyph} state`, 8)}`,
		`${dim}${pad('model [high] · MCP github, postgres · skills 4 · CLAUDE.md ✓', inner)}`,
		`${dim}${pad(`⎇ ${item.name} · +128 −34 · up ${secs}s · pane width ${width}`, inner)}`,
		`${amber}context 82%${dim} ${fg}${'━'.repeat(used)}${dim}${'─'.repeat(barWidth - used)} system 18 · chat 64 · free 18`,
	];
	const frame = '\x1b[?25l\x1b[H' + lines.map(l => ` ${l}\x1b[0m\x1b[K`).join('\r\n') + '\x1b[J';
	try {
		const fd = openSync(panes.hudTty, 'w');
		writeSync(fd, frame);
		closeSync(fd);
	} catch {
		// HUD pane may be gone during teardown; ignore in the spike.
	}
}

// ---------- suspend auto-resume ----------

// ctrl+z makes Claude Code print this notice, hand the tty back and wait for
// SIGCONT. The embed has no shell to run `fg` from, so we send it ourselves.
const SUSPEND_NOTICE = 'Claude Code has been suspended';
const RESUME_COOLDOWN_MS = 3000;

export function isSuspended(screen: string): boolean {
	const lines = screen.split('\n');
	const at = lines.findLastIndex(line => line.includes(SUSPEND_NOTICE));
	if (at === -1) return false;
	// Without the alternate screen the notice stays above the redrawn UI after
	// a resume; an input box border below it means Claude Code is live again.
	return !lines.slice(at + 1).some(line => line.startsWith('──'));
}

function resumeIfSuspended(session: string, lastSent: Map<string, number>) {
	if (!isSuspended(ag('capture-pane', '-p', '-t', session).out)) return;
	const now = Date.now();
	// A misdetection must not turn into a redraw every second.
	if (now - (lastSent.get(session) ?? 0) < RESUME_COOLDOWN_MS) return;
	const pid = Number(ag('display', '-p', '-t', session, '#{pane_pid}').out);
	if (!pid) return;
	lastSent.set(session, now);
	let target = 'group';
	try {
		// The pane process leads its own process group; signalling the group
		// also reaches the AI when a wrapper shell did not exec into it.
		process.kill(-pid, 'SIGCONT');
	} catch {
		target = 'pid';
		try {
			process.kill(pid, 'SIGCONT');
		} catch {
			target = 'failed';
		}
	}
	appendFileSync(join(DIR, 'resume.log'), `${new Date(now).toISOString()} ${session} pid=${pid} ${target}\n`);
}

function Sidebar() {
	const {columns, rows} = useWindowSize();
	const [sel, setSel] = useState(0);
	const [focused, setFocused] = useState(true);
	const [zoomed, setZoomed] = useState(false);
	const [panes, setPanes] = useState<Panes | null>(null);
	const startedAt = useRef(Date.now());
	const selRef = useRef(0);
	selRef.current = sel;

	// Wait for bootstrap to finish creating the other panes.
	useEffect(() => {
		const timer = setInterval(() => {
			const found = discoverPanes();
			if (found) {
				setPanes(found);
				clearInterval(timer);
			}
		}, 200);
		return () => clearInterval(timer);
	}, []);

	// Focus tracking: poll + immediate refresh on SIGUSR1 from tmux hooks.
	useEffect(() => {
		if (!panes) return;
		const check = () => {
			const [active, zoom] = ui('display', '-p', '-t', panes.self, '#{pane_active} #{window_zoomed_flag}').out.split(' ');
			setFocused(active === '1');
			setZoomed(zoom === '1');
		};
		const signal = `run-shell -b "kill -USR1 ${process.pid}"`;
		ui('set-hook', '-g', 'window-pane-changed', signal);
		ui('set-hook', '-g', 'after-resize-pane', signal);
		ui('bind-key', '-n', 'C-q', 'select-pane', '-t', panes.self);
		process.on('SIGUSR1', check);
		const timer = setInterval(check, 500);
		check();
		return () => {
			clearInterval(timer);
			process.off('SIGUSR1', check);
		};
	}, [panes]);

	// Suspend watch. Runs regardless of focus: ctrl+z arrives while the AI pane has it.
	useEffect(() => {
		const lastSent = new Map<string, number>();
		const sessions = [...new Set(ITEMS.filter(i => i.agent === 'claude').map(i => i.session))];
		const timer = setInterval(() => {
			for (const session of sessions) resumeIfSuspended(session, lastSent);
		}, 1000);
		return () => clearInterval(timer);
	}, []);

	// HUD + top status line.
	useEffect(() => {
		if (!panes) return;
		const paint = () => drawHud(panes, ITEMS[selRef.current]!, startedAt.current);
		paint();
		const timer = setInterval(paint, 1000);
		ui(
			'set', '-g', 'status-format[0]',
			` #[fg=${C.fg},bold]AgentPulse#[default]  ${ITEMS.length} sessions · #[fg=${C.amber}]◐#[default] 1 needs approval · #[fg=${C.red}]✕#[default] 1 error#[align=right]claude ●  codex ○  gemini ○  aider ○ `,
		);
		return () => clearInterval(timer);
	}, [panes, sel]);

	const show = (index: number) => {
		setSel(index);
		const item = ITEMS[index]!;
		if (!panes) return;
		ag('switch-client', '-c', panes.aiTty, '-t', item.session);
		ui('set', '-p', '-t', panes.ai, '@ap-label', item.agent);
	};

	useInput((input, key) => {
		if (!panes) return;
		if (key.downArrow || input === 'j') show(Math.min(ITEMS.length - 1, sel + 1));
		else if (key.upArrow || input === 'k') show(Math.max(0, sel - 1));
		else if (key.return) ui('select-pane', '-t', panes.ai);
		else if (input === 'z') {
			ui('select-pane', '-t', panes.ai);
			ui('resize-pane', '-Z', '-t', panes.ai);
		} else if (input === 'q') ui('detach-client');
	});

	const inner = Math.max(10, columns - 2);
	const groups = [...new Set(ITEMS.map(i => i.group))];
	return (
		<Box flexDirection="column" width={columns} height={rows} paddingX={1}>
			<Text color={C.dim}>Sessions</Text>
			<Text color={C.dim}>/ filter</Text>
			<Text> </Text>
			{groups.map(group => (
				<Box key={group} flexDirection="column">
					<Text>
						<Text color={C.dim}>▾ </Text>
						<Text color={C.fg}>{group}</Text>
						<Text color={C.dim}> {ITEMS.filter(i => i.group === group).length}</Text>
					</Text>
					{ITEMS.map((item, index) =>
						item.group === group ? (
							<Text key={item.name} backgroundColor={index === sel ? C.sel : undefined}>
								<Text color={item.color}>{`  ${item.glyph} `}</Text>
								<Text color={C.fg}>{pad(item.name, inner - 4 - stringWidth(item.agent) - 1)}</Text>
								<Text color={C.dim}>{` ${item.agent}`}</Text>
							</Text>
						) : null,
					)}
				</Box>
			))}
			<Box flexGrow={1} />
			<Text color={C.dim}>{pad(`${columns}x${rows} focus:${focused ? 'list' : 'ai'}${zoomed ? ' zoomed' : ''}`, inner)}</Text>
			<Text color={C.dim}>{pad(focused ? 'enter type · z zoom · q quit' : 'ctrl+q back', inner)}</Text>
		</Box>
	);
}

// ---------- bootstrap ----------

const UI_CONF = `
set -g prefix None
set -g prefix2 None
set -s escape-time 0
set -s focus-events on
set -s extended-keys on
set -s extended-keys-format csi-u
set -g default-terminal "tmux-256color"
set -as terminal-features ",*:RGB"
set -as terminal-features ",*:extkeys"
set -g mouse on
set -g status on
set -g status-position top
set -g status-interval 0
set -g status-style "bg=#1d1e21,fg=#73767d"
set -g status-format[0] " AgentPulse"
set -g window-style "bg=#1d1e21,fg=#c9cacd"
set -g window-active-style "bg=#1d1e21,fg=#c9cacd"
set -g pane-border-style "fg=#33353a,bg=#1d1e21"
set -g pane-active-border-style "fg=#73767d,bg=#1d1e21"
set -g pane-border-status top
set -g pane-border-format "#{?@ap-label, #{@ap-label} ,}"
set -g pane-border-lines single
set -g pane-border-indicators off
`;

const AGENTS_CONF = `
set -g prefix None
set -g prefix2 None
set -s escape-time 0
set -s focus-events on
set -s extended-keys on
set -s extended-keys-format csi-u
set -g default-terminal "tmux-256color"
set -as terminal-features ",*:RGB"
set -as terminal-features ",*:extkeys"
set -g mouse on
set -g status off
set -g history-limit 50000
set -g remain-on-exit on
set -g window-size latest
set -g allow-passthrough on
set -s set-clipboard on
set-environment -g COLORTERM truecolor
`;

const quote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

function selfCommand(role: string): string {
	const compiled = Bun.main.startsWith('/$bunfs') || !Bun.main.endsWith('.tsx');
	return compiled
		? `${quote(process.execPath)} --role=${role}`
		: `${quote(process.execPath)} run ${quote(Bun.main)} --role=${role}`;
}

// G7: ask the real terminal how many cells each glyph advances the cursor.
function measureGlyphs(): Record<string, number> | string {
	if (!process.stdin.isTTY || !process.stdout.isTTY) return 'not a tty';
	const stty = (...args: string[]) => Bun.spawnSync({cmd: ['stty', ...args], stdin: 'inherit', stdout: 'ignore', stderr: 'ignore'});
	const result: Record<string, number> = {};
	stty('raw', '-echo', 'min', '0', 'time', '3');
	try {
		const buf = Buffer.alloc(64);
		for (const glyph of ['●', '◐', '○', '✓', '✕', '▾', '⎇', '━', '─', '·', '…', '−', '中']) {
			writeSync(1, `\r\x1b[K${glyph}\x1b[6n`);
			let reply = '';
			for (let tries = 0; tries < 4 && !/\x1b\[\d+;\d+R/.test(reply); tries++) {
				const n = readSync(0, buf, 0, 64, null);
				if (n > 0) reply += buf.toString('latin1', 0, n);
			}
			const match = /\x1b\[\d+;(\d+)R/.exec(reply);
			result[glyph] = match ? Number(match[1]) - 1 : -1;
		}
		writeSync(1, '\r\x1b[K');
	} catch (error) {
		return `failed: ${String(error)}`;
	} finally {
		stty('sane');
	}
	return result;
}

function bootstrap(attach: boolean) {
	mkdirSync(DIR, {recursive: true});
	const claude = findBin('claude');
	const glyphCells = attach ? measureGlyphs() : 'skipped (no attach)';
	writeFileSync(
		join(DIR, 'diag.json'),
		JSON.stringify(
			{
				when: new Date().toISOString(),
				execPath: process.execPath,
				main: Bun.main,
				cwd: process.cwd(),
				isTTY: Boolean(process.stdout.isTTY),
				TERM: process.env.TERM,
				COLORTERM: process.env.COLORTERM,
				TERM_PROGRAM: process.env.TERM_PROGRAM,
				PATH: process.env.PATH,
				LANG: process.env.LANG,
				glyphCells,
				found: {tmux: findBin('tmux'), git: findBin('git'), claude, viaPathOnly: {tmux: Bun.which('tmux'), git: Bun.which('git'), claude: Bun.which('claude')}},
			},
			null,
			2,
		),
	);
	const uiConf = join(DIR, 'ui.conf');
	const agConf = join(DIR, 'agents.conf');
	writeFileSync(uiConf, UI_CONF);
	writeFileSync(agConf, AGENTS_CONF);

	const newAgent = (name: string, command: string) => {
		if (ag('has-session', '-t', `=${name}`).ok) return;
		run([TMUX, '-L', AG, '-f', agConf, 'new-session', '-d', '-s', name, '-x', '120', '-y', '38', '-c', REPO, command]);
	};
	const gradient =
		`awk 'BEGIN{for(i=0;i<72;i++){r=255-int(i*255/71);g=int(i*510/71);if(g>255)g=510-g;b=int(i*255/71);printf "\\033[48;2;%d;%d;%dm ",r,g,b}printf "\\033[0m\\n"}'`;
	newAgent('agentpulse-demo-claude', claude ? quote(claude) : 'zsh -l');
	newAgent('agentpulse-demo-shell', 'zsh -l');
	newAgent('agentpulse-demo-colors', `sh -c ${quote(`${gradient}; printf '繁體中文對齊 | ●◐○✓✕ | truecolor above\\n'; exec cat`)}`);

	if (!ui('has-session', '-t', '=ui').ok) {
		run([TMUX, '-L', UI, '-f', uiConf, 'new-session', '-d', '-s', 'ui', '-n', 'main', '-x', '160', '-y', '45', selfCommand('sidebar')]);
		const side = ui('display', '-p', '-t', 'ui:main', '#{pane_id}').out;
		const ai = ui(
			'split-window', '-h', '-d', '-t', side, '-l', String(160 - SIDEBAR_WIDTH - 1), '-P', '-F', '#{pane_id}',
			`env -u TMUX ${quote(TMUX)} -u -L ${AG} attach-session -t agentpulse-demo-claude`,
		).out;
		const hud = ui(
			'split-window', '-v', '-b', '-d', '-t', ai, '-l', String(HUD_ROWS), '-P', '-F', '#{pane_id}',
			`sh -c 'printf "\\033[?25l"; stty -echo; while :; do sleep 86400; done'`,
		).out;
		ui('select-pane', '-t', hud, '-d');
		ui('resize-pane', '-t', hud, '-y', String(HUD_ROWS));
		ui('set', '-p', '-t', ai, '@ap-label', 'claude');
		const fix = `resize-pane -t ${side} -x ${SIDEBAR_WIDTH} ; resize-pane -t ${hud} -y ${HUD_ROWS}`;
		// client-resized fires before tmux recomputes the layout, so the fixed
		// sizes get overwritten; window-resized fires after.
		ui('set-hook', '-g', 'window-resized', fix);
		ui('set-hook', '-g', 'client-attached', fix);
		ui('resize-pane', '-t', side, '-x', String(SIDEBAR_WIDTH));
		ui('set', '-t', 'ui', '@ap-ai', ai);
		ui('set', '-t', 'ui', '@ap-hud', hud);
	}

	if (attach) {
		Bun.spawnSync({cmd: [TMUX, '-u', '-L', UI, 'attach-session', '-t', 'ui'], stdin: 'inherit', stdout: 'inherit', stderr: 'inherit', env: ENV});
	}
}

// ---------- entry ----------

const args = process.argv.slice(2);
if (args.includes('--kill')) {
	ui('kill-server');
	ag('kill-server');
} else if (args.includes('--kill-ui')) {
	ui('kill-server');
} else if (args.includes('--role=sidebar')) {
	render(<Sidebar />, {exitOnCtrlC: false, alternateScreen: true});
} else {
	bootstrap(!args.includes('--no-attach'));
}
