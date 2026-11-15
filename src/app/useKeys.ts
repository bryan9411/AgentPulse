import {useInput, type Key} from 'ink';
import * as A from '../state/actions.ts';
import {selectedRow, windowTooSmall} from '../state/selectors.ts';
import type {Store} from '../state/store.ts';
import type {AppState, Dialog} from '../state/types.ts';
import type {Controller} from './controller.ts';

// Pasted text may carry newlines or escape bytes; a path never needs them.
const printable = (input: string) => input.replace(/[\u0000-\u001f\u007f]/g, '');

function dialogKey(store: Store<AppState>, controller: Controller, dialog: Dialog, input: string, key: Key) {
	if (key.escape) {
		store.set(A.closeDialog);
		return;
	}
	if (key.return) {
		void controller.submitDialog();
		return;
	}
	if (dialog.kind === 'new-session') {
		if (key.upArrow || input === 'k') store.set(s => A.moveDialogChoice(s, -1));
		else if (key.downArrow || input === 'j') store.set(s => A.moveDialogChoice(s, 1));
		return;
	}
	if (dialog.kind !== 'add-project') return;
	if (key.backspace || key.delete) store.set(s => A.editDialog(s, v => [...v].slice(0, -1).join('')));
	else if (!key.ctrl && !key.meta && input) {
		const text = printable(input);
		if (text) store.set(s => A.editDialog(s, v => v + text));
	}
}

export function useKeys(store: Store<AppState>, controller: Controller) {
	useInput((input, key) => {
		const state = store.get();
		if (state.dialog) {
			dialogKey(store, controller, state.dialog, input, key);
			return;
		}
		if (input === 'q') {
			void controller.quit();
			return;
		}
		if (windowTooSmall(state)) return;
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
		else if (input === 'a') store.set(A.openAddProject);
	});
}
