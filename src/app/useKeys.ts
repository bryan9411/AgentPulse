import {useInput, type Key} from 'ink';
import * as A from '../state/actions.ts';
import {acceptsText, selectedRow, windowTooSmall} from '../state/selectors.ts';
import type {Store} from '../state/store.ts';
import type {AppState, Dialog} from '../state/types.ts';
import type {Controller} from './controller.ts';

// Pasted text may carry newlines or escape bytes; a path never needs them.
const printable = (input: string) => input.replace(/[\u0000-\u001f\u007f]/g, '');

function dialogKey(store: Store<AppState>, controller: Controller, dialog: Dialog, input: string, key: Key) {
	// The work is under way and its answer belongs to this dialog: closing it
	// now would hide a merge result, or hand the answer to the next dialog.
	if (dialog.busy) return;
	if (key.escape) {
		store.set(A.closeDialog);
		return;
	}
	if (key.return) {
		void controller.submitDialog();
		return;
	}
	// Where letters are text (a branch name), only the arrows move the choice.
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

// Typing goes to the `/` field and filters live; enter keeps the keyword.
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
		// The line answering the previous key has been read by now.
		if (state.flash) store.set(s => A.setFlash(s, null));
		const row = selectedRow(state);
		if (key.upArrow || input === 'k') store.set(s => A.moveSelection(s, -1));
		else if (key.downArrow || input === 'j') store.set(s => A.moveSelection(s, 1));
		else if (key.leftArrow || input === 'h') store.set(A.collapseSelected);
		else if (key.rightArrow || input === 'l') store.set(A.expandSelected);
		else if (key.return) {
			// On a group row enter folds it; on a session row it hands over the keyboard.
			if (row?.kind === 'session') void controller.focusAi();
			else store.set(A.toggleSelected);
		} else if (input === 'z') {
			if (row?.kind === 'session') void controller.zoomAi();
		} else if (input === 'n') controller.openNewSession();
		else if (input === 'x') store.set(A.openCloseSession);
		else if (input === 'w') controller.openWorktree();
		else if (input === 'm') controller.openMerge();
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
