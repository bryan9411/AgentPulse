// SPEC 3.3. The bottom layer: imports nothing, so every layer may use it.

export type Lang = 'en' | 'zh-TW';

export const DEFAULT_LANG: Lang = 'en';

export function isLang(value: unknown): value is Lang {
	return value === 'en' || value === 'zh-TW';
}

export function nextLang(lang: Lang): Lang {
	return lang === 'en' ? 'zh-TW' : 'en';
}

const en = {
	// Keyed like AgentState; i18n cannot import it.
	state: {
		running: 'running',
		'needs-approval': 'needs approval',
		idle: 'idle',
		done: 'done',
		error: 'error',
	},
	list: {
		title: 'Sessions',
		filter: '/ filter',
		attentionOnly: (approval: string, error: string) => `${approval} ${error} only`,
		tooSmall: 'Window too small',
		need: (size: string) => `Need ${size}`,
		now: (size: string) => `Now ${size}`,
	},
	// Each line must fit the default 28-cell list width.
	hints: {
		addProject: ['enter add · esc cancel'],
		newSession: ['↑↓ choose · enter start', 'esc cancel'],
		closeSession: ['enter close · esc cancel'],
		ai: ['ctrl+q back'],
		editingFilter: ['type to filter', 'enter done · esc clear'],
		filterOn: '/ filter · f · esc clear',
		filterOff: '/ filter · f needs you',
		session: ['↑↓ move · enter type', 'z zoom · x close · n new'],
		project: ['↑↓ move · ←→ fold', 'n new session'],
		// Names the other language in its own script so it can be found
		// by someone who cannot read this one.
		tail: ['a add project · q quit', 't 中文'],
	},
	addProject: {title: 'Add project', label: 'Folder path (git repo):', busy: 'Checking…'},
	newSession: {
		title: 'New session',
		inProject: (name: string) => `in ${name}`,
		notInstalled: 'not installed',
		busy: 'Starting…',
	},
	closeSession: {
		title: 'Close session?',
		willStop: 'The AI will be stopped.',
		exited: 'The AI has already exited.',
		busy: 'Closing…',
	},
	// Kept in state as {key, arg}, so these stay plain text with {0}.
	msg: {
		enterPath: 'Enter a folder path',
		folderNotFound: 'Folder not found',
		notRepo: 'Not a git repository',
		configInvalid: 'config.json is invalid',
		configInvalidFix: 'config.json is invalid; fix it first',
		languageNotSaved: 'Language not saved: config.json is invalid',
		notInstalled: '{0} is not installed',
		unknownAgent: 'Unknown AI: {0}',
		binaryMissing: '{0} not found on PATH',
		startFailed: 'Could not start the AI: {0}',
		cannotShow: 'Could not show this session',
		cannotClose: 'Could not close the session',
		failed: 'Something went wrong; see agentpulse.log',
	},
	hud: {
		exited: (status: string) => `exited (${status})`,
		stalled: 'stalled?',
		model: 'model',
		mcpNone: 'MCP none',
		skills: 'skills',
		noRules: (name: string) => `no ${name}`,
		clean: 'clean',
		untracked: (n: number) => `${n} untracked`,
		up: (age: string) => `up ${age}`,
		output: (age: string) => `output ${age} ago`,
		context: 'context',
		system: 'system',
		chat: 'chat',
		free: 'free',
		noProject: 'No project selected',
		noSession: 'No session yet',
		units: {s: 's', m: 'm', h: 'h', d: 'd'},
	},
	topBar: {sessions: (n: number) => (n === 1 ? '1 session' : `${n} sessions`)},
	notify: {error: 'stopped with an error', approval: 'needs your approval'},
	tmux: {
		exited: (status: string) => `AI exited (status ${status}) · ctrl+q, then x to close`,
		placeholder: 'No session · select a project and press n',
	},
};

export type Strings = typeof en;

