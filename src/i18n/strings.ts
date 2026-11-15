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
		noMatches: 'No matches',
		clearFilter: 'Press esc to clear',
		noProjects: 'No projects',
		addOne: 'Press a to add one',
	},
	// Each line must fit the default 28-cell list width.
	hints: {
		addProject: ['enter add · esc cancel'],
		newSession: ['↑↓ choose · enter start', 'esc cancel'],
		closeSession: ['enter close · esc cancel'],
		worktree: ['↑↓ pick AI · enter create', 'esc cancel'],
		mergeConfirm: ['enter merge · esc cancel'],
		mergeClose: ['enter or esc: close'],
		openUrl: ['↑↓ choose · enter open', 'esc cancel'],
		ai: ['ctrl+q back'],
		editingFilter: ['type to filter', 'enter done · esc clear'],
		filterOn: '/ filter · f · esc clear',
		filterOff: '/ filter · f needs you',
		session: ['↑↓ move · enter type', 'z zoom · x close · n new', 'w worktree · m merge', 'd diff · o open web'],
		// Padded to as many lines as `session` so the list does not jump.
		project: ['↑↓ move · ←→ fold', 'n new session', 'w worktree (new branch)', ''],
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
	worktree: {
		title: 'New worktree',
		inProject: (name: string, base: string) => `in ${name} · from ${base}`,
		label: 'New branch name:',
		folder: 'Gets its own folder:',
		note: 'The AI works there, apart from the main folder.',
		busy: 'Creating…',
	},
	merge: {
		title: 'Merge and clean up?',
		checking: 'Checking…',
		blockedTitle: 'Cannot merge yet',
		into: (branch: string, base: string) => `${branch} → ${base}`,
		steps: 'On enter, in this order:',
		commit: (n: number) => `commit ${n} changed ${n === 1 ? 'file' : 'files'}`,
		merge: (base: string) => `merge into ${base}`,
		close: 'close this AI',
		removeFolder: 'remove the branch folder',
		deleteBranch: (branch: string) => `delete branch ${branch}`,
		ignored: (names: string) => `Not in git, deleted with the folder: ${names}`,
		onConflict: 'If files conflict: undone, nothing deleted.',
		messageLabel: 'Commit message:',
		busy: 'Working…',
		conflictTitle: 'Conflict: merge undone',
		conflictFiles: 'Both sides changed:',
		more: (n: number) => `+${n} more`,
		nothingDeleted: 'Nothing was deleted.',
		committedOn: (branch: string) => `Your changes are committed on ${branch}.`,
		abortFailed: 'git merge --abort failed. The main folder needs a look.',
		commitFailedTitle: 'Commit failed',
		nothingMerged: 'Nothing was merged or deleted.',
		mergeFailedTitle: 'Merge did not start',
		cleanupTitle: (base: string) => `Merged into ${base}, cleanup stopped`,
		cleanupClose: 'The AI could not be closed. Its folder and branch are still there.',
		cleanupFolder: 'The AI is closed, but its folder could not be removed. The branch is still there.',
		cleanupBranch: 'The folder is removed, but the branch could not be deleted.',
	},
	openUrl: {title: 'Open in browser', busy: 'Opening…'},
	conflict: {
		title: (n: number) => `conflict · ${n} branches`,
		more: (n: number) => `+${n} more`,
	},
	// Shown by `less` inside the diff popup.
	diff: {prompt: 'q close · ↑↓ space scroll', untracked: 'New files (not in git yet):'},
	// Kept in state as {key, arg}, so these stay plain text with {0} and {1}.
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
		branchEmpty: 'Type a branch name',
		branchInvalid: 'Not a valid branch name',
		branchExists: 'Branch {0} already exists',
		folderExists: 'Folder already exists: {0}',
		mainNoBranch: 'The main folder is not on a branch',
		noCommits: 'This project has no commits yet',
		worktreeFailed: 'Could not create it: {0}',
		worktreeNoAi: 'Branch and folder created, but the AI did not start; see agentpulse.log',
		notWorktree: 'm only works on a branch made with w',
		aiRunning: 'The AI is still working. Wait until it stops, then press m again.',
		worktreeMissing: 'The branch folder is missing: {0}',
		worktreeNoBranch: 'The branch folder is not on a branch',
		mainNotOnBase: 'The main folder must be on {0}, but it is on {1}. Switch it back first.',
		mainMerging: 'The main folder is in the middle of another merge. Finish that first.',
		mainUnreadable: 'Could not read the main folder',
		mainDirty: 'The main folder has uncommitted changes. Commit them first.',
		needMessage: 'Type a commit message',
		merged: 'Merged {0} into {1}',
		noChanges: 'No changes to show',
		diffFailed: 'Could not read the changes',
		noPorts: 'No local port found yet',
		openFailed: 'Could not open the browser',
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
		noMatches: '找不到符合的',
		clearFilter: '按 esc 清除搜尋',
		noProjects: '還沒有專案',
		addOne: '按 a 加入一個',
	},
	hints: {
		addProject: ['enter 加入 · esc 取消'],
		newSession: ['↑↓ 選擇 · enter 啟動', 'esc 取消'],
		closeSession: ['enter 關閉 · esc 取消'],
		worktree: ['↑↓ 選 AI · enter 建立', 'esc 取消'],
		mergeConfirm: ['enter 開始合併 · esc 取消'],
		mergeClose: ['enter 或 esc 關閉'],
		openUrl: ['↑↓ 選擇 · enter 開啟', 'esc 取消'],
		ai: ['ctrl+q 回到左邊'],
		editingFilter: ['直接打字搜尋', 'enter 完成 · esc 清除'],
		filterOn: '/ 搜尋 · f · esc 清除',
		filterOff: '/ 搜尋 · f 只看要處理的',
		session: ['↑↓ 選擇 · enter 跟 AI 對話', 'z 放大 · x 關閉 · n 新增 AI', 'w 開新分支 · m 合併回主線', 'd 看修改 · o 開網頁'],
		project: ['↑↓ 選擇 · ←→ 收合展開', 'n 新增 AI', 'w 開新分支（另開資料夾）', ''],
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
	worktree: {
		title: '開新分支',
		inProject: (name, base) => `專案：${name} · 從 ${base} 分出`,
		label: '新分支的名稱：',
		folder: '會另開這個資料夾：',
		note: 'AI 在那個資料夾裡改，不會動到專案原本的資料夾。',
		busy: '建立中…',
	},
	merge: {
		title: '合併並清理？',
		checking: '檢查中…',
		blockedTitle: '現在還不能合併',
		into: (branch, base) => `${branch} → ${base}`,
		steps: '按 enter 後會依序：',
		commit: n => `提交 ${n} 個修改的檔案`,
		merge: base => `合併到 ${base}`,
		close: '關閉這個 AI',
		removeFolder: '移除這個分支的資料夾',
		deleteBranch: branch => `刪除分支 ${branch}`,
		ignored: names => `不在 git 裡、會跟著資料夾一起刪掉：${names}`,
		onConflict: '有衝突就還原，什麼都不刪。',
		messageLabel: '提交訊息（這次改了什麼）：',
		busy: '處理中…',
		conflictTitle: '有衝突，合併已還原',
		conflictFiles: '這些檔案兩邊都改了：',
		more: n => `還有 ${n} 個`,
		nothingDeleted: '什麼都沒有刪除。',
		committedOn: branch => `你的修改已經提交在 ${branch}。`,
		abortFailed: 'git merge --abort 沒有成功，請檢查專案原本的資料夾。',
		commitFailedTitle: '提交失敗',
		nothingMerged: '沒有合併，也沒有刪除任何東西。',
		mergeFailedTitle: '合併沒有開始',
		cleanupTitle: base => `已合併到 ${base}，但清理停下來了`,
		cleanupClose: 'AI 關不掉。它的資料夾和分支都還在。',
		cleanupFolder: 'AI 已關閉，但資料夾移除不了。分支還在。',
		cleanupBranch: '資料夾已移除，但分支刪除不了。',
	},
	openUrl: {title: '用瀏覽器開啟', busy: '開啟中…'},
	conflict: {
		title: n => `${n} 個分支改到同一個檔案`,
		more: n => `還有 ${n} 個`,
	},
	diff: {prompt: 'q 關閉 · ↑↓ 空白鍵 捲動', untracked: '新檔案（還沒加進 git）：'},
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
		branchEmpty: '請輸入分支名稱',
		branchInvalid: '這個名稱不能當分支名稱',
		branchExists: '已經有 {0} 這個分支',
		folderExists: '資料夾已經存在：{0}',
		mainNoBranch: '專案原本的資料夾目前不在任何分支上',
		noCommits: '這個專案還沒有任何提交',
		worktreeFailed: '建立失敗：{0}',
		worktreeNoAi: '分支和資料夾已建立，但 AI 沒有啟動，詳見 agentpulse.log',
		notWorktree: 'm 只能用在按 w 開出來的分支',
		aiRunning: 'AI 還在工作中。等它停下來再按 m。',
		worktreeMissing: '找不到這個分支的資料夾：{0}',
		worktreeNoBranch: '這個分支的資料夾目前不在任何分支上',
		mainNotOnBase: '專案原本的資料夾要先切回 {0}（現在在 {1}）。',
		mainMerging: '專案原本的資料夾有另一個合併還沒完成，請先處理。',
		mainUnreadable: '讀不到專案原本的資料夾',
		mainDirty: '專案原本的資料夾有還沒提交的修改，請先提交。',
		needMessage: '請輸入提交訊息',
		merged: '已把 {0} 合併到 {1}',
		noChanges: '沒有修改可以看',
		diffFailed: '讀不到修改內容',
		noPorts: '還沒偵測到本機網址',
		openFailed: '無法開啟瀏覽器',
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
export type Message = {key: MessageKey; arg?: string; arg2?: string};

export function msg(key: MessageKey, arg?: string, arg2?: string): Message {
	if (arg === undefined) return {key};
	return arg2 === undefined ? {key, arg} : {key, arg, arg2};
}

// Function replacers: a branch name may itself contain "$&" or "{1}".
export function messageText(lang: Lang, message: Message): string {
	return strings(lang).msg[message.key].replace(/\{([01])\}/g, (_, n: string) => (n === '0' ? message.arg : message.arg2) ?? '');
}
