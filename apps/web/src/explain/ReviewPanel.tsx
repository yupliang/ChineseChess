import type { Color } from '@cc/rules';
import { moveChineseFrom } from '../game/pv';
import type { Ply } from '../game/types';
import { moveAccuracy, TIER_META } from './winrate';

export interface ReviewPanelProps {
  plies: Ply[];
  playerColor: Color;
  onJump: (ply: Ply) => void;
}

const CHART_W = 320;
const CHART_H = 110;
const PAD = 8;

export function ReviewPanel({ plies, playerColor, onJump }: ReviewPanelProps) {
  const sideName = playerColor === 'red' ? '红方' : '黑方';
  const reds = plies.filter((p) => p.mover === playerColor && p.winAfter !== undefined);
  if (reds.length === 0) return null;

  const accuracy = Math.round(
    reds.reduce((sum, p) => sum + moveAccuracy(p.winBefore ?? 50, p.winAfter ?? 50), 0) /
      reds.length
  );

  const worst = [...reds]
    .sort((a, b) => (b.lossPct ?? 0) - (a.lossPct ?? 0))
    .slice(0, 3)
    .filter((p) => (p.lossPct ?? 0) > 0);

  const curve = [50, ...reds.map((p) => p.winAfter ?? 50)];
  const stepX = curve.length > 1 ? (CHART_W - PAD * 2) / (curve.length - 1) : 0;
  const yOf = (win: number) => CHART_H - PAD - (win / 100) * (CHART_H - PAD * 2);
  const points = curve.map((win, i) => `${PAD + i * stepX},${yOf(win)}`).join(' ');

  return (
    <section className="review" data-testid="review">
      <header className="review-head">
        <h2>本局复盘</h2>
        <span className="accuracy" data-testid="accuracy">
          准确率 {accuracy}%
        </span>
      </header>

      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        style={{ width: '100%', display: 'block', margin: '6px 0 12px' }}
        aria-label={`${sideName}胜率曲线`}
      >
        <line
          x1={PAD}
          y1={yOf(50)}
          x2={CHART_W - PAD}
          y2={yOf(50)}
          stroke="#c9c2b4"
          strokeDasharray="4 4"
        />
        <polyline points={points} fill="none" stroke="#b3261e" strokeWidth={2} />
        {curve.map((win, i) => (
          <circle
            key={i}
            cx={PAD + i * stepX}
            cy={yOf(win)}
            r={i === 0 ? 2 : 2.6}
            fill={i === 0 ? '#999' : '#b3261e'}
          />
        ))}
      </svg>
      <div className="chart-legend">
        <span>{curve.length - 1} 步</span>
        <span>上：{sideName}胜率高</span>
      </div>

      <h3>最臭的 3 步</h3>
      {worst.length === 0 ? (
        <p className="hint">这局没什么明显臭棋。</p>
      ) : (
        <ul className="worst-list" data-testid="worst-list">
          {worst.map((p, i) => {
            const meta = TIER_META[p.tier ?? 'normal'];
            return (
              <li key={i} data-testid="worst-item">
                <span className="badge" style={{ background: meta.color }}>
                  {meta.glyph}
                </span>
                <code>{moveChineseFrom(p.fenBefore, p.uci)}</code>
                <span className="loss">亏 {(p.lossPct ?? 0).toFixed(1)}% 胜率</span>
                <button onClick={() => onJump(p)}>看这步</button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
