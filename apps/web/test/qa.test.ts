import { describe, expect, it } from 'vitest';
import { answerQuestion } from '../src/explain/qa';
import type { Ply } from '../src/game/types';

/**
 * 红方刚走 仕五退六，轮到黑方。
 * 黑方 车2平5 会形成将军：红方可以 仕六进五 垫（不亏子），
 * 也可以 炮二平五 垫（之后白丢这个炮）。
 * 黑将放在 d9，避免双方老将同线互相照面。
 */
const BEFORE = '3k5/9/9/9/1r7/9/9/7C1/4A4/4K4 w - - 0 1';

const PLY: Ply = {
  uci: 'e1d0',
  mover: 'red',
  fenBefore: BEFORE,
  tier: 'normal',
  lossPct: 8,
};

function withHistory(question: string, answer: string): Ply {
  return { ...PLY, qa: [{ q: question, a: answer, at: 1 }] };
}

/**
 * 黑马 c4 可以吃红炮 b2（+450），但红马 c0 能立刻吃回来（马换马），净赚 50。
 * 用来验证「净赚 50」这类结论会把算式摊开，而不是只丢一个数字。
 */
const TRADE_BEFORE = '3k5/9/9/9/9/2n6/9/1C7/4N4/4K4 w - - 0 1';
const TRADE_PLY: Ply = {
  uci: 'e1c0',
  mover: 'red',
  fenBefore: TRADE_BEFORE,
  tier: 'normal',
  lossPct: 6,
};

describe('追问：站在对手视角继续聊', () => {
  it('能反解问题里的着法', () => {
    const answer = answerQuestion(PLY, '他为什么不车2平5？', 'blunt');
    expect(answer).toContain('车2平5');
  });

  it('垫子追问逐条核实，而不是掉回兜底语', () => {
    const first = answerQuestion(PLY, '他为什么不车2平5？', 'blunt');
    const answer = answerQuestion(
      withHistory('他为什么不车2平5？', first),
      '我可以垫子，但对面的车可以马上离开去吃我的棋子啊',
      'blunt'
    );

    expect(answer).not.toContain('我暂时只能回答三类');
    expect(answer).toContain('仕六进五');
    expect(answer).toContain('炮二平五');
  });

  it('兑子结论要摊开算式，不能只丢一个净收益', () => {
    const answer = answerQuestion(TRADE_PLY, '对面为什么不马3进2吃我的炮', 'blunt');

    expect(answer).toContain('（+450）');
    expect(answer).toContain('你的马立刻能吃回来');
    expect(answer).toContain('只净赚 50');
    expect(answer).toContain('一个兵（100）');
  });
});
