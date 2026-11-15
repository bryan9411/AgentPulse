import type {HostFs} from '../infra/fsx.ts';

export type {HostFs} from '../infra/fsx.ts';

export type AgentId = 'claude' | 'codex' | 'agy';

export type AgentState = 'running' | 'needs-approval' | 'idle' | 'done' | 'error';

// What a single screen can show. `done` needs history (was it running, has
// the user looked since), so the status machine decides it, not the adapter.
export type ScreenState = Exclude<AgentState, 'done'>;

export type AccountStatus = 'signed-in' | 'not-set';

// Tokens, SPEC 5.6. `used` is the input of the latest request; `base` the
// input of the conversation's first request (system, tools, MCP, first
// message), null when it could not be found.
export type ContextUsage = {used: number; base: number | null};

// null: not found; the HUD shows —.
export type SessionInfo = {model: string | null; effort: string | null; context: ContextUsage | null};

export type SessionContext = {
	cwd: string;
	// Our pinned conversation id (@ap-agent-session), if any.
	sessionId: string | null;
	// The agent process in the session's pane; 0 or null when unknown.
	pid: number | null;
};

// SPEC 6.4.
export type AgentAdapter = {
	id: AgentId;
	displayName: string;
	// Relative to the working folder; the first one is the name shown when none exists.
	rulesFiles: readonly string[];
	// The program looked up on PATH (and platform.binDirs) before launching.
	binary: string;
	// The agent accepts a conversation id chosen by us, so its log can be found.
	pinsSessionId: boolean;
	// argv[0] is the bare binary name; the caller swaps in the resolved path.
	launchCommand(opts: {cwd: string; sessionId: string | null}): string[];
	// Recognises the agent in a process listing (external sessions, ports).
	matchProcess(commandLine: string): boolean;
	// null: the screen is not one the adapter recognises; the caller then
	// falls back to "the screen is still changing" (SPEC 5.3 step 4).
	classify(screen: string): ScreenState | null;
	// The agent stopped itself after ctrl+z and waits for SIGCONT (SPEC 5.3).
	isSuspended(screen: string): boolean;
	// SPEC 5.7: presence only; never read or keep a credential's value.
	// null: not checked for this agent; left out of the top bar.
	accountStatus(fs: HostFs): AccountStatus | null;
	mcpServers(fs: HostFs, cwd: string): string[] | null;
	skillsCount(fs: HostFs, cwd: string): number | null;
	// Model name (or its prefix) → context window in tokens; the config
	// file's `contextWindows` overrides it (SPEC 5.6).
	contextWindows: Readonly<Record<string, number>>;
	sessionInfo(fs: HostFs, ctx: SessionContext): SessionInfo;
};
