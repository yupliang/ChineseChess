import type { Color, Move, Piece, Position, Square, PieceType } from './types';

export const FILES = 'abcdefghi';

export function idx(sq: Square): number {
  return sq.rank * 9 + sq.file;
}

export function sameSquare(a: Square, b: Square): boolean {
  return a.file === b.file && a.rank === b.rank;
}

export function squareName(sq: Square): string {
  return FILES[sq.file] + sq.rank;
}

export function parseSquare(name: string): Square {
  const file = FILES.indexOf(name[0]);
  const rank = Number(name.slice(1));
  if (file < 0 || !Number.isInteger(rank) || rank < 0 || rank > 9) {
    throw new Error(`invalid square: ${name}`);
  }
  return { file, rank };
}

export function inBoard(sq: Square): boolean {
  return sq.file >= 0 && sq.file <= 8 && sq.rank >= 0 && sq.rank <= 9;
}

export function inPalace(color: Color, sq: Square): boolean {
  if (sq.file < 3 || sq.file > 5) return false;
  return color === 'red' ? sq.rank <= 2 : sq.rank >= 7;
}

export function pieceAt(pos: Position, sq: Square): Piece | null {
  return pos.board[idx(sq)];
}

export function findKing(pos: Position, color: Color): Square | null {
  for (let rank = 0; rank <= 9; rank++) {
    for (let file = 0; file <= 8; file++) {
      const p = pos.board[idx({ file, rank })];
      if (p && p.color === color && p.type === 'K') return { file, rank };
    }
  }
  return null;
}

export function applyMove(pos: Position, move: Move): Position {
  const board = pos.board.slice();
  const captured = board[idx(move.to)];
  board[idx(move.to)] = board[idx(move.from)];
  board[idx(move.from)] = null;
  return {
    board,
    turn: pos.turn === 'red' ? 'black' : 'red',
    // 象棋的 60 回合自然限着只看吃子，兵卒推进不重置计数
    halfmove: captured ? 0 : pos.halfmove + 1,
    fullmove: pos.turn === 'black' ? pos.fullmove + 1 : pos.fullmove,
  };
}

const FEN_CHARS: Record<string, Piece> = {
  k: { color: 'black', type: 'K' },
  a: { color: 'black', type: 'A' },
  b: { color: 'black', type: 'B' },
  n: { color: 'black', type: 'N' },
  r: { color: 'black', type: 'R' },
  c: { color: 'black', type: 'C' },
  p: { color: 'black', type: 'P' },
  K: { color: 'red', type: 'K' },
  A: { color: 'red', type: 'A' },
  B: { color: 'red', type: 'B' },
  N: { color: 'red', type: 'N' },
  R: { color: 'red', type: 'R' },
  C: { color: 'red', type: 'C' },
  P: { color: 'red', type: 'P' },
};

/**
 * 解析象棋 FEN。FEN 第一行是黑方底线（rank 9），最后一行是红方底线（rank 0）。
 * 行棋方字段 'w'/'r' 表示红方，'b' 表示黑方。
 */
export function parseFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  const placement = parts[0];
  const rows = placement.split('/');
  if (rows.length !== 10) {
    throw new Error(`invalid xiangqi FEN: expected 10 ranks, got ${rows.length}`);
  }

  const board: (Piece | null)[] = new Array(90).fill(null);
  rows.forEach((row, rowIndex) => {
    const rank = 9 - rowIndex;
    let file = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '9') {
        file += Number(ch);
        continue;
      }
      const piece = FEN_CHARS[ch];
      if (!piece) throw new Error(`invalid piece char in FEN: ${ch}`);
      if (file > 8) throw new Error(`rank overflow in FEN row: ${row}`);
      board[idx({ file, rank })] = piece;
      file++;
    }
    if (file !== 9) throw new Error(`rank does not contain 9 files: ${row}`);
  });

  const turnField = parts[1] ?? 'w';
  const turn: Color = turnField === 'b' ? 'black' : 'red';
  return {
    board,
    turn,
    halfmove: Number(parts[4] ?? 0),
    fullmove: Number(parts[5] ?? 1),
  };
}

const CHAR_BY_PIECE: Record<string, string> = {
  'black:K': 'k',
  'black:A': 'a',
  'black:B': 'b',
  'black:N': 'n',
  'black:R': 'r',
  'black:C': 'c',
  'black:P': 'p',
  'red:K': 'K',
  'red:A': 'A',
  'red:B': 'B',
  'red:N': 'N',
  'red:R': 'R',
  'red:C': 'C',
  'red:P': 'P',
};

/** 把局面序列化成象棋 FEN（与 parseFen 互逆）。 */
export function toFen(pos: Position): string {
  const rows: string[] = [];
  for (let rowIndex = 0; rowIndex < 10; rowIndex++) {
    const rank = 9 - rowIndex;
    let row = '';
    let empty = 0;
    for (let file = 0; file <= 8; file++) {
      const piece = pos.board[idx({ file, rank })];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty > 0) {
        row += empty;
        empty = 0;
      }
      row += CHAR_BY_PIECE[`${piece.color}:${piece.type}`];
    }
    if (empty > 0) row += empty;
    rows.push(row);
  }
  const turn = pos.turn === 'red' ? 'w' : 'b';
  return `${rows.join('/')} ${turn} - - ${pos.halfmove} ${pos.fullmove}`;
}

/** 棋子中文名，按颜色区分（帅/将、仕/士、相/象、兵/卒）。 */
export function pieceName(piece: Piece): string {
  const names: Record<PieceType, [string, string]> = {
    K: ['帅', '将'],
    A: ['仕', '士'],
    B: ['相', '象'],
    N: ['马', '马'],
    R: ['车', '车'],
    C: ['炮', '炮'],
    P: ['兵', '卒'],
  };
  return piece.color === 'red' ? names[piece.type][0] : names[piece.type][1];
}

/** 子力面值（车 900 / 炮 450 / 马 400 / 士象 200 / 兵 100）。 */
export function pieceValue(type: PieceType): number {
  switch (type) {
    case 'K':
      return 10000;
    case 'R':
      return 900;
    case 'C':
      return 450;
    case 'N':
      return 400;
    case 'B':
    case 'A':
      return 200;
    case 'P':
      return 100;
  }
}
