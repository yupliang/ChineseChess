import type { Color } from '@cc/rules';
import type { Ply } from './types';

const CURRENT_KEY = 'cc-coach.current';
const HISTORY_KEY = 'cc-coach.history';
const SIDE_KEY = 'cc-coach.side';
const MAX_HISTORY = 10;

/** 你执哪一方：刷新/续局时沿用上次的选择。 */
export function saveSide(color: Color): void {
  try {
    localStorage.setItem(SIDE_KEY, color);
  } catch {
    /* ignore */
  }
}

export function loadSide(): Color {
  try {
    return localStorage.getItem(SIDE_KEY) === 'black' ? 'black' : 'red';
  } catch {
    return 'red';
  }
}

export function saveCurrent(plies: Ply[]): void {
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(plies));
  } catch {
    /* 隐私模式 / 空间不足：静默降级为不存档 */
  }
}

export function loadCurrent(): Ply[] | null {
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    if (!raw) return null;
    const plies = JSON.parse(raw) as Ply[];
    return Array.isArray(plies) && plies.length > 0 ? plies : null;
  } catch {
    return null;
  }
}

export function clearCurrent(): void {
  try {
    localStorage.removeItem(CURRENT_KEY);
  } catch {
    /* ignore */
  }
}

export interface FinishedGame {
  finishedAt: number;
  plies: Ply[];
}

export function loadHistory(): FinishedGame[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as FinishedGame[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveFinished(plies: Ply[]): void {
  try {
    const list = loadHistory();
    list.unshift({ finishedAt: Date.now(), plies });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
    clearCurrent();
  } catch {
    /* ignore */
  }
}
