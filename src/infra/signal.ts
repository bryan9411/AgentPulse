// tmux hooks run `kill -USR1 <sidebar pid>` to ask for an immediate refresh
// of focus and pane sizes instead of waiting for the next poll.
export function onRefreshSignal(handler: () => void): () => void {
	process.on('SIGUSR1', handler);
	return () => {
		process.off('SIGUSR1', handler);
	};
}
