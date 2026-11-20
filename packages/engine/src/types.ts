export interface SearchResult {
  bestMove: string;
  scoreCp: number; // 当前行棋方视角，正 = 该方优
  mateIn?: number; // 正数 = 该方 N 步内将杀对方，负数 = 被将杀
  depth: number;
  pv: string[]; // 主变，UCI 着法序列
  nps?: number;
}

export interface SearchOptions {
  depth?: number;
  movetime?: number; // 毫秒
  threads?: number; // 默认 4
}

export interface EngineUrls {
  workerUrl: string; // /engine/pikafish/worker.js
  jsUrl: string; // /engine/pikafish/pikafish.js
  wasmUrl: string; // /engine/pikafish/pikafish.wasm
  netUrl: string; // /engine/pikafish/pikafish.nnue
}
