/** 引擎评分（centipawn）换算成胜率百分比。公式来自 lichess，象棋先沿用，后续用真实对局校准。 */
export function cpToWinPct(cp: number): number {
  const clamped = Math.max(-1500, Math.min(1500, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

export type Tier = 'best' | 'normal' | 'dubious' | 'bad' | 'blunder';

/**
 * 按「胜率损失」分档：
 *   <5% 正常，5–10% 可疑，10–20% 差，>20% 臭棋。
 * 走的正是引擎第一推荐时直接算好棋。
 */
export function tierFor(lossPct: number, isEngineBest: boolean): Tier {
  if (isEngineBest) return 'best';
  if (lossPct < 5) return 'normal';
  if (lossPct < 10) return 'dubious';
  if (lossPct < 20) return 'bad';
  return 'blunder';
}

export const TIER_META: Record<
  Tier,
  { label: string; glyph: string; color: string; bg: string }
> = {
  best: { label: '好棋', glyph: '★', color: '#1b5e20', bg: '#e8f5e9' },
  normal: { label: '正常', glyph: '·', color: '#4a4a4a', bg: '#f4f4f4' },
  dubious: { label: '可疑', glyph: '?!', color: '#8a6d00', bg: '#fff8e1' },
  bad: { label: '差', glyph: '?', color: '#b35200', bg: '#fff3e0' },
  blunder: { label: '臭棋', glyph: '??', color: '#b3261e', bg: '#ffebee' },
};

/** 单步准确率：胜率损失越大扣得越多（同 lichess 的换算形式）。 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const diff = Math.max(0, winBefore - winAfter);
  const acc = 103.1668 * Math.exp(-0.04354 * diff) - 3.1669;
  return Math.max(0, Math.min(100, acc));
}
