import React, {useSyncExternalStore} from 'react';
import {useWindowSize} from 'ink';
import type {Store} from '../state/store.ts';
import type {AppState} from '../state/types.ts';
import {Sidebar} from '../ui/Sidebar.tsx';
import type {Controller} from './controller.ts';
import {useKeys} from './useKeys.ts';

type Props = {store: Store<AppState>; controller: Controller};

export function App({store, controller}: Props) {
	const state = useSyncExternalStore(store.subscribe, store.get);
	const {columns, rows} = useWindowSize();
	useKeys(store, controller);
	return <Sidebar state={state} columns={columns} rows={rows} />;
}
