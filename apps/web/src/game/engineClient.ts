import { PikafishEngine, type SearchResult } from '@cc/engine';
import type { Difficulty } from './types';

/**
 * 这个 Pikafish 构建没有 UCI_Elo / Skill Level，只能用搜索深度控制棋力。
 * casual 深度 5：只看两三步，经常漏战术，适合陪练。
 * serious 深度 16：接近全力。
 */
export const DIFFICULTY_DEPTH: Record<Difficulty, number> = {
  casual: 5,
  serious: 16,
};

let enginePromise: Promise<PikafishEngine> | null = null;
let progressHandler: ((loaded: number, total: number) => void) | null = null;

/** 单例加载引擎（wasm + 权重）。重复调用复用同一次加载。 */
export function loadEngine(
  onProgress?: (loaded: number, total: number) => void
): Promise<PikafishEngine> {
  if (onProgress) progressHandler = onProgress;
  if (!enginePromise) {
    const engine = new PikafishEngine({
      workerUrl: '/engine/pikafish/worker.js',
      jsUrl: '/engine/pikafish/pikafish.js',
      wasmUrl: '/engine/pikafish/pikafish.wasm',
      netUrl: '/engine/pikafish/pikafish.nnue',
    });
    engine.onProgress = (loaded, total) => progressHandler?.(loaded, total);
    enginePromise = engine.init(4).then(() => engine);
    enginePromise.catch(() => {
      enginePromise = null;
    });
  }
  return enginePromise;
}

/** 教练视角的分析：固定高深度，跟 AI 难度无关。 */
export async function engineSearch(fen: string): Promise<SearchResult> {
  const engine = await loadEngine();
  return engine.search(fen, { depth: 16, movetime: 4000 });
}

/** 对手实际走棋：按难度限制深度。 */
export async function aiSearch(fen: string, difficulty: Difficulty): Promise<SearchResult> {
  const engine = await loadEngine();
  const depth = DIFFICULTY_DEPTH[difficulty];
  return engine.search(fen, { depth, movetime: 2000 });
}
