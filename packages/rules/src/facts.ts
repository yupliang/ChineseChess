import {
  applyMove,
  idx,
  parseFen,
  parseSquare,
  pieceName,
  sameSquare,
  squareName,
} from './board';
import { generateLegalMoves, isKingInCheck } from './movegen';
import { seeCapture } from './see';
import type { Color, Fact, HangingPiece, Move, Position } from './types';

/** SEE 净收益达到这个值才算「白送」。100 的兵不算，400 的马起报。 */
export const HANGING_THRESHOLD = 300;

/** 主动吃子后，净亏达到这个值才算「兑子亏」。 */
export const BAD_TRADE_THRESHOLD = 300;

/**
 * 找出「byColor 下一步可以白吃」的棋子：有吃子着法，且交换下来净赚 >= 阈值。
 * 同一格多个攻击者只保留收益最大的那条。与当前行棋方无关，可用来分析「潜在威胁」。
 */
export function findHangingPieces(pos: Position, byColor: Color = pos.turn): HangingPiece[] {
  const best = new Map<string, HangingPiece>();

  for (const move of generateLegalMoves(pos, byColor)) {
    const target = pos.board[idx(move.to)];
    if (!target || target.type === 'K') continue;
    const attacker = pos.board[idx(move.from)];
    if (!attacker) continue;

    const gain = seeCapture(pos, move);
    if (gain < HANGING_THRESHOLD) continue;

    const key = squareName(move.to);
    const prev = best.get(key);
    if (!prev || gain > prev.gain) {
      best.set(key, { piece: target, square: move.to, attacker, from: move.from, gain });
    }
  }

  return [...best.values()].sort((a, b) => b.gain - a.gain);
}

export function toFact(h: HangingPiece): Fact {
  return {
    type: 'hanging_piece',
    piece: pieceName(h.piece),
    square: squareName(h.square),
    attacker: pieceName(h.attacker),
    gain: h.gain,
    move: squareName(h.from) + squareName(h.square),
  };
}

/** 从 FEN 直接抽取「白送子」事实（只看行棋方能吃谁）。 */
export function analyzeHangingFen(fen: string): Fact[] {
  return findHangingPieces(parseFen(fen)).map(toFact);
}

export function parseUciMove(uci: string): Move {
  if (!/^[a-i][0-9][a-i][0-9]$/.test(uci)) throw new Error(`invalid UCI move: ${uci}`);
  return { from: parseSquare(uci.slice(0, 2)), to: parseSquare(uci.slice(2, 4)) };
}

export function moveToUci(move: Move): string {
  return squareName(move.from) + squareName(move.to);
}

/** 行棋方是否有一步将杀对手的着法。 */
export function hasMateInOne(pos: Position): boolean {
  return generateLegalMoves(pos).some((move) => {
    const after = applyMove(pos, move);
    return isKingInCheck(after, after.turn) && generateLegalMoves(after).length === 0;
  });
}

const SEVERITY: Record<Fact['type'], number> = {
  allow_mate: 0,
  hanging_piece: 1,
  bad_trade: 2,
  missed_capture: 3,
  missed_threat: 4,
};

/**
 * 分析「你走的这一步」为什么臭。
 *
 * 输入走之前的 FEN 和实际走的 UCI 着法，输出一组自包含的事实。
 * 全部基于确定性规则（走法生成 + 静态交换评估），不需要引擎，因此可单测。
 */
export function analyzeMove(fenBefore: string, uci: string): Fact[] {
  const posBefore = parseFen(fenBefore);
  const move = parseUciMove(uci);

  const isLegal = generateLegalMoves(posBefore).some(
    (m) => sameSquare(m.from, move.from) && sameSquare(m.to, move.to)
  );
  if (!isLegal) throw new Error(`illegal move ${uci} for ${fenBefore}`);

  const mover = posBefore.turn;
  const opponent: Color = mover === 'red' ? 'black' : 'red';
  const moverPiece = posBefore.board[idx(move.from)]!;
  const captured = posBefore.board[idx(move.to)];
  const posAfter = applyMove(posBefore, move);

  const facts: Fact[] = [];

  // ② 这一步之后对手可以一步将杀
  if (hasMateInOne(posAfter)) {
    facts.push({ type: 'allow_mate', mateIn: 1 });
  }

  // ③ 主动发起亏本交换
  const playedSee = captured && captured.type !== 'K' ? seeCapture(posBefore, move) : 0;
  let tradeSquare: string | null = null;
  if (captured && captured.type !== 'K' && playedSee <= -BAD_TRADE_THRESHOLD) {
    facts.push({
      type: 'bad_trade',
      won: [pieceName(captured)],
      lost: [pieceName(moverPiece)],
      delta: playedSee,
    });
    tradeSquare = squareName(move.to);
  }

  const before = findHangingPieces(posBefore, opponent);
  const after = findHangingPieces(posAfter, opponent);
  const beforeSquares = new Set(before.map((h) => squareName(h.square)));

  // ① 这一步新造成的白送子
  for (const h of after) {
    const sq = squareName(h.square);
    if (sq === tradeSquare) continue; // 已在 bad_trade 里说过
    if (beforeSquares.has(sq)) continue; // 早就存在的威胁归 missed_threat
    facts.push(toFact(h));
  }

  // ④ 移动前就存在、移动后仍然存在的威胁（对手一直在盯，你没管）
  const stillHanging = after.filter((h) => beforeSquares.has(squareName(h.square)));
  if (stillHanging.length > 0) {
    const worst = stillHanging[0];
    facts.push({
      type: 'missed_threat',
      target: pieceName(worst.piece),
      square: squareName(worst.square),
      by: pieceName(worst.attacker),
      gain: worst.gain,
      move: squareName(worst.from) + squareName(worst.square),
    });
  }

  // ⑤ 本回合本来有白吃机会却没走
  if (playedSee < HANGING_THRESHOLD) {
    const best = findHangingPieces(posBefore, mover)[0];
    if (best) {
      facts.push({
        type: 'missed_capture',
        piece: pieceName(best.piece),
        square: squareName(best.square),
        by: pieceName(best.attacker),
        gain: best.gain,
        move: squareName(best.from) + squareName(best.square),
      });
    }
  }

  return facts.sort((a, b) => SEVERITY[a.type] - SEVERITY[b.type]);
}
