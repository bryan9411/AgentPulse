import type {Platform} from './types.ts';

export const darwin: Platform = {
	id: 'darwin',
	// Apple Silicon Homebrew first, then Intel Homebrew.
	binDirs: ['/opt/homebrew/bin', '/usr/local/bin'],
};
