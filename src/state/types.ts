import type {Config} from '../config/config.ts';
import type {Message} from '../i18n/strings.ts';
import type {AccountMark} from '../services/accounts.ts';
import type {SessionDetails} from '../services/details.ts';
import type {SessionStatus} from '../services/status/machine.ts';

export type Project = {path: string; name: string};

// 每次輪詢從 tmux metadata 讀回的工作階段資料
export type SessionSummary = {
	id: string;
	project: string;
	cwd: string;
	branch: string;
	agent: string;
	dead: boolean;
	exitStatus: number | null;
	created: number;
	// 我們指定給 AI 的對話 ID（未指定時為空字串）
	agentSession: string;
};

export type Row =
	| {kind: 'project'; key: string; project: Project; branch: string | null; count: number; expanded: boolean}
	| {kind: 'session'; key: string; session: SessionSummary};

export type AgentOption = {id: string; name: string; installed: boolean; signedIn: boolean | null};

type DialogBase = {error: Message | null; busy: boolean};

export type AddProjectDialog = DialogBase & {kind: 'add-project'; value: string};
export type RemoveProjectDialog = DialogBase & {kind: 'remove-project'; project: Project; sessionCount: number};
export type NewSessionDialog = DialogBase & {
	kind: 'new-session';
	project: string;
	branch: string;
	options: AgentOption[];
	index: number;
};
export type CloseSessionDialog = DialogBase & {
	kind: 'close-session';
	session: SessionSummary;
};
export type OpenUrlDialog = DialogBase & {kind: 'open-url'; ports: number[]; index: number};

export type Dialog = AddProjectDialog | RemoveProjectDialog | NewSessionDialog | CloseSessionDialog | OpenUrlDialog;

export type WindowSize = {columns: number; rows: number};

export type AppState = {
	config: Config;
	projects: Project[];
	projectBranches: Record<string, string | null>;
	sessions: SessionSummary[];
	sessionsLoaded: boolean;
	collapsed: string[];
	selected: string | null;
	dialog: Dialog | null;
	focus: 'list' | 'ai';
	zoomed: boolean;
	window: WindowSize | null;
	// 常駐通知（例如設定檔格式錯誤），顯示於提示列上方
	notice: Message | null;
	// 上一個按鍵的一次性回饋，下次按鍵時清除
	flash: Message | null;
	statuses: Record<string, SessionStatus>;
	// 進入等待授權或錯誤且使用者尚未切過去查看、需要閃爍提醒的工作階段 ID
	attention: string[];
	blinkOn: boolean;
	filter: {text: string; editing: boolean};
	attentionOnly: boolean;
	details: Record<string, SessionDetails>;
	accounts: AccountMark[];
};
