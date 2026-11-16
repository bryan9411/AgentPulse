import React, {createContext, useContext, useEffect, useRef} from 'react';

export const WHEEL_STEP = 3;

export type MouseWheelSource = {
	subscribe: (listener: (delta: number) => void) => () => void;
};

const MouseWheelContext = createContext<MouseWheelSource | null>(null);

export function MouseWheelProvider({
	source,
	children,
}: {
	source: MouseWheelSource;
	children: React.ReactNode;
}) {
	return <MouseWheelContext.Provider value={source}>{children}</MouseWheelContext.Provider>;
}

export function useMouseWheel(onWheel: (delta: number) => void): void {
	const source = useContext(MouseWheelContext);
	const handlerRef = useRef(onWheel);
	handlerRef.current = onWheel;

	useEffect(() => {
		if (!source) return;
		return source.subscribe(delta => handlerRef.current(delta));
	}, [source]);
}

const SGR_MOUSE_RE = /\x1b\[<(\d+);\d+;\d+[Mm]/;
const X10_MOUSE_RE = /\x1b\[M([\s\S]{3})/;
const INCOMPLETE_SGR_RE = /\x1b\[<[0-9;]*$/;
const INCOMPLETE_X10_RE = /\x1b\[M[\s\S]{0,2}$/;

function wheelDeltaFromButton(btn: number): number {
	if ((btn & 64) === 0) return 0;
	const dir = btn & 3;
	if (dir === 0) return -WHEEL_STEP;
	if (dir === 1) return WHEEL_STEP;
	return 0;
}

// 從終端機 stdin 資料流抽出 SGR 與傳統 X10 滑鼠封包，只消費滑鼠事件、保留完整鍵盤輸入給 Ink；
// 僅暫存已確定為滑鼠前綴的不完整片段（\x1b[< 或 \x1b[M），避免單獨按 Esc 時被延遲
export function splitMouseEvents(input: string): {passthrough: string; wheelDelta: number; remainder: string} {
	let remainder = '';
	let body = input;
	const sgrTail = INCOMPLETE_SGR_RE.exec(body);
	const x10Tail = sgrTail ? null : INCOMPLETE_X10_RE.exec(body);
	const tailMatch = sgrTail ?? x10Tail;
	if (tailMatch) {
		remainder = tailMatch[0];
		body = body.slice(0, tailMatch.index);
	}

	let passthrough = '';
	let wheelDelta = 0;
	let cursor = 0;
	while (cursor < body.length) {
		const rest = body.slice(cursor);
		const sgr = SGR_MOUSE_RE.exec(rest);
		const x10 = X10_MOUSE_RE.exec(rest);
		let next: {index: number; length: number; btn: number} | null = null;
		if (sgr && (!x10 || sgr.index <= x10.index)) {
			next = {index: sgr.index, length: sgr[0].length, btn: Number(sgr[1])};
		} else if (x10) {
			const cb = x10[1]!.charCodeAt(0) - 32;
			next = {index: x10.index, length: x10[0].length, btn: cb};
		}
		if (!next) {
			passthrough += rest;
			break;
		}
		if (next.index > 0) passthrough += rest.slice(0, next.index);
		wheelDelta += wheelDeltaFromButton(next.btn);
		cursor += next.index + next.length;
	}
	return {passthrough, wheelDelta, remainder};
}

