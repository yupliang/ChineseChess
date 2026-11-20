import { applyMove, parseUciMove, type Position } from '@cc/rules';

/** 依次应用一串 UCI 着法，用于预演引擎主变。 */
export function applyPv(pos: Position, moves: string[]): Position {
  return moves.reduce((acc, uci) => applyMove(acc, parseUciMove(uci)), pos);
}
