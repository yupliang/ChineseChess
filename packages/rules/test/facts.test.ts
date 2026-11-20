import { describe, it, expect } from 'vitest';
import { analyzeHangingFen, findHangingPieces, parseFen, HANGING_THRESHOLD } from '../src';

const START_FEN =
  'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

// 黑车 a9 直线吃红炮 a5，红方没有任何子能救 —— 真·白送
const HANGING_CANNON_FEN = 'r2k5/9/9/9/C8/9/9/9/9/4K4 b - - 0 1';

// 同上，但红车在 a0 护着 a5：黑车吃完会被反吃，属于兑子，不算送
const DEFENDED_CANNON_FEN = 'r2k5/9/9/9/C8/9/9/9/9/R3K4 b - - 0 1';

// 无保护的红兵：价值 100，低于阈值，不该报「白送」
const HANGING_PAWN_FEN = 'r2k5/9/9/9/P8/9/9/9/9/4K4 b - - 0 1';

describe('白送子事实', () => {
  it('识别无根炮：车吃炮、净赚 450', () => {
    const facts = analyzeHangingFen(HANGING_CANNON_FEN);
    expect(facts).toHaveLength(1);
    const [fact] = facts;
    expect(fact.type).toBe('hanging_piece');
    if (fact.type !== 'hanging_piece') throw new Error('unreachable');

    console.log(
      `\n[M1 验收] ${HANGING_CANNON_FEN}\n  → 对手这步白吃了一个${fact.piece}（在 ${fact.square}，由${fact.attacker}吃，净赚 ${fact.gain}）\n`
    );
    expect(fact.piece).toBe('炮');
    expect(fact.square).toBe('a5');
    expect(fact.attacker).toBe('车');
    expect(fact.gain).toBe(450);
  });

  it('有保护不算送：黑车吃炮会被红车反吃', () => {
    expect(analyzeHangingFen(DEFENDED_CANNON_FEN)).toEqual([]);
  });

  it('低价值子不报：无保护的兵只值 100', () => {
    expect(analyzeHangingFen(HANGING_PAWN_FEN)).toEqual([]);
  });

  it('安静局面不报：起始局面红方没有吃子机会', () => {
    expect(analyzeHangingFen(START_FEN)).toEqual([]);
  });

  it('阈值可解释：SEE 低于 HANGING_THRESHOLD 一律丢弃', () => {
    const facts = findHangingPieces(parseFen(DEFENDED_CANNON_FEN));
    expect(facts.every((f) => f.gain >= HANGING_THRESHOLD)).toBe(true);
  });
});
