import {describe, expect, test} from 'bun:test';
import {enteredAlert, isStalled, nextStatus, STALL_MS, type Observation, type SessionStatus} from '../src/services/status/machine.ts';
import {notificationText, resumeAllowed, shouldNotify} from '../src/services/status/notify.ts';
import {createScheduler, exclusive} from '../src/services/scheduler.ts';

const obs = (over: Partial<Observation>): Observation => ({
	dead: false,
	exitStatus: null,
	screenState: 'idle',
	screen: 'a',
	now: 0,
	seen: false,
	...over,
});

// Feeds observations one second apart and returns the states seen.
function run(steps: Array<Partial<Observation>>): SessionStatus[] {
	const out: SessionStatus[] = [];
	let prev: SessionStatus | null = null;
	steps.forEach((step, i) => {
		prev = nextStatus(prev, obs({now: i * 1000, ...step}));
		out.push(prev);
	});
	return out;
}

describe('status machine', () => {
	test('an exited pane is done on 0 and error otherwise, whatever the screen says', () => {
		expect(run([{dead: true, exitStatus: 0, screenState: 'running'}])[0]?.state).toBe('done');
		expect(run([{dead: true, exitStatus: 3}])[0]?.state).toBe('error');
	});

	test('adapter states pass straight through', () => {
		for (const s of ['running', 'needs-approval', 'error', 'idle'] as const) {
			expect(run([{screenState: s}])[0]?.state).toBe(s);
		}
	});

	test('a finished turn is done until the user looks, then idle', () => {
		const states = run([
			{screenState: 'running', screen: '1'},
			{screenState: 'idle', screen: '2'},
			{screenState: 'idle', screen: '2'},
			{screenState: 'idle', screen: '2', seen: true},
			{screenState: 'idle', screen: '2'},
		]).map(s => s.state);
		expect(states).toEqual(['running', 'done', 'done', 'idle', 'idle']);
	});

	test('finishing while being watched goes straight to idle', () => {
		const states = run([
			{screenState: 'running', screen: '1', seen: true},
			{screenState: 'idle', screen: '2', seen: true},
		]).map(s => s.state);
		expect(states).toEqual(['running', 'idle']);
	});

	test('a recognised idle screen that changes is still idle (typing in the box)', () => {
		const states = run([{screen: '1'}, {screen: '12'}, {screen: '123'}]).map(s => s.state);
		expect(states).toEqual(['idle', 'idle', 'idle']);
	});

	test('an unrecognised screen counts as running while it changes', () => {
		const states = run([
			{screenState: null, screen: '1'},
			{screenState: null, screen: '2'},
			{screenState: null, screen: '3'},
			{screenState: null, screen: '3'},
			{screenState: null, screen: '3'},
		]).map(s => s.state);
		// The first look has nothing to compare against.
		expect(states).toEqual(['idle', 'running', 'running', 'running', 'done']);
	});

	test('approval wins over a blinking screen', () => {
		const states = run([
			{screenState: 'needs-approval', screen: 'a'},
			{screenState: 'needs-approval', screen: 'b'},
		]).map(s => s.state);
		expect(states).toEqual(['needs-approval', 'needs-approval']);
	});

	test('since moves only when the state changes', () => {
		const [a, b, c] = run([{screenState: 'running'}, {screenState: 'running', screen: 'b'}, {screenState: 'idle'}]);
		expect(a?.since).toBe(0);
		expect(b?.since).toBe(0);
		expect(c?.since).toBe(2000);
	});

	test('stalled only when running and the screen froze for 180 s', () => {
		const running: SessionStatus = {state: 'running', screen: 'x', changedAt: 0, since: 0};
		expect(isStalled(running, STALL_MS)).toBe(false);
		expect(isStalled(running, STALL_MS + 1)).toBe(true);
		expect(isStalled({...running, state: 'idle'}, STALL_MS * 10)).toBe(false);
		expect(isStalled({...running, state: 'needs-approval'}, STALL_MS * 10)).toBe(false);
	});

	test('alerts fire on entering approval or error, not on the first look', () => {
		const idle: SessionStatus = {state: 'idle', screen: 'x', changedAt: 0, since: 0};
		const approval: SessionStatus = {...idle, state: 'needs-approval'};
		expect(enteredAlert(null, approval)).toBe(false);
		expect(enteredAlert(idle, approval)).toBe(true);
		expect(enteredAlert(approval, approval)).toBe(false);
		expect(enteredAlert(idle, {...idle, state: 'error'})).toBe(true);
		expect(enteredAlert(idle, {...idle, state: 'done'})).toBe(false);
		expect(enteredAlert(idle, {...idle, state: 'running'})).toBe(false);
	});
});

