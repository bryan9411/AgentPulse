import {shellQuote} from './tmux.ts';

export function isCompiled(): boolean {
	return Bun.main.startsWith('/$bunfs') || !/\.(tsx?|jsx?)$/.test(Bun.main);
}

// 供主程式與各浮動視窗子程序共用，無論開發模式或單一執行檔都能正確重新呼叫自己
export function selfCommand(role: string, args: readonly string[] = []): string {
	const base = isCompiled()
		? `${shellQuote(process.execPath)} --role=${role}`
		: `${shellQuote(process.execPath)} run ${shellQuote(Bun.main)} --role=${role}`;
	if (args.length === 0) return base;
	return `${base} ${args.map(shellQuote).join(' ')}`;
}

