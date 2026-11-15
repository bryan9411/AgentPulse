import {aider} from './aider.ts';
import {claude} from './claude.ts';
import {codex} from './codex.ts';
import {gemini} from './gemini.ts';
import type {AgentAdapter, AgentId} from './types.ts';

export type {AgentAdapter, AgentId} from './types.ts';

// Order is the order shown in the new-session dialog.
export const AGENTS: readonly AgentAdapter[] = [claude, codex, gemini, aider];

export function getAgent(id: string): AgentAdapter | null {
	return AGENTS.find(agent => agent.id === id) ?? null;
}

export function isAgentId(id: string): id is AgentId {
	return getAgent(id) !== null;
}
