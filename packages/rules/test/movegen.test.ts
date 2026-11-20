import { describe, it, expect } from 'vitest';
import {
  parseFen,
  toFen,
  generateLegalMoves,
  isKingInCheck,
  parseSquare,
  squareName,
} from '../src';

const START_FEN =
  'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

describe('FEN 与坐标', () => {
  it('往返转换格子名', () => {
    expect(squareName(parseSquare('a0'))).toBe('a0');
    expect(squareName(parseSquare('e5'))).toBe('e5');
    expect(squareName(parseSquare('i9'))).toBe('i9');
  });

  it('解析起始局面：红方 16 子、黑方 16 子', () => {
    const pos = parseFen(START_FEN);
    const count = pos.board.filter(Boolean).length;
    expect(count).toBe(32);
    expect(pos.turn).toBe('red');
  });

  it('起始局面红方有 44 个合法着法（象棋 perft 1）', () => {
    expect(generateLegalMoves(parseFen(START_FEN))).toHaveLength(44);
  });

  it('FEN 往返无损：解析再序列化等于原串', () => {
    expect(toFen(parseFen(START_FEN))).toBe(START_FEN);
    const custom = '3k5/9/p8/p8/R8/9/9/9/9/4K4 w - - 0 1';
    expect(toFen(parseFen(custom))).toBe(custom);
  });
});

describe('合法性与将军', () => {
  it('白脸将：走开后两将照面属于非法着法', () => {
    // 红帅 e0、黑将 e9，红车 e5 挡在中间
    const pos = parseFen('4k4/9/9/9/4R4/9/9/9/9/4K4 w - - 0 1');
    const legal = generateLegalMoves(pos).map((m) => squareName(m.from) + squareName(m.to));
    expect(legal).not.toContain('e5d5'); // 挪开车 → 将帅照面
    expect(legal).toContain('e5e6'); // 沿线走仍挡着
  });

  it('车控制整条纵线即可将军', () => {
    const pos = parseFen('4k4/9/9/9/9/9/9/9/9/R3K4 b - - 0 1');
    expect(isKingInCheck(pos, 'black')).toBe(true);
  });

  it('起始局面双方都不被将军', () => {
    const pos = parseFen(START_FEN);
    expect(isKingInCheck(pos, 'red')).toBe(false);
    expect(isKingInCheck(pos, 'black')).toBe(false);
  });
});
