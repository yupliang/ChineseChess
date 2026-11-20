import { generateLegalMoves, isKingInCheck } from './movegen';
import type { Color, Position } from './types';

export type EndReason =
  | 'checkmate'
  | 'stalemate'
  | 'repetition'
  | 'perpetual-check'
  | 'sixty-move';

export interface GameEnd {
  over: boolean;
  /** null 表示和棋 */
  winner: Color | null;
  reason: EndReason | null;
}

/** 60 回合（120 个半回合）无吃子判和。 */
export const SIXTY_MOVE_PLIES = 120;

/** 局面标识：只看棋子分布和行棋方，忽略计数。用于重复局面判定。 */
export function positionKey(pos: Position): string {
  let key = '';
  for (let rank = 9; rank >= 0; rank--) {
    for (let file = 0; file <= 8; file++) {
      const piece = pos.board[rank * 9 + file];
      key += piece
        ? piece.color === 'red'
          ? piece.type.toUpperCase()
          : piece.type.toLowerCase()
        : '.';
    }
  }
  return key + (pos.turn === 'red' ? 'w' : 'b');
}

/**
 * 判定对局是否结束。
 * @param pos 当前局面
 * @param history 从开局到当前的全部局面（含当前），用于重复局面
 * @param gaveCheck 与 history 等长；gaveCheck[i] 表示走到 history[i] 的那一步是否将军
 */
export function judgeGameEnd(
  pos: Position,
  history: Position[],
  gaveCheck: boolean[]
): GameEnd {
  // 无棋可走：被将死（将杀）或困毙，均判负
  if (generateLegalMoves(pos).length === 0) {
    const inCheck = isKingInCheck(pos, pos.turn);
    return {
      over: true,
      winner: pos.turn === 'red' ? 'black' : 'red',
      reason: inCheck ? 'checkmate' : 'stalemate',
    };
  }

  if (history.length >= 3) {
    const key = positionKey(pos);
    const repeats: number[] = [];
    history.forEach((p, i) => {
      if (positionKey(p) === key) repeats.push(i);
    });

    if (repeats.length >= 3) {
      const first = repeats[0];
      const redChecks: boolean[] = [];
      const blackChecks: boolean[] = [];
      for (let i = first + 1; i < history.length; i++) {
        const mover: Color = history[i].turn === 'red' ? 'black' : 'red';
        (mover === 'red' ? redChecks : blackChecks).push(gaveCheck[i] === true);
      }
      const redAllCheck = redChecks.length > 0 && redChecks.every(Boolean);
      const blackAllCheck = blackChecks.length > 0 && blackChecks.every(Boolean);

      if (redAllCheck && !blackAllCheck) {
        return { over: true, winner: 'black', reason: 'perpetual-check' };
      }
      if (blackAllCheck && !redAllCheck) {
        return { over: true, winner: 'red', reason: 'perpetual-check' };
      }
      return { over: true, winner: null, reason: 'repetition' };
    }
  }

  if (pos.halfmove >= SIXTY_MOVE_PLIES) {
    return { over: true, winner: null, reason: 'sixty-move' };
  }

  return { over: false, winner: null, reason: null };
}
