import { idx, inBoard, inPalace, findKing, applyMove } from './board';
import type { Color, Move, Piece, Position, Square } from './types';

const ORTHO: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const DIAG: Array<[number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** 马的 8 个走法：[df, dr, 马腿 df, 马腿 dr] */
const HORSE: Array<[number, number, number, number]> = [
  [1, 2, 0, 1],
  [-1, 2, 0, 1],
  [1, -2, 0, -1],
  [-1, -2, 0, -1],
  [2, 1, 1, 0],
  [2, -1, 1, 0],
  [-2, 1, -1, 0],
  [-2, -1, -1, 0],
];

function offset(sq: Square, df: number, dr: number): Square {
  return { file: sq.file + df, rank: sq.rank + dr };
}

function forward(color: Color): number {
  return color === 'red' ? 1 : -1;
}

function hasCrossedRiver(color: Color, sq: Square): boolean {
  return color === 'red' ? sq.rank >= 5 : sq.rank <= 4;
}

/** 生成某一方的全部伪合法着法（不检查是否让己方被将军）。 */
export function generatePseudoMoves(pos: Position, color: Color): Move[] {
  const moves: Move[] = [];
  const board = pos.board;

  const add = (from: Square, to: Square): boolean => {
    if (!inBoard(to)) return false;
    const target = board[idx(to)];
    if (target && target.color === color) return false;
    moves.push({ from, to });
    return target === null; // 空位才可继续滑动
  };

  for (let rank = 0; rank <= 9; rank++) {
    for (let file = 0; file <= 8; file++) {
      const from: Square = { file, rank };
      const piece = board[idx(from)];
      if (!piece || piece.color !== color) continue;

      switch (piece.type) {
        case 'K': {
          for (const [df, dr] of ORTHO) {
            const to = offset(from, df, dr);
            if (inPalace(color, to)) add(from, to);
          }
          // 白脸将：同列无阻挡时可吃对方将帅
          const enemyKing = findKing(pos, color === 'red' ? 'black' : 'red');
          if (enemyKing && enemyKing.file === from.file) {
            const step = enemyKing.rank > from.rank ? 1 : -1;
            let blocked = false;
            for (let r = from.rank + step; r !== enemyKing.rank; r += step) {
              if (board[idx({ file: from.file, rank: r })]) blocked = true;
            }
            if (!blocked) moves.push({ from, to: enemyKing });
          }
          break;
        }
        case 'A': {
          for (const [df, dr] of DIAG) {
            const to = offset(from, df, dr);
            if (inPalace(color, to)) add(from, to);
          }
          break;
        }
        case 'B': {
          for (const [df, dr] of DIAG) {
            const to = offset(from, df * 2, dr * 2);
            if (!inBoard(to)) continue;
            // 象不过河
            if (color === 'red' ? to.rank > 4 : to.rank < 5) continue;
            const eye = offset(from, df, dr);
            if (board[idx(eye)]) continue; // 塞象眼
            add(from, to);
          }
          break;
        }
        case 'N': {
          for (const [df, dr, lf, lr] of HORSE) {
            const leg = offset(from, lf, lr);
            if (board[idx(leg)]) continue; // 蹩马腿
            add(from, offset(from, df, dr));
          }
          break;
        }
        case 'R': {
          for (const [df, dr] of ORTHO) {
            let to = offset(from, df, dr);
            while (inBoard(to)) {
              if (!add(from, to)) break;
              to = offset(to, df, dr);
            }
          }
          break;
        }
        case 'C': {
          for (const [df, dr] of ORTHO) {
            let to = offset(from, df, dr);
            // 无炮架时只能走空位
            while (inBoard(to) && !board[idx(to)]) {
              moves.push({ from, to });
              to = offset(to, df, dr);
            }
            // 找到炮架后，越过它找第一个子，是敌子则可吃
            if (!inBoard(to)) continue;
            to = offset(to, df, dr);
            while (inBoard(to) && !board[idx(to)]) {
              to = offset(to, df, dr);
            }
            if (inBoard(to)) {
              const target = board[idx(to)] as Piece;
              if (target.color !== color) moves.push({ from, to });
            }
          }
          break;
        }
        case 'P': {
          add(from, offset(from, 0, forward(color)));
          if (hasCrossedRiver(color, from)) {
            add(from, offset(from, 1, 0));
            add(from, offset(from, -1, 0));
          }
          break;
        }
      }
    }
  }

  return moves;
}

/** 某格是否被 byColor 攻击（含炮架、马腿、白脸将等规则）。 */
export function isSquareAttacked(pos: Position, sq: Square, byColor: Color): boolean {
  if (!inBoard(sq)) return false;
  return generatePseudoMoves(pos, byColor).some(
    (m) => m.to.file === sq.file && m.to.rank === sq.rank
  );
}

export function isKingInCheck(pos: Position, color: Color): boolean {
  const king = findKing(pos, color);
  if (!king) return false;
  return isSquareAttacked(pos, king, color === 'red' ? 'black' : 'red');
}

/** 该方全部合法着法（过滤掉送将 / 白脸将）。默认取当前行棋方。 */
export function generateLegalMoves(pos: Position, color: Color = pos.turn): Move[] {
  return generatePseudoMoves(pos, color).filter((move) => {
    const after = applyMove(pos, move);
    return !isKingInCheck(after, color);
  });
}
