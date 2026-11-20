import type { CSSProperties } from 'react';
import { parseSquare, renderFacts, type Fact, type Square, type Tone } from '@cc/rules';
import { moveChineseFrom, pvChineseFrom } from '../game/pv';
import { describeDownside } from './qa';
import { TIER_META } from './winrate';
import type { Ply } from '../game/types';

export interface ReasonCardProps {
  ply: Ply;
  tone: Tone;
  onHighlight: (squares: Square[]) => void;
  preview: { index: number; total: number } | null;
  onPreviewEnter: () => void;
  onPreviewStep: (delta: number) => void;
  onPreviewExit: () => void;
}

function squareOf(fact: Fact): Square | null {
  if (fact.type === 'hanging_piece' || fact.type === 'missed_threat' || fact.type === 'missed_capture') {
    return parseSquare(fact.square);
  }
  return null;
}

export function ReasonCard({
  ply,
  tone,
  onHighlight,
  preview,
  onPreviewEnter,
  onPreviewStep,
  onPreviewExit,
}: ReasonCardProps) {
  const tier = ply.tier ?? 'normal';
  const meta = TIER_META[tier];
  const facts = ply.facts ?? [];
  const sentences = renderFacts(facts, tone, ply.mover);
  // 没有硬事实时，仍给亏得明显的棋展示引擎推荐与预演
  const showBetter = facts.length > 0 || (ply.lossPct ?? 0) >= 5;
  const betterMove = ply.bestMove && ply.bestMove !== ply.uci && showBetter ? ply.bestMove : null;

  return (
    <section
      data-testid="reason-card"
      style={{
        border: `1px solid ${meta.color}33`,
        borderLeft: `5px solid ${meta.color}`,
        background: meta.bg,
        borderRadius: 10,
        padding: '14px 16px',
        marginBottom: 14,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span
          data-testid="tier-badge"
          style={{
            background: meta.color,
            color: '#fff',
            borderRadius: 6,
            padding: '3px 9px',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {meta.glyph} {meta.label}
        </span>
        {ply.lossPct !== undefined && ply.lossPct >= 1 && (
          <span data-testid="loss" style={{ color: '#555', fontSize: 13 }}>
            这步掉了 {(ply.lossPct ?? 0).toFixed(1)}% 胜率
          </span>
        )}
        {tier === 'best' && (
          <span style={{ color: '#1b5e20', fontSize: 13 }}>这步就是引擎首选</span>
        )}
      </header>

      {sentences.length > 0 ? (
        <ul data-testid="fact-list" style={{ margin: '0 0 10px', paddingLeft: 0, listStyle: 'none' }}>
          {sentences.map((text, i) => {
            const sq = squareOf(facts[i]);
            return (
              <li
                key={i}
                data-testid="fact-item"
                style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6, lineHeight: 1.6 }}
              >
                <span style={{ flex: 1, color: '#222' }}>{text}</span>
                {sq && (
                  <button
                    onClick={() => onHighlight([sq])}
                    style={{
                      flexShrink: 0,
                      fontSize: 12,
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid #bbb',
                      background: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    标出来
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p style={{ margin: '0 0 10px', color: '#555' }}>{describeDownside(ply, tone)}</p>
      )}

      {betterMove && (
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 10 }}>
          <div style={{ fontSize: 13, color: '#444', marginBottom: 6 }}>
            引擎推荐：<code style={{ fontWeight: 700 }}>
              {moveChineseFrom(ply.fenBefore, betterMove)}
            </code>
            {ply.pv && ply.pv.length > 1 && (
              <span style={{ color: '#777' }}>
                （{pvChineseFrom(ply.fenBefore, ply.pv.slice(0, 3)).join(' ')} …）
              </span>
            )}
          </div>

          {preview ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} data-testid="preview-controls">
              <button
                data-testid="preview-prev"
                onClick={() => onPreviewStep(-1)}
                disabled={preview.index === 0}
                style={btn}
              >
                ◀ 上一步
              </button>
              <span style={{ fontSize: 13, color: '#444' }} data-testid="preview-status">
                第 {preview.index} / {preview.total} 步
              </span>
              <button
                data-testid="preview-next"
                onClick={() => onPreviewStep(1)}
                disabled={preview.index >= preview.total}
                style={btn}
              >
                下一步 ▶
              </button>
              <button data-testid="preview-exit" onClick={onPreviewExit} style={btn}>
                退出预演
              </button>
            </div>
          ) : (
            <button onClick={onPreviewEnter} style={btn} data-testid="preview-enter">
              看看该怎么走
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const btn: CSSProperties = {
  fontSize: 13,
  padding: '5px 10px',
  borderRadius: 7,
  border: '1px solid #bbb',
  background: '#fff',
  cursor: 'pointer',
};