// Taiwan wording, and plain: say where and what to do, not the spec's
// internal names (SPEC 3.3).
const zhTW: Strings = {
	state: {
		running: '工作中',
		'needs-approval': '等你同意',
		idle: '等你輸入',
		done: '做完了',
		error: '出錯',
	},
	list: {
		title: '專案與 AI',
		filter: '/ 搜尋',
		attentionOnly: (approval, error) => `只看 ${approval} ${error}`,
		tooSmall: '視窗太小',
		need: size => `至少要 ${size}`,
		now: size => `目前 ${size}`,
	},
	hints: {
		addProject: ['enter 加入 · esc 取消'],
		newSession: ['↑↓ 選擇 · enter 啟動', 'esc 取消'],
		closeSession: ['enter 關閉 · esc 取消'],
		ai: ['ctrl+q 回到左邊'],
		editingFilter: ['直接打字搜尋', 'enter 完成 · esc 清除'],
		filterOn: '/ 搜尋 · f · esc 清除',
		filterOff: '/ 搜尋 · f 只看要處理的',
		session: ['↑↓ 選擇 · enter 跟 AI 對話', 'z 放大 · x 關閉 · n 新增 AI'],
		project: ['↑↓ 選擇 · ←→ 收合展開', 'n 新增 AI'],
		tail: ['a 加入專案 · q 離開', 't English'],
	},
	addProject: {title: '加入專案', label: '輸入專案資料夾路徑：', busy: '檢查中…'},
	newSession: {
		title: '新增 AI',
		inProject: name => `專案：${name}`,
		notInstalled: '未安裝',
		busy: '啟動中…',
	},
	closeSession: {
		title: '關閉這個 AI？',
		willStop: 'AI 會被停止。',
		exited: 'AI 已經結束了。',
		busy: '關閉中…',
	},
	msg: {
		enterPath: '請輸入資料夾路徑',
		folderNotFound: '找不到這個資料夾',
		notRepo: '這不是 git 儲存庫',
		configInvalid: 'config.json 格式有誤',
		configInvalidFix: 'config.json 格式有誤，請先修正',
		languageNotSaved: '語言沒有存起來：config.json 格式有誤',
		notInstalled: '{0} 還沒安裝',
		unknownAgent: '不認得的 AI：{0}',
		binaryMissing: '找不到 {0} 程式',
		startFailed: '無法啟動 AI：{0}',
		cannotShow: '無法顯示這個 AI',
		cannotClose: '無法關閉這個 AI',
		failed: '發生錯誤，詳見 agentpulse.log',
	},
	hud: {
		exited: status => `已結束 (${status})`,
		stalled: '可能卡住了',
		model: '模型',
		mcpNone: 'MCP 無',
		skills: 'Skills',
		noRules: name => `沒有 ${name}`,
		clean: '沒有修改',
		untracked: n => `${n} 個新檔案`,
		up: age => `已開 ${age}`,
		output: age => `${age}前有輸出`,
		context: '記憶用量',
		system: '系統',
		chat: '對話',
		free: '剩餘',
		noProject: '還沒選專案',
		noSession: '這個專案還沒有 AI，按 n 新增',
		units: {s: '秒', m: '分', h: '時', d: '天'},
	},
	topBar: {sessions: n => `${n} 個 AI`},
	notify: {error: '出錯停下來了', approval: '在等你同意'},
	tmux: {
		exited: status => `AI 已結束（結束碼 ${status}）· 按 ctrl+q 回到左邊，再按 x 關閉`,
		placeholder: '還沒有 AI · 在左邊選一個專案，按 n 新增',
	},
};

const STRINGS: Record<Lang, Strings> = {en, 'zh-TW': zhTW};

export function strings(lang: Lang): Strings {
	return STRINGS[lang];
}

export type MessageKey = keyof Strings['msg'];

// A translatable message held in state, so switching language also
// re-renders errors and notices already on screen.
export type Message = {key: MessageKey; arg?: string};

export const msg = (key: MessageKey, arg?: string): Message => (arg === undefined ? {key} : {key, arg});

export function messageText(lang: Lang, message: Message): string {
	return strings(lang).msg[message.key].replace('{0}', message.arg ?? '');
}
