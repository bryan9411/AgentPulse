import type {HostFs} from '../infra/fsx.ts';

export type {HostFs} from '../infra/fsx.ts';

export type AgentId = 'claude' | 'codex' | 'agy';

export type AgentState = 'running' | 'needs-approval' | 'idle' | 'done' | 'error';

// `done` 需要前後狀態比較（是否剛跑完且使用者還沒看過），由狀態機決定，不由 adapter 回傳
export type ScreenState = Exclude<AgentState, 'done'>;

export type AccountStatus = 'signed-in' | 'not-set';

// `used` 為最後一次請求的輸入 token；`base` 為第一次請求的輸入（含 system/tools/MCP），查不到時為 null
export type ContextUsage = {used: number; base: number | null};

export type SessionInfo = {model: string | null; effort: string | null; context: ContextUsage | null};

export type SessionContext = {
	cwd: string;
	sessionId: string | null;
	pid: number | null;
};

export type AgentAdapter = {
	id: AgentId;
	displayName: string;
	rulesFiles: readonly string[];
	binary: string;
	pinsSessionId: boolean;
	// 第一個元素回傳執行檔名稱，實際啟動時由呼叫端代換為完整路徑
	launchCommand(opts: {cwd: string; sessionId: string | null}): string[];
	// 重啟已結束的工作階段時使用（例如改用 --resume 而非重複傳 --session-id）
	restartCommand?(fs: HostFs, opts: {cwd: string; sessionId: string | null}): string[];
	matchProcess(commandLine: string): boolean;
	// 回傳 null 代表畫面不在預期樣式內，交由狀態機依畫面是否持續變化判定
	classify(screen: string): ScreenState | null;
	isSuspended(screen: string): boolean;
	// 只檢查憑證是否存在，絕不讀取、記錄或顯示金鑰內容；回傳 null 代表此 AI 不顯示於頂列
	accountStatus(fs: HostFs): AccountStatus | null;
	mcpServers(fs: HostFs, cwd: string): string[] | null;
	skillsCount(fs: HostFs, cwd: string): number | null;
	contextWindows: Readonly<Record<string, number>>;
	sessionInfo(fs: HostFs, ctx: SessionContext): SessionInfo;
};
