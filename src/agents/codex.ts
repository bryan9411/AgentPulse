import {commandHasProgram} from './match.ts';
import {lastNonEmpty, screenLines} from './screen.ts';
import type {AgentAdapter, ScreenState} from './types.ts';

// 未實測：開發機尚未安裝 Codex CLI，規則僅依公開原始碼與文件推斷
const APPROVAL = /Would you like to (?:run|make|apply)\b|Allow command\?/;
const BUSY_HINT = /\besc to interrupt\b/i;

function classify(screen: string): ScreenState | null {
	const lines = screenLines(screen);
	if (lastNonEmpty(lines, 12).some(line => APPROVAL.test(line))) return 'needs-approval';
	if (lastNonEmpty(lines, 6).some(line => BUSY_HINT.test(line))) return 'running';
	return null;
}

export const codex: AgentAdapter = {
	id: 'codex',
	displayName: 'Codex CLI',
	rulesFiles: ['AGENTS.md'],
	binary: 'codex',
	pinsSessionId: false,
	launchCommand: () => ['codex'],
	matchProcess: line => commandHasProgram(line, ['codex']),
	classify,
	// 未實測：未知 Codex 是否會因 ctrl+z 暫停
	isSuspended: () => false,
	// 暫緩實作：尚未接上 Codex 資料來源
	accountStatus: () => null,
	mcpServers: () => null,
	skillsCount: () => null,
	contextWindows: {},
	sessionInfo: () => ({model: null, effort: null, context: null}),
};
