import {useInput, type Key} from 'ink';
import * as A from '../state/actions.ts';
import {windowTooSmall} from '../state/selectors.ts';
import type {Store} from '../state/store.ts';
import type {AppState} from '../state/types.ts';
import type {Controller} from './controller.ts';

// Pasted text may carry newlines or escape bytes; a path never needs them.
const printable = (input: string) => input.replace(/[\u0000-\u001f\u007f]/g, '');

function dialogKey(store: Store<AppState>, controller: Controller, input: string, key: Key) {
	if (key.escape) store.set(A.closeDialog);
	else if (key.return) void controller.submitAddProject();
	else if (key.backspace || key.delete) store.set(s => A.editDialog(s, v => [...v].slice(0, -1).join('')));
	else if (!key.ctrl && !key.meta && input) {
		const text = printable(input);
		if (text) store.set(s => A.editDialog(s, v => v + text));
	}
}

export function useKeys(store: Store<AppState>, controller: Controller) {
	useInput((input, key) => {
		const state = store.get();
		if (state.dialog) {
			dialogKey(store, controller, input, key);
			return;
		}
		if (input === 'q') {
			void controller.quit();
			return;
		}
		if (windowTooSmall(state)) return;
		if (key.upArrow || input === 'k') store.set(s => A.moveSelection(s, -1));
		else if (key.downArrow || input === 'j') store.set(s => A.moveSelection(s, 1));
		else if (key.leftArrow || input === 'h') store.set(A.collapseSelected);
		else if (key.rightArrow || input === 'l') store.set(A.expandSelected);
		// Handing focus to a session arrives with M2; on a group row enter folds it.
		else if (key.return) store.set(A.toggleSelected);
		else if (input === 'a') store.set(A.openAddProject);
	});
}
