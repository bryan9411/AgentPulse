export function screenLines(screen: string): string[] {
	const lines = screen.split('\n').map(line => line.trimEnd());
	while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
	return lines;
}

// 輸入框格線為連續長橫線（U+2500），避免誤判回覆內容中的短分隔線
export function isRule(line: string): boolean {
	return /^─{20,}$/.test(line);
}

export type InputBox = {
	top: number;
	bottom: number;
	footer: string[];
};

// 正常提示列只有 1～2 行；底下若超過這個行數通常是授權或提問選單而非輸入框
const MAX_FOOTER_LINES = 3;

function lastRuleBefore(lines: readonly string[], end: number): number {
	for (let i = end - 1; i >= 0; i--) if (isRule(lines[i] ?? '')) return i;
	return -1;
}

// 畫面中先前回顯的使用者訊息也可能有上下格線，因此只取最底部那一組作為輸入框
export function findInputBox(lines: readonly string[], prompt: string): InputBox | null {
	const bottom = lastRuleBefore(lines, lines.length);
	if (bottom < 1) return null;
	const footer = lines.slice(bottom + 1).filter(line => line.trim() !== '');
	if (footer.length > MAX_FOOTER_LINES) return null;
	const top = lastRuleBefore(lines, bottom);
	if (top < 0 || top + 1 >= bottom) return null;
	// Claude Code 在輸入框提示符號後放的是不換行空白（NBSP），回顯訊息則是普通空白
	const first = lines[top + 1] ?? '';
	if (first !== prompt && !first.startsWith(`${prompt} `) && !first.startsWith(`${prompt} `)) return null;
	return {top, bottom, footer};
}

export function lastNonEmpty(lines: readonly string[], count: number): string[] {
	return lines.filter(line => line.trim() !== '').slice(-count);
}
