import {describe, expect, test} from 'bun:test';
import {padEnd, padStart, spread, truncate, truncateStart, width, wrap} from '../src/ui/text.ts';

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

describe('wrap', () => {
	test('breaks at spaces and never exceeds the width', () => {
		expect(wrap('If files conflict, the merge is undone', 16)).toEqual(['If files', 'conflict, the', 'merge is undone']);
		expect(wrap('short', 10)).toEqual(['short']);
		expect(wrap('', 10)).toEqual([]);
		expect(wrap('anything', 0)).toEqual([]);
	});

	test('a word wider than the line is cut by cell width', () => {
		expect(wrap('/w/shop-api.worktrees/feat/checkout', 12)).toEqual(['/w/shop-api.', 'worktrees/fe', 'at/checkout']);
		expect(wrap('專案原本的資料夾有還沒提交的修改', 10)).toEqual(['專案原本的', '資料夾有還', '沒提交的修', '改']);
		expect(wrap('已合併到 main，但清理停下來了', 12)).toEqual(['已合併到', 'main，但清理', '停下來了']);
		// 中文字之間可斷行，避免為了保護整段文字而把短英文單字硬擠成獨立一行
		expect(wrap('AI 在那個資料夾裡改，不會動到專案原本的資料夾。', 28)).toEqual(['AI 在那個資料夾裡改，不會動', '到專案原本的資料夾。']);
		expect(wrap('專案原本的資料夾要先切回 main（現在在 feat/x）。', 28)).toEqual(['專案原本的資料夾要先切回', 'main（現在在 feat/x）。']);
		expect(wrap('Folder already exists: /w/shop.worktrees/x', 24)).toEqual(['Folder already exists:', '/w/shop.worktrees/x']);
	});

	test('hanging indent leaves room on the lines after the first', () => {
		expect(wrap('5 delete branch feat/a-rather-long-name', 20, 2)).toEqual(['5 delete branch', 'feat/a-rather-long', '-name']);
		expect(wrap('aaa bbb ccc', 7, 2)).toEqual(['aaa bbb', 'ccc']);
	});

	test('every line fits for any width', () => {
		const samples = ['The main folder must be on main, but it is on feat/x. Switch it back first.', '專案原本的資料夾要先切回 main（現在在 feat/購物車）。', 'a  b   c'];
		for (const text of samples) {
			for (let size = 1; size <= 40; size++) {
				const lines = wrap(text, size);
				for (const line of lines) expect(width(line)).toBeLessThanOrEqual(Math.max(size, 2));
				expect(lines.join('').replaceAll(' ', '')).toBe(text.replaceAll(' ', ''));
			}
		}
	});
});
