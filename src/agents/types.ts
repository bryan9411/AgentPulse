export type AgentId = 'claude' | 'codex' | 'gemini' | 'aider';

// SPEC 6.4. Only the launch side exists so far; classify, isSuspended and
// the HUD data sources join this interface in M3–M5.
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
};
