// notify, openUrl, listeningPorts and processTree join this interface in M3/M4.
export type Platform = {
	id: 'darwin' | 'wsl';
	binDirs: readonly string[];
};
