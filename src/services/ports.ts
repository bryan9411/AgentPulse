import type {ListeningPort, ProcessEntry} from '../infra/platform/types.ts';

// Every process below `root`, not counting root itself: the AI's own
// sockets (e.g. an IDE bridge) are not the user's dev server.
export function descendants(root: number, tree: readonly ProcessEntry[]): Set<number> {
	const children = new Map<number, number[]>();
	for (const p of tree) {
		const list = children.get(p.ppid) ?? [];
		list.push(p.pid);
		children.set(p.ppid, list);
	}
	const out = new Set<number>();
	const stack = [...(children.get(root) ?? [])];
	while (stack.length > 0) {
		const pid = stack.pop()!;
		if (out.has(pid)) continue;
		out.add(pid);
		stack.push(...(children.get(pid) ?? []));
	}
	return out;
}

const MENTION = /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})\b/g;

export type PortInputs = {
	root: number;
	// Every session's AI process: their own sockets are never a dev server,
	// even when another session's AI works in the same folder.
	agents: ReadonlySet<number>;
	folder: string;
	tree: readonly ProcessEntry[];
	listening: readonly ListeningPort[];
	// Working folder of listening processes.
	cwds: ReadonlyMap<number, string>;
	screen: string | null;
};

const inside = (path: string, folder: string) => path === folder || path.startsWith(folder.endsWith('/') ? folder : `${folder}/`);

// SPEC 5.5: ports opened by the session's process tree; by a process working
// inside the session's folder (a server started with `&` is re-parented to
// launchd once its shell exits, M4); and any localhost:<port> on its screen
// that something is actually listening on.
export function sessionPorts({root, agents, folder, tree, listening, cwds, screen}: PortInputs): number[] {
	const ports = new Set<number>();
	const mine = root > 0 ? descendants(root, tree) : new Set<number>();
	for (const l of listening) {
		if (l.pid === root || agents.has(l.pid)) continue;
		const cwd = cwds.get(l.pid);
		if (mine.has(l.pid) || (cwd !== undefined && folder !== '' && inside(cwd, folder))) ports.add(l.port);
	}
	if (screen) {
		const open = new Set(listening.map(l => l.port));
		for (const m of screen.matchAll(MENTION)) {
			const port = Number(m[1]);
			if (open.has(port)) ports.add(port);
		}
	}
	return [...ports].sort((a, b) => a - b);
}
