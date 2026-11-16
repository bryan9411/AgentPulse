export type ListeningPort = {pid: number; port: number};
export type ProcessEntry = {pid: number; ppid: number; command: string};

export type Platform = {
	id: 'darwin' | 'wsl';
	binDirs: readonly string[];
	notify(title: string, body: string): Promise<boolean>;
	// 查詢失敗時回傳 null，讓呼叫端沿用上一次結果
	listeningPorts(): Promise<ListeningPort[] | null>;
	processTree(): Promise<ProcessEntry[] | null>;
	processCwds(pids: readonly number[]): Promise<Map<number, string>>;
	// 檢查程序在系統中的狀態是否為暫停（例如 ctrl+z / SIGTSTP）
	isProcessStopped(pid: number): Promise<boolean>;
	openUrl(url: string): Promise<boolean>;
	loginShellPath(): Promise<string | null>;
};
