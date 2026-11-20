import { describe, it, expect } from 'vitest';
import { laneName, moveToChinese, parseFen } from '../src';

const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

describe('中文记谱', () => {
  const start = parseFen(START_FEN);

  it('开局炮二平五', () => {
    expect(moveToChinese(start, 'h2e2')).toBe('炮二平五');
  });

  it('马八进七 / 马8进7 按各自颜色数路', () => {
    expect(moveToChinese(start, 'b0c2')).toBe('马八进七');
    expect(moveToChinese(start, 'h9g7')).toBe('马8进7');
  });

  it('兵五进一与仕六进五', () => {
    expect(moveToChinese(start, 'e3e4')).toBe('兵五进一');
    expect(moveToChinese(start, 'd0e1')).toBe('仕六进五');
  });

  it('同纵线两车加前后缀', () => {
    const pos = parseFen('rnbakabnr/9/1c5c1/p1p1p1p1p/R8/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1');
    expect(moveToChinese(pos, 'a5a2')).toBe('前车退三');
    expect(moveToChinese(pos, 'a0a1')).toBe('后车进一');
  });

  it('非法着法原样返回', () => {
    expect(moveToChinese(start, 'zzzz')).toBe('zzzz');
  });

  it('路数名按行棋方视角', () => {
    expect(laneName('h2', 'red')).toBe('二');
    expect(laneName('h2', 'black')).toBe('8');
    expect(laneName('a0', 'red')).toBe('九');
    expect(laneName('a0', 'black')).toBe('1');
  });
});
