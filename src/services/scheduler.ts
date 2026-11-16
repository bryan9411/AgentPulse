export type Scheduler = {
	every(ms: number, name: string, task: () => Promise<void>): () => Promise<void>;
	stop(): void;
};

export type OnError = (name: string, error: unknown) => void;

// 同一任務上一輪還在跑時直接略過本輪，避免慢指令堆疊；也供單次觸發（如 tmux hook）共用互斥鎖
export function exclusive(name: string, task: () => Promise<void>, onError: OnError): () => Promise<void> {
	let running = false;
	return async () => {
		if (running) return;
		running = true;
		try {
			await task();
		} catch (error) {
			onError(name, error);
		} finally {
			running = false;
		}
	};
}

export function createScheduler(onError: OnError): Scheduler {
	const timers: Array<ReturnType<typeof setInterval>> = [];
	return {
		every(ms, name, task) {
			const run = exclusive(name, task, onError);
			timers.push(setInterval(() => void run(), ms));
			return run;
		},
		stop() {
			for (const timer of timers) clearInterval(timer);
			timers.length = 0;
		},
	};
}
