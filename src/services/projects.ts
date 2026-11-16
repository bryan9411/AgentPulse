import {loadConfig, saveConfig, withoutProject, withProject, type Config} from '../config/config.ts';
import {isDirectory, toAbsolute} from '../infra/fsx.ts';
import {projectRoot} from '../infra/git.ts';
import {msg, type Message} from '../i18n/strings.ts';

export type AddProjectResult = {ok: true; config: Config; path: string} | {ok: false; error: Message};
export type RemoveProjectResult = {ok: true; config: Config} | {ok: false; error: Message};

export async function addProject(input: string, configDir: string): Promise<AddProjectResult> {
	if (!input.trim()) return {ok: false, error: msg('enterPath')};
	const folder = toAbsolute(input);
	if (!isDirectory(folder)) return {ok: false, error: msg('folderNotFound')};
	const root = await projectRoot(folder);
	if (!root) return {ok: false, error: msg('notRepo')};
	return register(root, configDir);
}

export function removeProject(path: string, configDir: string): RemoveProjectResult {
	const loaded = loadConfig(configDir);
	if (loaded.status === 'invalid') return {ok: false, error: msg('configInvalidFix')};
	const next = withoutProject(loaded.config, path);
	if (next !== loaded.config) saveConfig(configDir, next);
	return {ok: true, config: next};
}

// Launching inside a repository registers it silently; anywhere else is a no-op.
export async function addProjectFromCwd(cwd: string, configDir: string): Promise<AddProjectResult | null> {
	const root = await projectRoot(cwd);
	return root ? register(root, configDir) : null;
}

function register(root: string, configDir: string): AddProjectResult {
	// Re-read so an edit made in another window is not overwritten.
	const loaded = loadConfig(configDir);
	if (loaded.status === 'invalid') return {ok: false, error: msg('configInvalidFix')};
	const next = withProject(loaded.config, root);
	if (next !== loaded.config) saveConfig(configDir, next);
	return {ok: true, config: next, path: root};
}
