// SPEC 6.6. Each job runs on its own interval; a job still busy from the
// previous round skips this one instead of stacking up behind it.

export type Scheduler = {
	every(ms: number, name: string, task: () => Promise<void>): () => Promise<void>;
	stop(): void;
};

export type OnError = (name: string, error: unknown) => void;

// Exposed for one-off triggers (a tmux hook) that must also respect the lock.
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
