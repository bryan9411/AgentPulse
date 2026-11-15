// Agents installed through npm run as `node /path/to/bin/<name>` (or the
// package's own entry file), so a match looks at every token, not just argv[0].
export function commandHasProgram(commandLine: string, names: readonly string[]): boolean {
	const tokens = commandLine.trim().split(/\s+/).slice(0, 3);
	return tokens.some(token => {
		const base = token.split('/').pop() ?? '';
		return names.includes(base.replace(/\.(c|m)?js$/, ''));
	});
}
