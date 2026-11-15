import {claude} from './claude.ts';
import {codex} from './codex.ts';
import {agy} from './agy.ts';
import type {AgentAdapter, AgentId} from './types.ts';

export type {AgentAdapter, AgentId} from './types.ts';

// Order is the order shown in the new-session dialog.
export const AGENTS: readonly AgentAdapter[] = [claude, codex, agy];

export function getAgent(id: string): AgentAdapter | null {
	return AGENTS.find(agent => agent.id === id) ?? null;
}

export function isAgentId(id: string): id is AgentId {
	return getAgent(id) !== null;
}
