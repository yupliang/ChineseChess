import { describe, it, expect } from 'vitest';
import { analyzeMove, type Fact } from '../src';

const START_FEN =
  'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

// 红走 c3c4 后，黑车 a9→e9 一步将死（帅 e0 被自己的兵堵住，e1 被车控制）
const MATE_BEFORE = 'r4k3/9/9/9/9/9/2P6/9/9/3PKP3 w - - 0 1';

// 红车 a5 吃黑卒 a6，但 a6 被黑卒 a7 护着 —— 900 换 100
const BAD_TRADE_BEFORE = '3k5/9/p8/p8/R8/9/9/9/9/4K4 w - - 0 1';

// 同上但 a6 放的是黑车 —— 车换车走兵，不亏
const EVEN_TRADE_BEFORE = '3k5/9/p8/r8/R8/9/9/9/9/4K4 w - - 0 1';

// 红车 a4 可以白吃黑马 c4，却去走了 h0h1
const MISSED_CAPTURE_BEFORE = '3k5/9/9/9/9/R1n6/9/9/9/4K2R1 w - - 0 1';

// 黑车 a4 早就在吃红马 a3，红方走 h0h1 完全不管
const MISSED_THREAT_BEFORE = '3k5/9/9/9/9/r8/N8/9/9/4K2R1 w - - 0 1';

const types = (facts: Fact[]) => facts.map((f) => f.type);

describe('② 被将杀', () => {
  it('这步之后对手一步将死 → allow_mate', () => {
    const facts = analyzeMove(MATE_BEFORE, 'c3c4');
    expect(types(facts)).toContain('allow_mate');
    expect(facts.find((f) => f.type === 'allow_mate')).toEqual({
      type: 'allow_mate',
      mateIn: 1,
    });
  });

  it('正常开局不误报', () => {
    expect(types(analyzeMove(START_FEN, 'h2e2'))).not.toContain('allow_mate');
  });
});

describe('③ 兑子亏子力', () => {
  it('车吃兵被反吃 → bad_trade，净亏 800', () => {
    const facts = analyzeMove(BAD_TRADE_BEFORE, 'a5a6');
    expect(types(facts)).toContain('bad_trade');
    expect(facts.find((f) => f.type === 'bad_trade')).toEqual({
      type: 'bad_trade',
      won: ['卒'],
      lost: ['车'],
      delta: -800,
    });
  });

  it('车换车不亏 → 不报 bad_trade', () => {
    expect(types(analyzeMove(EVEN_TRADE_BEFORE, 'a5a6'))).not.toContain('bad_trade');
  });
});

describe('④ 漏看威胁', () => {
  it('对手早就盯着的马，这步没管 → missed_threat', () => {
    const facts = analyzeMove(MISSED_THREAT_BEFORE, 'h0h1');
    expect(types(facts)).toEqual(['missed_threat']);
    expect(facts[0]).toEqual({
      type: 'missed_threat',
      target: '马',
      square: 'a3',
      by: '车',
      gain: 400,
      move: 'a4a3',
    });
  });

  it('没有既有威胁时不误报', () => {
    expect(types(analyzeMove(START_FEN, 'h2e2'))).not.toContain('missed_threat');
  });
});

describe('⑤ 错过吃子', () => {
  it('有白吃马的机会没吃 → missed_capture', () => {
    const facts = analyzeMove(MISSED_CAPTURE_BEFORE, 'h0h1');
    expect(types(facts)).toEqual(['missed_capture']);
    expect(facts[0]).toEqual({
      type: 'missed_capture',
      piece: '马',
      square: 'c4',
      by: '车',
      gain: 400,
      move: 'a4c4',
    });
  });

  it('本回合已吃到便宜子时不再报「错过吃子」', () => {
    // 红车 a5 吃卒 a6，虽然亏，但确实吃了子，不该再说「你不吃」
    expect(types(analyzeMove(BAD_TRADE_BEFORE, 'a5a6'))).not.toContain(
      'missed_capture'
    );
  });
});

describe('输入校验', () => {
  it('非法着法直接抛错（不静默给出错误事实）', () => {
    expect(() => analyzeMove(START_FEN, 'a0a5')).toThrow(/illegal move/);
  });

  it('着法格式非法抛错', () => {
    expect(() => analyzeMove(START_FEN, 'zz')).toThrow(/invalid UCI/);
  });
});
