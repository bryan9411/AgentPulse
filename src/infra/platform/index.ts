import {darwin} from './darwin.ts';
import type {Platform} from './types.ts';

export type {Platform} from './types.ts';

// Only macOS is implemented; WSL is reserved in SPEC 6.5.
export const platform: Platform = darwin;
