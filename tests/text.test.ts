import {describe, expect, test} from 'bun:test';
import {padEnd, padStart, spread, truncate, truncateStart, width} from '../src/ui/text.ts';

describe('text', () => {
	test('width counts CJK as two cells and status glyphs as one', () => {
		expect(width('abc')).toBe(3);
		expect(width('修正')).toBe(4);
		expect(width('●◐○✓✕')).toBe(5);
	});

	test('truncate keeps the result within the limit', () => {
		expect(truncate('hello', 10)).toBe('hello');
		expect(truncate('hello world', 6)).toBe('hello…');
		expect(truncate('修正登入錯誤', 5)).toBe('修正…');
		expect(width(truncate('修正登入錯誤', 5))).toBe(5);
		expect(truncate('abc', 1)).toBe('…');
		expect(truncate('abc', 0)).toBe('');
	});

	test('a wide char that does not fit is replaced by padding, not split', () => {
		const out = padEnd('a修正', 4);
		expect(width(out)).toBe(4);
		expect(out).toBe('a修…');
		expect(width(padEnd('修正登入', 6))).toBe(6);
	});

	test('padEnd and padStart produce exact widths', () => {
		expect(padEnd('ab', 5)).toBe('ab   ');
		expect(padStart('ab', 5)).toBe('   ab');
		expect(width(padEnd('中文', 7))).toBe(7);
	});

	test('spread right-aligns and truncates the left side first', () => {
		expect(spread('left', 'r', 10)).toBe('left     r');
		expect(spread('a long left side', '42', 10)).toBe('a long… 42');
		expect(width(spread('分支名稱很長很長', '3', 10))).toBe(10);
		expect(spread('left', 'too wide', 5)).toBe('left ');
	});

	test('truncateStart keeps the end of a path', () => {
		expect(truncateStart('/Users/me/code/shop', 8)).toBe('…de/shop');
		expect(truncateStart('/文件/專案', 6)).toBe('…/專案');
		expect(truncateStart('short', 10)).toBe('short');
	});
});
