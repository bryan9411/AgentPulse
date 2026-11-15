import {AGENTS} from '../agents/index.ts';
import type {HostFs} from '../infra/fsx.ts';

export type AccountMark = {id: string; signedIn: boolean | null};

// SPEC 5.7, every 60 s. An adapter that does not check (Codex for now)
// reports null and is left out of the top bar.
export function readAccounts(fs: HostFs): AccountMark[] {
	return AGENTS.map(agent => {
		const status = agent.accountStatus(fs);
		return {id: agent.id, signedIn: status === null ? null : status === 'signed-in'};
	});
}
