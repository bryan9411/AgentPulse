import {join} from 'node:path';
import {countSkills, envSet, isRecord, keysOf, readJson, stringField} from './files.ts';
import {commandHasProgram} from './match.ts';
import {findInputBox, lastNonEmpty, screenLines} from './screen.ts';
import type {AccountStatus, AgentAdapter, HostFs, ScreenState, SessionInfo} from './types.ts';

const PROMPT = '>';

// 信任與指令授權選單會取代輸入框並在底部顯示操作提示
const DIALOG_HINT = /↑\/↓ Navigate/;

// 執行中與授權選單都會出現 "esc to cancel"，因此需先排除對話框再判斷是否執行中
const BUSY_HINT = /^esc to cancel\b/;

// 未實測：尚未取得 agy 錯誤畫面樣本，發生錯誤時會暫時顯示為 idle
function classify(screen: string): ScreenState | null {
	const lines = screenLines(screen);
	const box = findInputBox(lines, PROMPT);
	if (!box) return lastNonEmpty(lines, 4).some(line => DIALOG_HINT.test(line)) ? 'needs-approval' : null;
	if (box.footer.some(line => BUSY_HINT.test(line))) return 'running';
	return 'idle';
}

// 正常狀態列右側固定顯示模型名稱，必定有縮排或大段空白；暫停期間被直接印在框外的輸入字元則沒有
const STATUS_ROW = /^ {3,}\S|\S {3,}\S/;

// agy 收到 ctrl+z 暫停時不會印出訊息，只會讓輸入框底下的狀態列整行消失
function isSuspended(screen: string): boolean {
	const box = findInputBox(screenLines(screen), PROMPT);
	return box !== null && !box.footer.some(line => STATUS_ROW.test(line));
}

const geminiDir = (fs: HostFs) => join(fs.home, '.gemini');

function accountStatus(fs: HostFs): AccountStatus {
	if (envSet(fs, 'GEMINI_API_KEY')) return 'signed-in';
	if (fs.exists(join(geminiDir(fs), 'oauth_creds.json'))) return 'signed-in';
	// Antigravity CLI 登入後憑證由系統金鑰圈管理，改於 onboarding.json 標記完成狀態
	const onboarding = readJson(fs, join(geminiDir(fs), 'antigravity-cli', 'cache', 'onboarding.json'));
	if (
		isRecord(onboarding) &&
		(onboarding.onboardingComplete === true ||
			onboarding.consumerOnboardingComplete === true ||
			onboarding.enterpriseOnboardingComplete === true)
	) {
		return 'signed-in';
	}
	return 'not-set';
}

function mcpServers(fs: HostFs): string[] | null {
	const path = join(geminiDir(fs), 'config', 'mcp_config.json');
	// agy 在尚未加入任何 MCP server 前會留下空檔案
	if ((fs.readText(path) ?? '').trim() === '') return [];
	const json = readJson(fs, path);
	return json === null ? null : keysOf(json, 'mcpServers');
}

function skillsCount(fs: HostFs, cwd: string): number {
	return countSkills(fs, [join(geminiDir(fs), 'config', 'skills'), join(cwd, '.agents', 'skills')]);
}

export function splitAgyModel(value: string | null): Pick<SessionInfo, 'model' | 'effort'> {
	if (!value) return {model: null, effort: null};
	const m = /^(.*\S)\s*\(([^()]+)\)$/.exec(value.trim());
	return m ? {model: m[1] ?? null, effort: m[2] ?? null} : {model: value.trim(), effort: null};
}

// 未實測：執行中切換模型是否會即時寫回 settings.json。
// agy 對話存在 SQLite 且畫面不顯示用量，故不支援 context 用量。
function sessionInfo(fs: HostFs): SessionInfo {
	const model = splitAgyModel(stringField(readJson(fs, join(geminiDir(fs), 'antigravity-cli', 'settings.json')), 'model'));
	return {...model, context: null};
}

export const agy: AgentAdapter = {
	id: 'agy',
	displayName: 'Antigravity CLI',
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
	contextWindows: {},
	sessionInfo,
};
