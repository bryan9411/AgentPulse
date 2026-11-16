import {join} from 'node:path';
import type {AgentAdapter, SessionInfo} from '../agents/types.ts';
import type {HostFs} from '../infra/fsx.ts';
import type {GitStats} from '../infra/git.ts';

export type AgentFacts = {
	mcp: string[] | null;
	skills: number | null;
	rules: {name: string; present: boolean} | null;
};

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
	// 像 `.claude/CLAUDE.md` 這類子目錄規範檔仍只顯示純檔名
	return found ? {name: found.split('/').pop() ?? found, present: true} : {name: first, present: false};
}

export function readFacts(adapter: AgentAdapter, fs: HostFs, cwd: string): AgentFacts {
	return {
		mcp: adapter.mcpServers(fs, cwd),
		skills: adapter.skillsCount(fs, cwd),
		rules: rulesPresence(adapter, fs, cwd),
	};
}

export const GIT_SELECTED_MS = 5000;
export const GIT_OTHERS_MS = 30_000;

export function gitDue(details: SessionDetails | undefined, selected: boolean, now: number): boolean {
	const last = details?.gitAt;
	if (last === undefined) return true;
	return now - last >= (selected ? GIT_SELECTED_MS : GIT_OTHERS_MS) - 100;
}
