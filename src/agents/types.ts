export type AgentId = 'claude' | 'codex' | 'agy';

export type AgentState = 'running' | 'needs-approval' | 'idle' | 'done' | 'error';

// What a single screen can show. `done` needs history (was it running, has
// the user looked since), so the status machine decides it, not the adapter.
export type ScreenState = Exclude<AgentState, 'done'>;

// SPEC 6.4. The HUD data sources join this interface in M4–M5.
export type AgentAdapter = {
	id: AgentId;
	displayName: string;
	rulesFile: string | null;
	// The program looked up on PATH (and platform.binDirs) before launching.
	binary: string;
	// argv[0] is the bare binary name; the caller swaps in the resolved path.
	launchCommand(opts: {cwd: string}): string[];
	// Recognises the agent in a process listing (external sessions, ports).
	matchProcess(commandLine: string): boolean;
	// null: the screen is not one the adapter recognises; the caller then
	// falls back to "the screen is still changing" (SPEC 5.3 step 4).
	classify(screen: string): ScreenState | null;
	// The agent stopped itself after ctrl+z and waits for SIGCONT (SPEC 5.3).
	isSuspended(screen: string): boolean;
};