describe('notifications', () => {
	const check = {id: 's1', state: 'needs-approval' as const, now: 0, viewing: false, enabled: true};

	test('same session and state is sent once per 30 s', () => {
		const log = new Map<string, number>();
		expect(shouldNotify(log, check)).toBe(true);
		expect(shouldNotify(log, {...check, now: 29_999})).toBe(false);
		expect(shouldNotify(log, {...check, state: 'error', now: 1000})).toBe(true);
		expect(shouldNotify(log, {...check, id: 's2', now: 1000})).toBe(true);
		expect(shouldNotify(log, {...check, now: 30_000})).toBe(true);
	});

	test('not while watching it, and not when turned off', () => {
		const log = new Map<string, number>();
		expect(shouldNotify(log, {...check, viewing: true})).toBe(false);
		expect(shouldNotify(log, {...check, enabled: false})).toBe(false);
		// Skipped sends do not start the 30 s window.
		expect(shouldNotify(log, check)).toBe(true);
	});

	test('text names the branch, project and AI', () => {
		const text = notificationText({branch: 'feat/購物車', agent: 'claude'}, '商店-api', 'needs-approval');
		expect(text.title).toBe('AgentPulse · 商店-api');
		expect(text.body).toBe('feat/購物車 · claude needs your approval');
		expect(notificationText({branch: 'main', agent: 'agy'}, 'x', 'error').body).toContain('error');
		expect(notificationText({branch: 'main', agent: 'agy'}, 'x', 'error', 'zh-TW').body).toBe('main · agy 出錯停下來了');
		expect(notificationText({branch: 'main', agent: 'agy'}, 'x', 'needs-approval', 'zh-TW').body).toBe('main · agy 在等你同意');
	});

	test('SIGCONT at most once per session every 3 s', () => {
		const sent = new Map<string, number>();
		expect(resumeAllowed(sent, 'a', 0)).toBe(true);
		expect(resumeAllowed(sent, 'a', 2999)).toBe(false);
		expect(resumeAllowed(sent, 'b', 100)).toBe(true);
		expect(resumeAllowed(sent, 'a', 3000)).toBe(true);
	});
});

describe('scheduler', () => {
	test('a job still running skips the next round instead of stacking', async () => {
		let calls = 0;
		let release = () => {};
		const job = exclusive('slow', async () => {
			calls++;
			await new Promise<void>(resolve => {
				release = resolve;
			});
		}, () => {});
		const first = job();
		await job();
		await job();
		expect(calls).toBe(1);
		release();
		await first;
		const again = job();
		release();
		await again;
		expect(calls).toBe(2);
	});

	test('errors are reported and do not stop later rounds', async () => {
		const errors: string[] = [];
		let n = 0;
		const scheduler = createScheduler(name => errors.push(name));
		scheduler.every(5, 'flaky', async () => {
			n++;
			throw new Error('boom');
		});
		await Bun.sleep(40);
		scheduler.stop();
		const after = n;
		await Bun.sleep(20);
		expect(n).toBeGreaterThan(1);
		expect(n).toBe(after);
		expect(errors.every(e => e === 'flaky')).toBe(true);
	});
});
