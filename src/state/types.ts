import type {Config} from '../config/config.ts';
import type {AccountMark} from '../services/accounts.ts';
import type {SessionDetails} from '../services/details.ts';
import type {SessionStatus} from '../services/status/machine.ts';

export type Project = {path: string; name: string};

// Read back from tmux metadata every poll (SPEC 5.1).
export type SessionSummary = {
	id: string;
	project: string;
	cwd: string;
	branch: string;
	agent: string;
	dead: boolean;
	exitStatus: number | null;
	// Epoch seconds (@ap-created).
	created: number;
	// The agent's own conversation id; '' when not pinned.
	agentSession: string;
};

export type Row =
	| {kind: 'project'; key: string; project: Project; count: number; expanded: boolean}
	| {kind: 'session'; key: string; session: SessionSummary};

export type AgentOption = {id: string; name: string; installed: boolean};

type DialogBase = {error: string | null; busy: boolean};

export type AddProjectDialog = DialogBase & {kind: 'add-project'; value: string};
export type NewSessionDialog = DialogBase & {kind: 'new-session'; project: string; options: AgentOption[]; index: number};
export type CloseSessionDialog = DialogBase & {kind: 'close-session'; session: SessionSummary};

export type Dialog = AddProjectDialog | NewSessionDialog | CloseSessionDialog;

export type WindowSize = {columns: number; rows: number};

export type AppState = {
	config: Config;
	projects: Project[];
	sessions: SessionSummary[];
	// False until the first successful read from tmux.
	sessionsLoaded: boolean;
	collapsed: string[];
	selected: string | null;
	dialog: Dialog | null;
	focus: 'list' | 'ai';
	zoomed: boolean;
	window: WindowSize | null;
	// One line shown above the key hints, e.g. an invalid config file.
	notice: string | null;
	// SPEC 5.3, keyed by session id; missing until the first capture.
	statuses: Record<string, SessionStatus>;
	// Sessions whose glyph blinks: entered needs-approval or error and the
	// user has not looked yet (SPEC 5.4).
	attention: string[];
	// Blink phase, toggled by a timer only while `attention` is non-empty.
	blinkOn: boolean;
	// SPEC 5.8: `/` keyword, `f` only sessions that need the user.
	filter: {text: string; editing: boolean};
	attentionOnly: boolean;
	// SPEC 5.5, keyed by session id; filled by the HUD pollers.
	details: Record<string, SessionDetails>;
	// SPEC 5.7; empty until the first check.
	accounts: AccountMark[];
};
