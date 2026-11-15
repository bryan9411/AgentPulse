import {loadConfig, saveConfig, withProject, type Config} from '../config/config.ts';
import {isDirectory, toAbsolute} from '../infra/fsx.ts';
import {projectRoot} from '../infra/git.ts';

export type AddProjectResult = {ok: true; config: Config; path: string} | {ok: false; error: string};

export async function addProject(input: string, configDir: string): Promise<AddProjectResult> {
	if (!input.trim()) return {ok: false, error: 'Enter a folder path'};
	const folder = toAbsolute(input);
	if (!isDirectory(folder)) return {ok: false, error: 'Folder not found'};
	const root = await projectRoot(folder);
	if (!root) return {ok: false, error: 'Not a git repository'};
	return register(root, configDir);
}

// Launching inside a repository registers it silently; anywhere else is a no-op.
export async function addProjectFromCwd(cwd: string, configDir: string): Promise<AddProjectResult | null> {
	const root = await projectRoot(cwd);
	return root ? register(root, configDir) : null;
}

function register(root: string, configDir: string): AddProjectResult {
	// Re-read so an edit made in another window is not overwritten.
	const loaded = loadConfig(configDir);
	if (loaded.status === 'invalid') return {ok: false, error: 'config.json is invalid; fix it first'};
	const next = withProject(loaded.config, root);
	if (next !== loaded.config) saveConfig(configDir, next);
	return {ok: true, config: next, path: root};
}
