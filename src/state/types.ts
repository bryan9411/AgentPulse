import type {Config} from '../config/config.ts';

export type Project = {path: string; name: string};

// Filled in by M2 from tmux metadata; M1 only needs the shape for rows.
export type SessionSummary = {id: string; project: string; branch: string; agent: string};

export type Row =
	| {kind: 'project'; key: string; project: Project; count: number; expanded: boolean}
	| {kind: 'session'; key: string; session: SessionSummary};

export type Dialog = {kind: 'add-project'; value: string; error: string | null; busy: boolean};

export type WindowSize = {columns: number; rows: number};

export type AppState = {
	config: Config;
	projects: Project[];
	sessions: SessionSummary[];
	collapsed: string[];
	selected: string | null;
	dialog: Dialog | null;
	focus: 'list' | 'ai';
	zoomed: boolean;
	window: WindowSize | null;
	// One line shown above the key hints, e.g. an invalid config file.
	notice: string | null;
};
