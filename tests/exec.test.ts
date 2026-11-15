import {describe, expect, test} from 'bun:test';
import {mkdtempSync, writeFileSync, chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createExecutor, exec, resolveBin} from '../src/infra/exec.ts';

describe('exec', () => {
	test('success returns stdout', async () => {
		const r = await exec(['sh', '-c', 'printf hi']);
		expect(r).toMatchObject({ok: true, stdout: 'hi', code: 0});
	});

	test('non-zero exit is classified as exit with the code', async () => {
		const r = await exec(['sh', '-c', 'echo boom >&2; exit 3']);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.kind).toBe('exit');
			expect(r.code).toBe(3);
			expect(r.message).toContain('boom');
		}
	});

	test('missing program is classified as not-found', async () => {
		const r = await exec(['/nonexistent/agentpulse-no-such-bin']);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.kind).toBe('not-found');
	});

	test('a slow program is killed and classified as timeout', async () => {
		const started = Date.now();
		const r = await exec(['sleep', '5'], {timeoutMs: 100});
		expect(Date.now() - started).toBeLessThan(2000);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.kind).toBe('timeout');
	});

	test('stdin is passed through', async () => {
		const r = await exec(['cat'], {stdin: '中文'});
		expect(r.ok && r.stdout).toBe('中文');
	});

	test('concurrency limit is respected', async () => {
		const ex = createExecutor(2);
		let peak = 0;
		const watcher = setInterval(() => {
			peak = Math.max(peak, ex.active);
		}, 5);
		await Promise.all(Array.from({length: 6}, () => ex.run(['sleep', '0.1'])));
		clearInterval(watcher);
		expect(peak).toBe(2);
		expect(ex.active).toBe(0);
	});

	test('resolveBin falls back to extra folders when PATH misses', () => {
		const dir = mkdtempSync(join(tmpdir(), 'ap-bin-'));
		const bin = join(dir, 'ap-fake-tool');
		writeFileSync(bin, '#!/bin/sh\n');
		chmodSync(bin, 0o755);
		expect(resolveBin('ap-fake-tool', [], '/nonexistent')).toBeNull();
		expect(resolveBin('ap-fake-tool', ['/nonexistent', dir], '/nonexistent')).toBe(bin);
	});
});
