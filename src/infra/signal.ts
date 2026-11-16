// tmux hook 會以 `kill -USR1 <sidebar pid>` 通知介面立即重繪焦點與窗格大小，不必等下一次輪詢
export function onRefreshSignal(handler: () => void): () => void {
	process.on('SIGUSR1', handler);
	return () => {
		process.off('SIGUSR1', handler);
	};
}

export type ContinueResult = 'group' | 'pid' | 'failed';

// 喚醒被 ctrl+z 暫停的 AI：窗格程序本身是一個 process group 的 leader，
// 對整個群組送 SIGCONT 也能一併喚醒包在外層的 wrapper 或子程序
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
