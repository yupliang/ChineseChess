import { applyMove, moveToChinese, parseFen, parseUciMove, type Position } from '@cc/rules';

/** 依次应用一串 UCI 着法，用于预演引擎主变。 */
export function applyPv(pos: Position, moves: string[]): Position {
  return moves.reduce((acc, uci) => applyMove(acc, parseUciMove(uci)), pos);
}

/** 单个着法的中文记谱；fenBefore 缺失或局面解析失败时原样返回 uci。 */
export function moveChineseFrom(fenBefore: string | undefined, uci: string): string {
  if (!fenBefore) return uci;
  try {
    return moveToChinese(parseFen(fenBefore), uci);
  } catch {
    return uci;
  }
}

/** 一串着法的中文记谱序列；途中遇到非法着法即停，已转换的保留。 */
export function pvChineseFrom(fenBefore: string | undefined, moves: string[]): string[] {
  if (!fenBefore) return moves;
  let pos: Position;
  try {
    pos = parseFen(fenBefore);
  } catch {
    return moves;
  }
  const out: string[] = [];
  for (const uci of moves) {
    out.push(moveToChinese(pos, uci));
    try {
      pos = applyMove(pos, parseUciMove(uci));
    } catch {
      break;
    }
  }
  return out;
}
