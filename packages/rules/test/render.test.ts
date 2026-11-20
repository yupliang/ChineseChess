import { describe, it, expect } from 'vitest';
import { renderFact, renderFacts, type Fact } from '../src';

const HANGING: Fact = {
  type: 'hanging_piece',
  piece: '炮',
  square: 'a5',
  attacker: '车',
  gain: 450,
  move: 'a9a5',
};

const BAD_TRADE: Fact = {
  type: 'bad_trade',
  won: ['卒'],
  lost: ['车'],
  delta: -800,
};

const MATE: Fact = { type: 'allow_mate', mateIn: 1 };

describe('模板渲染器', () => {
  it('毒舌语气带情绪但落在事实上', () => {
    const text = renderFact(HANGING, 'blunt');
    expect(text).toContain('白给');
    expect(text).toContain('炮');
    expect(text).toContain('九路');
    expect(text).toContain('450');
  });

  it('正经语气去掉情绪词', () => {
    const text = renderFact(HANGING, 'plain');
    expect(text).not.toContain('白给');
    expect(text).toContain('失去保护');
    expect(text).toContain('450');
  });

  it('两种语气确实不同', () => {
    expect(renderFact(HANGING, 'blunt')).not.toBe(renderFact(HANGING, 'plain'));
  });

  it('兑子亏损金额取绝对值，不出现负号', () => {
    const text = renderFact(BAD_TRADE, 'plain');
    expect(text).toContain('净亏 800');
    expect(text).not.toContain('-800');
  });

  it('将杀提示不依赖数值细节', () => {
    expect(renderFact(MATE, 'blunt')).toContain('将死');
    expect(renderFact(MATE, 'plain')).toContain('将杀');
  });

  it('批量渲染保持顺序与数量', () => {
    const out = renderFacts([MATE, HANGING, BAD_TRADE]);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(renderFact(MATE, 'blunt'));
  });
});
