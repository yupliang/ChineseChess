import { applyMove, idx, pieceValue } from './board';
import { generateLegalMoves } from './movegen';
import type { Move, Position } from './types';

/**
 * 静态交换评估（SEE）：假设双方都用最划算的方式继续吃这一个格子，
 * 返回「先吃方」的净子力收益（正数 = 赚）。
 *
 * 只用于单格吃子交换，不做搜索，因此足够快、完全确定。
 */
export function seeCapture(pos: Position, move: Move, depth = 0): number {
  const target = pos.board[idx(move.to)];
  if (!target) return 0;
  if (target.type === 'K') return pieceValue('K');

  const mover = pos.board[idx(move.from)];
  if (!mover) return 0;

  const gain = pieceValue(target.type);
  if (depth >= 10) return gain;

  // 与 pos.turn 无关：谁走这步就按谁的回合计算后续反吃
  const after = applyMove({ ...pos, turn: mover.color }, move);
  // after.turn 已被切换：现在是对方可以选择「是否吃回来」
  const recaptures = generateLegalMoves(after).filter(
    (m) => m.to.file === move.to.file && m.to.rank === move.to.rank
  );
  if (recaptures.length === 0) return gain;

  const bestRecapture = Math.max(...recaptures.map((r) => seeCapture(after, r, depth + 1)));
  // 对方只有在收益为正时才会吃回来
  return gain - Math.max(0, bestRecapture);
}
