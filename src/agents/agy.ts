import {join} from 'node:path';
import {countSkills, envSet, keysOf, readJson, stringField} from './files.ts';
import {commandHasProgram} from './match.ts';
import {findInputBox, lastNonEmpty, screenLines} from './screen.ts';
import type {AccountStatus, AgentAdapter, HostFs, ScreenState, SessionInfo} from './types.ts';

// Antigravity CLI 1.5.9, a native binary installed to ~/.local/bin. The
// rules come from screens captured from it (tests/fixtures/agy/) unless
// marked "not tested".

const PROMPT = '>';

// Trust and command-permission dialogs replace the input box and list
// their keys at the bottom.
const DIALOG_HINT = /↑\/↓ Navigate/;

// The footer reads "esc to cancel" while a turn runs. Dialogs show it too,
// which is why they are checked first.
const BUSY_HINT = /^esc to cancel\b/;

// Not tested: no error screen was captured, so errors are not recognised
// and an agy that failed shows as idle.
function classify(screen: string): ScreenState | null {
	const lines = screenLines(screen);
	const box = findInputBox(lines, PROMPT);
	if (!box) return lastNonEmpty(lines, 4).some(line => DIALOG_HINT.test(line)) ? 'needs-approval' : null;
	if (box.footer.some(line => BUSY_HINT.test(line))) return 'running';
	return 'idle';
}

// The status row under the input box always carries right-aligned model
// info, so it is either indented or has a wide gap in the middle. Text typed
// while stopped is echoed raw below the box and has neither.
const STATUS_ROW = /^ {3,}\S|\S {3,}\S/;

// ctrl+z stops agy without printing anything; what is left is the input box
// with its status row gone.
function isSuspended(screen: string): boolean {
	const box = findInputBox(screenLines(screen), PROMPT);
	return box !== null && !box.footer.some(line => STATUS_ROW.test(line));
}

// ---- HUD data (SPEC 6.8). Paths come from strings in the 1.5.9 binary;
// settings.json `model` and oauth_creds.json were seen on this machine. ----

const geminiDir = (fs: HostFs) => join(fs.home, '.gemini');

function accountStatus(fs: HostFs): AccountStatus {
	if (envSet(fs, 'GEMINI_API_KEY')) return 'signed-in';
	return fs.exists(join(geminiDir(fs), 'oauth_creds.json')) ? 'signed-in' : 'not-set';
}

function mcpServers(fs: HostFs): string[] | null {
	const path = join(geminiDir(fs), 'config', 'mcp_config.json');
	// agy leaves this file empty until a server is added.
	if ((fs.readText(path) ?? '').trim() === '') return [];
	const json = readJson(fs, path);
	return json === null ? null : keysOf(json, 'mcpServers');
}

function skillsCount(fs: HostFs, cwd: string): number {
	return countSkills(fs, [join(geminiDir(fs), 'config', 'skills'), join(cwd, '.agents', 'skills')]);
}

// The setting reads like "Gemini 4 Hydrogen (Medium)": the level in brackets.
export function splitAgyModel(value: string | null): SessionInfo {
	if (!value) return {model: null, effort: null};
	const m = /^(.*\S)\s*\(([^()]+)\)$/.exec(value.trim());
	return m ? {model: m[1] ?? null, effort: m[2] ?? null} : {model: value.trim(), effort: null};
}

// Not tested: whether a model switched inside a running agy is written back
// here at once; the file holds the last choice.
function sessionInfo(fs: HostFs): SessionInfo {
	return splitAgyModel(stringField(readJson(fs, join(geminiDir(fs), 'antigravity-cli', 'settings.json')), 'model'));
}

export const agy: AgentAdapter = {
	id: 'agy',
	displayName: 'Antigravity CLI',
	// The 1.5.9 binary's own docs say both are read.
	rulesFiles: ['GEMINI.md', 'AGENTS.md'],
	binary: 'agy',
	pinsSessionId: false,
	launchCommand: () => ['agy'],
	matchProcess: line => commandHasProgram(line, ['agy']),
	classify,
	isSuspended,
	accountStatus,
	mcpServers,
	skillsCount,
	sessionInfo,
};
