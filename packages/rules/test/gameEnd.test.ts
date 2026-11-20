import { describe, it, expect } from 'vitest';
import { judgeGameEnd, parseFen, positionKey, type Position } from '../src';

const START_FEN =
  'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

// 红方被将死：帅 e0 被自家兵堵死，e1 被黑车控制
const MATE_IN_FEN = '3kr4/9/9/9/9/9/9/9/9/3PKP3 w - - 0 1';

describe('对局结束判定', () => {
  it('开局不结束', () => {
    const pos = parseFen(START_FEN);
    expect(judgeGameEnd(pos, [pos], [false])).toEqual({
      over: false,
      winner: null,
      reason: null,
    });
  });

  it('被将死判负', () => {
    const pos = parseFen(MATE_IN_FEN);
    expect(judgeGameEnd(pos, [pos], [true])).toEqual({
      over: true,
      winner: 'black',
      reason: 'checkmate',
    });
  });

  it('三次重复局面判和', () => {
    const pos = parseFen('4k4/9/9/9/4P4/9/9/9/9/4K4 w - - 0 1');
    const end = judgeGameEnd(pos, [pos, pos, pos], [false, false, false]);
    expect(end).toEqual({ over: true, winner: null, reason: 'repetition' });
  });

  it('长将判负：红方每步都将军 → 红负', () => {
    const fens = [
      'R3k4/9/9/9/4P4/9/9/9/9/4K4 b - - 0 1',
      'R8/4k4/9/9/4P4/9/9/9/9/4K4 w - - 0 2',
      '9/R3k4/9/9/4P4/9/9/9/9/4K4 b - - 0 2',
      'R8/9/9/9/4P4/9/9/9/9/4K4 w - - 0 3',
      'R3k4/9/9/9/4P4/9/9/9/9/4K4 b - - 0 3',
      'R8/4k4/9/9/4P4/9/9/9/9/4K4 w - - 0 4',
      '9/R3k4/9/9/4P4/9/9/9/9/4K4 b - - 0 4',
      'R8/9/9/9/4P4/9/9/9/9/4K4 w - - 0 5',
      'R3k4/9/9/9/4P4/9/9/9/9/4K4 b - - 0 5',
    ];
    const history: Position[] = fens.map(parseFen);
    const gaveCheck = [false, false, true, false, true, false, true, false, true];

    const end = judgeGameEnd(history[history.length - 1], history, gaveCheck);
    expect(end).toEqual({ over: true, winner: 'black', reason: 'perpetual-check' });
  });

  it('60 回合无吃子判和', () => {
    const pos = parseFen('4k4/9/9/9/4P4/9/9/9/9/4K4 w - - 120 120');
    const end = judgeGameEnd(pos, [pos], [false]);
    expect(end).toEqual({ over: true, winner: null, reason: 'sixty-move' });
  });

  it('吃子后计数清零：局面标识忽略计数字段', () => {
    const a = parseFen('4k4/9/9/9/4P4/9/9/9/9/4K4 w - - 0 1');
    const b = parseFen('4k4/9/9/9/4P4/9/9/9/9/4K4 w - - 60 61');
    expect(positionKey(a)).toBe(positionKey(b));
  });
});
