// openUrl, listeningPorts and processTree join this interface in M4/M6.
export type Platform = {
	id: 'darwin' | 'wsl';
	binDirs: readonly string[];
	// Fire-and-forget system notification; false when it could not be sent.
	notify(title: string, body: string): Promise<boolean>;
};
