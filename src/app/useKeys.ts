import {useInput, type Key} from 'ink';
import * as A from '../state/actions.ts';
import {acceptsText, selectedRow, windowTooSmall} from '../state/selectors.ts';
import type {Store} from '../state/store.ts';
import type {AppState, Dialog} from '../state/types.ts';
import type {Controller} from './controller.ts';

// 貼上的文字可能夾帶換行或控制字元，路徑欄位不需要這些字元
const printable = (input: string) => input.replace(/[\u0000-\u001f\u007f]/g, '');

function dialogKey(store: Store<AppState>, controller: Controller, dialog: Dialog, input: string, key: Key) {
	// 非同步操作進行中鎖定按鍵，避免提早關閉對話框導致結果遺失或誤套用到下一個對話框
	if (dialog.busy) return;
	if (key.escape) {
		store.set(A.closeDialog);
		return;
	}
	if (key.return) {
		void controller.submitDialog();
		return;
	}
	// 有文字輸入欄位的對話框（例如輸入分支名稱）不能攔截 j/k，只能用方向鍵切換選項
	const typing = acceptsText(dialog);
	if (key.upArrow || (!typing && input === 'k')) {
		store.set(s => A.moveDialogChoice(s, -1));
		return;
	}
	if (key.downArrow || (!typing && input === 'j')) {
		store.set(s => A.moveDialogChoice(s, 1));
		return;
	}
	if (!typing) return;
	if (key.backspace || key.delete) store.set(s => A.editDialog(s, v => [...v].slice(0, -1).join('')));
	else if (!key.ctrl && !key.meta && input) {
		const text = printable(input);
		if (text) store.set(s => A.editDialog(s, v => v + text));
	}
}

function filterKey(store: Store<AppState>, input: string, key: Key) {
	if (key.escape) store.set(A.clearFilter);
	else if (key.return) store.set(A.endFilter);
	else if (key.backspace || key.delete) store.set(s => A.editFilter(s, v => [...v].slice(0, -1).join('')));
	else if (!key.ctrl && !key.meta && input) {
		const text = printable(input);
		if (text) store.set(s => A.editFilter(s, v => v + text));
	}
}

export function useKeys(store: Store<AppState>, controller: Controller) {
	useInput((input, key) => {
		const state = store.get();
		if (state.dialog) {
			dialogKey(store, controller, state.dialog, input, key);
			return;
		}
		if (state.filter.editing) {
			filterKey(store, input, key);
			return;
		}
		if (input === 'q') {
			void controller.quit();
			return;
		}
		if (windowTooSmall(state)) return;
		if (state.flash) store.set(s => A.setFlash(s, null));
		const row = selectedRow(state);
		if (key.upArrow || input === 'k') store.set(s => A.moveSelection(s, -1));
		else if (key.downArrow || input === 'j') store.set(s => A.moveSelection(s, 1));
		else if (key.leftArrow || input === 'h') store.set(A.collapseSelected);
		else if (key.rightArrow || input === 'l') store.set(A.expandSelected);
		else if (key.return) {
			if (row?.kind === 'session') void controller.focusAi();
			else store.set(A.toggleSelected);
		} else if (input === 'z') {
			if (row?.kind === 'session') void controller.zoomAi();
		} else if (input === 'n') controller.openNewSession();
		else if (input === 'x') {
			if (row?.kind === 'project') store.set(A.openRemoveProject);
			else if (row?.kind === 'session') store.set(A.openCloseSession);
		} else if (input === 'w') controller.openWorktree();
		else if (input === 'd') void controller.showDiff();
		else if (input === '?') void controller.showHelp();
		else if (input === 'o') void controller.openWeb();
		else if (input === 'a') store.set(A.openAddProject);
		else if (input === '/') store.set(A.startFilter);
		else if (input === 'f') store.set(A.toggleAttentionOnly);
		else if (input === 't') controller.toggleLanguage();
		else if (key.escape) store.set(s => (s.attentionOnly ? A.toggleAttentionOnly(A.clearFilter(s)) : A.clearFilter(s)));
	});
}
