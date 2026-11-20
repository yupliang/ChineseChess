import { describe, it, expect } from 'vitest';
import { confirmFacts, type EngineEvidence, type Fact } from '../src';

const HANGING: Fact = {
  type: 'hanging_piece',
  piece: '炮',
  square: 'a5',
  attacker: '车',
  gain: 450,
  move: 'a9a5',
};

const MISSED_CAPTURE: Fact = {
  type: 'missed_capture',
  piece: '马',
  square: 'c4',
  by: '车',
  gain: 400,
  move: 'a4c4',
};

const MISSED_THREAT: Fact = {
  type: 'missed_threat',
  target: '马',
  square: 'a3',
  by: '车',
  gain: 400,
  move: 'a5a3',
};

const BAD_TRADE: Fact = {
  type: 'bad_trade',
  won: ['卒'],
  lost: ['车'],
  delta: -800,
};

const MATE: Fact = { type: 'allow_mate', mateIn: 1 };

const evidence = (over: Partial<EngineEvidence> = {}): EngineEvidence => ({
  bestReply: 'a9a5',
  bestMoveBefore: 'a4c4',
  lossPct: 20,
  ...over,
});

describe('事实与引擎的一致性门禁', () => {
  it('引擎应着就是这步吃子 → 保留白送子', () => {
    expect(confirmFacts([HANGING], evidence())).toHaveLength(1);
  });

  it('引擎有别的应着 → 丢掉这条白送子预测', () => {
    expect(confirmFacts([HANGING], evidence({ bestReply: 'h2e2' }))).toHaveLength(0);
  });

  it('引擎没推荐这一手 → 不算「错过吃子」', () => {
    expect(confirmFacts([MISSED_CAPTURE], evidence())).toHaveLength(1);
    expect(
      confirmFacts([MISSED_CAPTURE], evidence({ bestMoveBefore: 'h2e2' }))
    ).toHaveLength(0);
  });

  it('旧威胁同样要求引擎应着匹配', () => {
    expect(confirmFacts([MISSED_THREAT], evidence({ bestReply: 'a5a3' }))).toHaveLength(1);
    expect(confirmFacts([MISSED_THREAT], evidence({ bestReply: 'b0b1' }))).toHaveLength(0);
  });

  it('兑子亏损要求引擎也认为亏（损失 >= 5%）', () => {
    expect(confirmFacts([BAD_TRADE], evidence({ lossPct: 12 }))).toHaveLength(1);
    expect(confirmFacts([BAD_TRADE], evidence({ lossPct: 2 }))).toHaveLength(0);
  });

  it('一步杀由规则层证明，不依赖引擎', () => {
    expect(confirmFacts([MATE], evidence({ bestReply: 'x', lossPct: 0 }))).toHaveLength(1);
  });

  it('混合事实按各自规则保留/丢弃', () => {
    const kept = confirmFacts([MATE, HANGING, MISSED_CAPTURE, BAD_TRADE], evidence({ lossPct: 1, bestReply: 'zz' }));
    expect(kept.map((f) => f.type)).toEqual(['allow_mate', 'missed_capture']);
  });
});
