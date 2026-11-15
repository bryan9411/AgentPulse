// tmux hooks run `kill -USR1 <sidebar pid>` to ask for an immediate refresh
// of focus and pane sizes instead of waiting for the next poll.
export function onRefreshSignal(handler: () => void): () => void {
	process.on('SIGUSR1', handler);
	return () => {
		process.off('SIGUSR1', handler);
	};
}

export type ContinueResult = 'group' | 'pid' | 'failed';

// Wakes an agent that stopped itself on ctrl+z (SPEC 5.3). The pane process
// leads its own process group; signalling the group also reaches the agent
// when a wrapper did not exec into it. Not an external program, so this is
// not routed through exec.ts.
export function continueProcessGroup(pid: number): ContinueResult {
	if (!Number.isInteger(pid) || pid <= 1) return 'failed';
	try {
		process.kill(-pid, 'SIGCONT');
		return 'group';
	} catch {
		try {
			process.kill(pid, 'SIGCONT');
			return 'pid';
		} catch {
			return 'failed';
		}
	}
}
