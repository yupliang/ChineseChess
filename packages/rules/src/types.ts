export type Color = 'red' | 'black';

/** K=帅/将 A=仕/士 B=相/象 N=马 R=车 C=炮 P=兵/卒 */
export type PieceType = 'K' | 'A' | 'B' | 'N' | 'R' | 'C' | 'P';

export interface Piece {
  color: Color;
  type: PieceType;
}

/** 坐标：file 0..8 对应 a..i，rank 0..9（rank 0 = 红方底线，与 UCCI 一致） */
export interface Square {
  file: number;
  rank: number;
}

export interface Move {
  from: Square;
  to: Square;
}

export interface Position {
  board: (Piece | null)[];
  turn: Color;
  halfmove: number;
  fullmove: number;
}

/**
 * 事实：走完这一步之后，己方某子可以被对手白吃。
 * SEE 净收益 >= HANGING_THRESHOLD 才算，避免把正常兑子误报成送子。
 */
export interface HangingPiece {
  piece: Piece;
  square: Square;
  attacker: Piece;
  from: Square;
  gain: number;
}

/**
 * 一步棋的「臭」的客观依据。每条都必须自包含、可校验：
 * 里面出现的棋子 / 格子都能在局面里找到。
 */
export type Fact =
  /** 这步之后，己方某子失去保护，可被白吃（因这步新产生） */
  | {
      type: 'hanging_piece';
      piece: string;
      square: string;
      attacker: string;
      gain: number;
      /** 对手的吃子着法（UCI），用于和引擎结论对齐 */
      move: string;
    }
  /** 这步之后，对手可以直接将杀 */
  | {
      type: 'allow_mate';
      mateIn: number;
    }
  /** 主动发起亏本交换（吃子后交换下来净亏） */
  | {
      type: 'bad_trade';
      won: string[];
      lost: string[];
      delta: number;
    }
  /** 对手本来就有的白吃威胁，这步没有处理 */
  | {
      type: 'missed_threat';
      target: string;
      square: string;
      by: string;
      gain: number;
      move: string;
    }
  /** 本回合本来可以白吃对方棋子，却没有走 */
  | {
      type: 'missed_capture';
      piece: string;
      square: string;
      by: string;
      gain: number;
      move: string;
    };
