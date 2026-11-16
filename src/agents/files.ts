import {join} from 'node:path';
import type {HostFs} from '../infra/fsx.ts';

export function readJson(fs: HostFs, path: string): unknown {
	const text = fs.readText(path);
	if (text === null) return undefined;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function keysOf(obj: unknown, field: string): string[] {
	if (!isRecord(obj)) return [];
	const inner = obj[field];
	return isRecord(inner) ? Object.keys(inner) : [];
}

export function stringField(obj: unknown, field: string): string | null {
	if (!isRecord(obj)) return null;
	const value = obj[field];
	return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function countSkills(fs: HostFs, roots: readonly string[]): number {
	let n = 0;
	for (const root of roots) {
		for (const name of fs.listDir(root)) if (fs.exists(join(root, name, 'SKILL.md'))) n++;
	}
	return n;
}

export function envSet(fs: HostFs, name: string): boolean {
	const value = fs.env(name);
	return value !== undefined && value !== '';
}

export function unique(names: readonly string[]): string[] {
	return [...new Set(names)];
}
