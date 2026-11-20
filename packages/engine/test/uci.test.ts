import { describe, it, expect } from 'vitest';
import { parseInfoLine, parseBestmove, assembleSearch } from '../src/uci';

describe('uci parse', () => {
  it('parses a cp info line', () => {
    const info = parseInfoLine(
      'info depth 14 seldepth 22 multipv 1 score cp 123 nodes 100 nps 1000 pv h2e2 e7e6'
    );
    expect(info).not.toBeNull();
    expect(info!.scoreCp).toBe(123);
    expect(info!.depth).toBe(14);
    expect(info!.pv).toEqual(['h2e2', 'e7e6']);
    expect(info!.nps).toBe(1000);
  });

  it('parses mate score', () => {
    const info = parseInfoLine('info depth 8 multipv 1 score mate 3 pv a0a1');
    expect(info!.mateIn).toBe(3);
    expect(info!.scoreCp).toBeGreaterThan(10000);
  });

  it('parses negative mate score', () => {
    const info = parseInfoLine('info depth 8 multipv 1 score mate -2 pv a0a1');
    expect(info!.mateIn).toBe(-2);
    expect(info!.scoreCp).toBeLessThan(-10000);
  });

  it('ignores lines without score', () => {
    expect(parseInfoLine('info depth 1 seldepth 1 nodes 10 time 1')).toBeNull();
    expect(parseInfoLine('uciok')).toBeNull();
  });

  it('parses bestmove', () => {
    expect(parseBestmove('bestmove h2e2 ponder e7e6')).toBe('h2e2');
    expect(parseBestmove('bestmove (none)')).toBe('(none)');
    expect(parseBestmove('info depth 1')).toBeNull();
  });

  it('assembles deepest info per multipv and attaches bestmove', () => {
    const lines = [
      'info depth 10 multipv 1 score cp 50 pv a0a1',
      'info depth 14 multipv 1 score cp 80 pv h2e2 e7e6',
      'info depth 14 multipv 2 score cp -30 pv b0c2',
      'bestmove h2e2 ponder e7e6',
    ];
    const results = assembleSearch(lines);
    expect(results).toHaveLength(2);
    expect(results[0].bestMove).toBe('h2e2');
    expect(results[0].scoreCp).toBe(80);
    expect(results[0].pv).toEqual(['h2e2', 'e7e6']);
    expect(results[1].scoreCp).toBe(-30);
  });

  it('returns empty array when no info lines', () => {
    expect(assembleSearch(['uciok', 'readyok'])).toEqual([]);
  });
});
