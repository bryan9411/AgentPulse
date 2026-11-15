export type ListeningPort = {pid: number; port: number};
export type ProcessEntry = {pid: number; ppid: number; command: string};

export type Platform = {
	id: 'darwin' | 'wsl';
	binDirs: readonly string[];
	// Fire-and-forget system notification; false when it could not be sent.
	notify(title: string, body: string): Promise<boolean>;
	// null when the listing failed; the caller keeps its previous result.
	listeningPorts(): Promise<ListeningPort[] | null>;
	processTree(): Promise<ProcessEntry[] | null>;
	// Working folder of each given process; missing entries are unknown.
	processCwds(pids: readonly number[]): Promise<Map<number, string>>;
	// In the default browser; false when it could not be opened.
	openUrl(url: string): Promise<boolean>;
};
