import type {Config} from '../config/config.ts';
import type {Message} from '../i18n/strings.ts';
import type {AccountMark} from '../services/accounts.ts';
import type {Conflict} from '../services/conflictRadar.ts';
import type {SessionDetails} from '../services/details.ts';
import type {SessionStatus} from '../services/status/machine.ts';
import type {MergeOutcome, MergePlan} from '../services/worktree.ts';

// Re-exported so ui/ reads these shapes from state/ only.
export type {Conflict} from '../services/conflictRadar.ts';
export type {MergeOutcome, MergePlan} from '../services/worktree.ts';

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
	// Made with `w` (@ap-worktree), and the branch it merges back into (@ap-base).
	worktree: boolean;
	base: string;
};

export type Row =
	// `conflict`: two of its branches touch the same file (SPEC 5.10).
	| {kind: 'project'; key: string; project: Project; count: number; expanded: boolean; conflict: boolean}
	| {kind: 'session'; key: string; session: SessionSummary};

export type AgentOption = {id: string; name: string; installed: boolean};

type DialogBase = {error: Message | null; busy: boolean};

export type AddProjectDialog = DialogBase & {kind: 'add-project'; value: string};
export type RemoveProjectDialog = DialogBase & {kind: 'remove-project'; project: Project; sessionCount: number};
export type NewSessionDialog = DialogBase & {kind: 'new-session'; project: string; options: AgentOption[]; index: number};
export type CloseSessionDialog = DialogBase & {kind: 'close-session'; session: SessionSummary};
// SPEC 5.9. `base` is null until the main folder's branch has been read.
export type WorktreeDialog = DialogBase & {
	kind: 'worktree';
	project: string;
	base: string | null;
	value: string;
	options: AgentOption[];
	index: number;
};
// One dialog for the whole merge: checking (no plan yet), refused
// (`blocked`), waiting for enter (`plan`), then what happened (`outcome`).
export type MergeDialog = DialogBase & {
	kind: 'merge';
	session: SessionSummary;
	plan: MergePlan | null;
	blocked: Message | null;
	// The commit message, asked for only when the plan has changes to commit.
	value: string;
	outcome: MergeOutcome | null;
};
export type OpenUrlDialog = DialogBase & {kind: 'open-url'; ports: number[]; index: number};

export type Dialog = AddProjectDialog | RemoveProjectDialog | NewSessionDialog | CloseSessionDialog | WorktreeDialog | MergeDialog | OpenUrlDialog;

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
	notice: Message | null;
	// The answer to the last key (nothing to show, merged…); gone on the next key.
	flash: Message | null;
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
	// SPEC 5.10, keyed by project path; only projects with a conflict.
	conflicts: Record<string, Conflict[]>;
};
