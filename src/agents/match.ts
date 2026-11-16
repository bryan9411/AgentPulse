// 透過 npm 安裝的 AI 常會以 `node /path/to/bin/<name>` 形式執行，所以需檢查前幾個 token 而非只看 argv[0]
export function commandHasProgram(commandLine: string, names: readonly string[]): boolean {
	const tokens = commandLine.trim().split(/\s+/).slice(0, 3);
	return tokens.some(token => {
		const base = token.split('/').pop() ?? '';
		return names.includes(base.replace(/\.(c|m)?js$/, ''));
	});
}
