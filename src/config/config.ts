import {homedir} from 'node:os';
import {join} from 'node:path';
import {readText, writeTextAtomic} from '../infra/fsx.ts';
import {DEFAULT_LANG, isLang, type Lang} from '../i18n/strings.ts';

export type GlyphMode = 'unicode' | 'ascii';

export type Config = {
	projects: string[];
	sidebarWidth: number;
	notifications: boolean;
	glyphs: GlyphMode;
	keys: {back: string};
	contextWarnAt: number;
	contextWindows: Record<string, number>;
	language: Lang;
};

export const DEFAULT_CONFIG: Config = {
	projects: [],
	sidebarWidth: 36,
	notifications: true,
	glyphs: 'unicode',
	keys: {back: 'C-q'},
	contextWarnAt: 80,
	contextWindows: {},
	language: DEFAULT_LANG,
};

export function configDir(home = homedir()): string {
	return join(home, '.config', 'agentpulse');
}

export function configFile(dir: string): string {
	return join(dir, 'config.json');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown, fallback: number, min: number, max: number) =>
	typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

// Hand-edited files are expected; a wrong field falls back to its default
// instead of rejecting the whole file.
export function normalizeConfig(raw: unknown): Config {
	const d = DEFAULT_CONFIG;
	if (!isRecord(raw)) return structuredClone(d);
	const projects = Array.isArray(raw.projects)
		? [...new Set(raw.projects.filter((p): p is string => typeof p === 'string' && p.startsWith('/')))]
		: [];
	const keys = isRecord(raw.keys) ? raw.keys : {};
	const windows: Record<string, number> = {};
	if (isRecord(raw.contextWindows)) {
		for (const [model, size] of Object.entries(raw.contextWindows)) {
			if (typeof size === 'number' && size > 0) windows[model] = size;
		}
	}
	return {
		projects,
		sidebarWidth: Math.round(num(raw.sidebarWidth, d.sidebarWidth, 20, 80)),
		notifications: bool(raw.notifications, d.notifications),
		glyphs: raw.glyphs === 'ascii' ? 'ascii' : 'unicode',
		keys: {back: typeof keys.back === 'string' && keys.back.trim() ? keys.back.trim() : d.keys.back},
		contextWarnAt: Math.round(num(raw.contextWarnAt, d.contextWarnAt, 1, 100)),
		contextWindows: windows,
		language: isLang(raw.language) ? raw.language : d.language,
	};
}

export type LoadResult =
	| {status: 'ok' | 'created'; config: Config}
	// The file is kept untouched so the user's edits are not lost; saving is
	// refused until it parses again.
	| {status: 'invalid'; config: Config; error: string};

export function loadConfig(dir: string): LoadResult {
	const file = configFile(dir);
	const text = readText(file);
	if (text === null) {
		const config = structuredClone(DEFAULT_CONFIG);
		writeTextAtomic(file, serialize(config));
		return {status: 'created', config};
	}
	try {
		return {status: 'ok', config: normalizeConfig(JSON.parse(text))};
	} catch (error) {
		return {status: 'invalid', config: structuredClone(DEFAULT_CONFIG), error: `config.json: ${String(error)}`};
	}
}

export function saveConfig(dir: string, config: Config): void {
	writeTextAtomic(configFile(dir), serialize(config));
}

function serialize(config: Config): string {
	return `${JSON.stringify(config, null, 2)}\n`;
}

export function withProject(config: Config, path: string): Config {
	if (config.projects.includes(path)) return config;
	return {...config, projects: [...config.projects, path]};
}

export function withoutProject(config: Config, path: string): Config {
	if (!config.projects.includes(path)) return config;
	return {...config, projects: config.projects.filter(p => p !== path)};
}
