import type {ListeningPort, ProcessEntry} from '../infra/platform/types.ts';

// 取出 root 底下的所有子程序，但不包含 root 本身（排除 AI 自身開的 IDE bridge 等連線）
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
	// 所有工作階段的 AI 主程序 PID，避免把同資料夾內另一家 AI 的 socket 誤當成網頁伺服器
	agents: ReadonlySet<number>;
	folder: string;
	tree: readonly ProcessEntry[];
	listening: readonly ListeningPort[];
	cwds: ReadonlyMap<number, string>;
	screen: string | null;
};

const inside = (path: string, folder: string) => path === folder || path.startsWith(folder.endsWith('/') ? folder : `${folder}/`);

// 同時檢查子程序樹、工作目錄位於專案內的背景程序（例如用 & 啟動後被 launchd 收養的伺服器），
// 以及畫面上出現且確實有程序監聽中的 localhost:<port>
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
