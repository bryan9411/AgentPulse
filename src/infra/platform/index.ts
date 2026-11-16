import {darwin} from './darwin.ts';
import type {Platform} from './types.ts';

export type {Platform} from './types.ts';

// 目前僅實作 macOS；WSL 保留於架構介面
export const platform: Platform = darwin;
