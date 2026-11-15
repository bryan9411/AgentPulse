import type {AgentState} from '../agents/types.ts';
import {MIN_WINDOW} from '../config/layout.ts';
import {involvedBranches, type Conflict} from '../services/conflictRadar.ts';
import {ALERT_STATES} from '../services/status/machine.ts';
import {worktreePath, worktreeRoot} from '../services/worktree.ts';
import type {AddProjectDialog, AppState, Dialog, MergeDialog, Project, Row, SessionSummary, WorktreeDialog} from './types.ts';

export const projectKey = (path: string) => `p:${path}`;
export const sessionKey = (id: string) => `s:${id}`;

// Before the first capture a live session counts as idle.
export function sessionState(state: AppState, session: SessionSummary): AgentState {
	return state.statuses[session.id]?.state ?? (session.dead ? (session.exitStatus === 0 ? 'done' : 'error') : 'idle');
}

export function needsUser(state: AppState, session: SessionSummary): boolean {
	return ALERT_STATES.includes(sessionState(state, session));
}

export function filterActive(state: AppState): boolean {
	return state.attentionOnly || state.filter.text.trim() !== '';
}

const contains = (text: string, needle: string) => text.toLowerCase().includes(needle);

// SPEC 5.8: the keyword matches the project name, branch or AI; `f` keeps
// only sessions waiting on the user. Both apply together.
function sessionVisible(state: AppState, project: Project, session: SessionSummary): boolean {
	const needle = state.filter.text.trim().toLowerCase();
	if (needle && !contains(project.name, needle) && !contains(session.branch, needle) && !contains(session.agent, needle)) {
		return false;
	}
	return !state.attentionOnly || needsUser(state, session);
}

export function visibleRows(state: AppState): Row[] {
	const rows: Row[] = [];
	const filtering = filterActive(state);
	const needle = state.filter.text.trim().toLowerCase();
	for (const project of state.projects) {
		const sessions = state.sessions.filter(s => s.project === project.path && sessionVisible(state, project, s));
		// While filtering, an empty group is only kept when its own name matched.
		if (filtering && sessions.length === 0 && (state.attentionOnly || !needle || !contains(project.name, needle))) continue;
		const expanded = !state.collapsed.includes(project.path);
		const conflict = (state.conflicts[project.path]?.length ?? 0) > 0;
		rows.push({kind: 'project', key: projectKey(project.path), project, count: sessions.length, expanded, conflict});
		if (!expanded) continue;
		for (const session of sessions) rows.push({kind: 'session', key: sessionKey(session.id), session});
	}
	return rows;
}

export function selectedIndex(state: AppState, rows = visibleRows(state)): number {
	return rows.findIndex(row => row.key === state.selected);
}

export function selectedRow(state: AppState): Row | null {
	const rows = visibleRows(state);
	return rows[selectedIndex(state, rows)] ?? null;
}

export function sessionCount(state: AppState): number {
	return state.sessions.length;
}

export function windowTooSmall(state: AppState): boolean {
	const w = state.window;
	return w !== null && (w.columns < MIN_WINDOW.columns || w.rows < MIN_WINDOW.rows);
}

// SPEC 5.8: 0 for a session that is the only one of its project, branch and
// AI; otherwise its place by creation (1, 2, 3…), shown from 2 on as "#2".
export function sessionSeq(state: AppState, session: SessionSummary): number {
	const twins = state.sessions
		.filter(s => s.project === session.project && s.branch === session.branch && s.agent === session.agent)
		.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
	return twins.length < 2 ? 0 : twins.findIndex(s => s.id === session.id) + 1;
}

// "claude", or "claude #2" for the second of its kind.
export function agentLabel(state: AppState, session: SessionSummary): string {
	const seq = sessionSeq(state, session);
	return seq >= 2 ? `${session.agent} #${seq}` : session.agent;
}

export function selectedSession(state: AppState): SessionSummary | null {
	const row = selectedRow(state);
	return row?.kind === 'session' ? row.session : null;
}

// The session is in the AI pane and the keyboard is there: the user sees it
// (SPEC 5.3 "seen", 5.4 no notification).
export function isViewing(state: AppState, id: string): boolean {
	return state.focus === 'ai' && selectedSession(state)?.id === id;
}

export function isBlinking(state: AppState, id: string): boolean {
	return state.attention.includes(id) && !isViewing(state, id);
}

export type StatusCounts = Record<AgentState, number>;

export function statusCounts(state: AppState): StatusCounts {
	const counts: StatusCounts = {running: 0, 'needs-approval': 0, idle: 0, done: 0, error: 0};
	for (const session of state.sessions) counts[sessionState(state, session)]++;
	return counts;
}

// The project the cursor is in, from a group row or one of its sessions.
export function selectedProjectPath(state: AppState): string | null {
	const row = selectedRow(state);
	if (!row) return null;
	return row.kind === 'project' ? row.project.path : row.session.project;
}

// SPEC 5.10: the note under the list covers the cursor's project only.
export function selectedConflicts(state: AppState): readonly Conflict[] {
	const path = selectedProjectPath(state);
	return (path && state.conflicts[path]) || [];
}

// The heading's "N branches": every branch named in any of the conflicts.
export function conflictBranchCount(conflicts: readonly Conflict[]): number {
	return involvedBranches(conflicts);
}

// Dialogs with a text field. The merge dialog only has one while it waits
// for a commit message.
export function acceptsText(dialog: Dialog): dialog is AddProjectDialog | WorktreeDialog | MergeDialog {
	if (dialog.kind === 'merge') return dialog.plan !== null && dialog.plan.dirty > 0 && dialog.outcome === null && dialog.blocked === null;
	return dialog.kind === 'add-project' || dialog.kind === 'worktree';
}

// The merge dialog has nothing left to confirm: enter and esc both close it.
export function mergeSettled(dialog: MergeDialog): boolean {
	return dialog.blocked !== null || dialog.outcome !== null;
}

// Where `w` would put the folder for what has been typed so far. With
// nothing typed it is the parent folder, so the dialog keeps its height.
export function worktreeDialogPath(dialog: WorktreeDialog): string {
	return dialog.value.trim() ? worktreePath(dialog.project, dialog.value) : `${worktreeRoot(dialog.project)}/`;
}
