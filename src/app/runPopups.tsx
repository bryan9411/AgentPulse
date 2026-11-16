import React from 'react';
import {basename, join} from 'node:path';
import {PassThrough} from 'node:stream';
import {render} from 'ink';
import {configDir, configFile, loadConfig} from '../config/config.ts';
import {isLang, type Lang} from '../i18n/strings.ts';
import {configureLog} from '../infra/log.ts';
import {hasDelta, loadDiffFiles, loadFileDiff} from '../services/diff.ts';
import {DiffPopup} from '../ui/DiffPopup.tsx';
import {HelpPopup} from '../ui/HelpPopup.tsx';
import {MouseWheelProvider, splitMouseEvents, type MouseWheelSource} from '../ui/mouseWheel.tsx';
import {GLYPHS} from '../ui/theme.ts';

const ENABLE_MOUSE = '\x1b[?1000h\x1b[?1006h';
const DISABLE_MOUSE = '\x1b[?1006l\x1b[?1000l';

export function readFlag(args: readonly string[], name: string): string | undefined {
	const prefix = `--${name}=`;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? '';
		if (arg === `--${name}`) return args[i + 1];
		if (arg.startsWith(prefix)) return arg.slice(prefix.length);
	}
	return undefined;
}

type RawInputStream = NodeJS.ReadableStream & {
	isTTY?: boolean;
	setRawMode?: (mode: boolean) => unknown;
	ref?: () => unknown;
	unref?: () => unknown;
	pause?: () => unknown;
};

// Ink 8 會把終端機滑鼠控制碼過濾掉不交給 useInput；在交給 Ink 前先行截出滾輪事件轉送給捲動畫面
export function createPopupInput(rawStdin: RawInputStream): {
	stdin: NodeJS.ReadStream;
	wheelSource: MouseWheelSource;
	dispose: () => void;
} {
	const proxy = new PassThrough() as PassThrough & {
		isTTY?: boolean;
		setRawMode?: (mode: boolean) => unknown;
		ref?: () => unknown;
		unref?: () => unknown;
	};
	proxy.isTTY = rawStdin.isTTY;
	proxy.setRawMode = mode => {
		rawStdin.setRawMode?.(mode);
		return proxy;
	};
	proxy.ref = () => {
		rawStdin.ref?.();
		return proxy;
	};
	proxy.unref = () => {
		rawStdin.unref?.();
		return proxy;
	};

	const listeners = new Set<(delta: number) => void>();
	const wheelSource: MouseWheelSource = {
		subscribe(fn) {
			listeners.add(fn);
			return () => {
				listeners.delete(fn);
			};
		},
	};

	let remainder = '';
	const onData = (chunk: Buffer | string) => {
		const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
		const parsed = splitMouseEvents(remainder + text);
		remainder = parsed.remainder;
		if (parsed.wheelDelta !== 0) {
			for (const fn of listeners) fn(parsed.wheelDelta);
		}
		if (parsed.passthrough) proxy.write(parsed.passthrough);
	};

	rawStdin.setEncoding('utf8');
	rawStdin.on('data', onData);

	const dispose = () => {
		rawStdin.off('data', onData);
		rawStdin.pause?.();
		proxy.end();
	};

	return {
		stdin: proxy as unknown as NodeJS.ReadStream,
		wheelSource,
		dispose,
	};
}

async function mountPopup(build: (onClose: () => void) => React.ReactElement): Promise<number> {
	const {stdin, wheelSource, dispose} = createPopupInput(process.stdin);
	let closed = false;
	let instance: ReturnType<typeof render> | null = null;
	const disableMouse = () => {
		if (process.stdout.isTTY) process.stdout.write(DISABLE_MOUSE);
	};
	const onClose = () => {
		if (closed) return;
		closed = true;
		disableMouse();
		instance?.unmount();
	};
	try {
		instance = render(<MouseWheelProvider source={wheelSource}>{build(onClose)}</MouseWheelProvider>, {
			stdin,
			exitOnCtrlC: false,
			alternateScreen: true,
		});
		if (process.stdout.isTTY) process.stdout.write(ENABLE_MOUSE);
		await instance.waitUntilExit();
		return 0;
	} finally {
		disableMouse();
		dispose();
	}
}

function loadPopupEnv(args: readonly string[]) {
	const dir = configDir();
	configureLog(join(dir, 'agentpulse.log'));
	const loaded = loadConfig(dir);
	const rawLang = readFlag(args, 'lang');
	const lang: Lang = isLang(rawLang) ? rawLang : loaded.config.language;
	return {dir, config: loaded.config, lang};
}

export async function runDiffPopup(args: readonly string[]): Promise<number> {
	const {lang} = loadPopupEnv(args);
	const cwd = readFlag(args, 'cwd') ?? process.cwd();
	const title = readFlag(args, 'title') ?? basename(cwd);
	const initialFiles = (await loadDiffFiles(cwd)) ?? [];
	const deltaAvailable = hasDelta();
	return mountPopup(onClose => (
		<DiffPopup
			lang={lang}
			title={title}
			deltaAvailable={deltaAvailable}
			initialFiles={initialFiles}
			loadFile={(file, width, sideBySide) => loadFileDiff(cwd, file, {width, sideBySide})}
			reloadFiles={() => loadDiffFiles(cwd)}
			onClose={onClose}
		/>
	));
}

export async function runHelpPopup(args: readonly string[]): Promise<number> {
	const {dir, config, lang} = loadPopupEnv(args);
	return mountPopup(onClose => (
		<HelpPopup
			lang={lang}
			glyphs={GLYPHS[config.glyphs]}
			backKey={config.keys.back}
			configPath={configFile(dir)}
			logPath={join(dir, 'agentpulse.log')}
			onClose={onClose}
		/>
	));
}
