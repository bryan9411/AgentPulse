import {join} from 'node:path';
import type {AgentAdapter, SessionInfo} from '../agents/types.ts';
import type {HostFs} from '../infra/fsx.ts';
import type {GitStats} from '../infra/git.ts';

// Slow-changing environment of a working folder (SPEC 6.6: every 60 s).
export type AgentFacts = {
	mcp: string[] | null;
	skills: number | null;
	rules: {name: string; present: boolean} | null;
};

// What the HUD knows about one session, filled in by separate pollers;
// a missing field has not been read yet.
export type SessionDetails = {
	info?: SessionInfo;
	facts?: AgentFacts;
	git?: GitStats | null;
	gitAt?: number;
	ports?: number[];
};

export function rulesPresence(adapter: AgentAdapter, fs: HostFs, cwd: string): AgentFacts['rules'] {
	const [first] = adapter.rulesFiles;
	if (!first) return null;
	const found = adapter.rulesFiles.find(name => fs.exists(join(cwd, name)));
	// `.claude/CLAUDE.md` is still reported under the plain file name.
	return found ? {name: found.split('/').pop() ?? found, present: true} : {name: first, present: false};
}

export function readFacts(adapter: AgentAdapter, fs: HostFs, cwd: string): AgentFacts {
	return {
		mcp: adapter.mcpServers(fs, cwd),
		skills: adapter.skillsCount(fs, cwd),
		rules: rulesPresence(adapter, fs, cwd),
	};
}

// SPEC 6.6: the selected session every 5 s, the others every 30 s.
export const GIT_SELECTED_MS = 5000;
export const GIT_OTHERS_MS = 30_000;

export function gitDue(details: SessionDetails | undefined, selected: boolean, now: number): boolean {
	const last = details?.gitAt;
	if (last === undefined) return true;
	return now - last >= (selected ? GIT_SELECTED_MS : GIT_OTHERS_MS) - 100;
}
