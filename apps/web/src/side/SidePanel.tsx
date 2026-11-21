import type { Color, Square, Tone } from '@cc/rules';
import { QuestionPanel } from '../explain/QuestionPanel';
import { ReasonCard } from '../explain/ReasonCard';
import { ReviewPanel } from '../explain/ReviewPanel';
import { TIER_META } from '../explain/winrate';
import type { Phase, Ply } from '../game/types';

export interface SidePanelProps {
  phase: Phase;
  result: string;
  tone: Tone;
  playerColor: Color;
  myTurn: boolean;
  plies: Ply[];
  chineseMoves: string[];
  card: Ply | null;
  inspectActive: boolean;
  preview: { index: number; total: number } | null;
  onHighlight: (squares: Square[]) => void;
  onPreviewEnter: () => void;
  onPreviewStep: (delta: number) => void;
  onPreviewExit: () => void;
  onInspect: (ply: Ply) => void;
  onAsk: (ply: Ply, question: string) => void;
  onDevMove?: () => void;
}

/** 教练面板：复盘、走法卡片、问答、棋谱。主窗口与独立面板窗口共用。 */
export function SidePanel({
  phase,
  result,
  tone,
  playerColor,
  myTurn,
  plies,
  chineseMoves,
  card,
  inspectActive,
  preview,
  onHighlight,
  onPreviewEnter,
  onPreviewStep,
  onPreviewExit,
  onInspect,
  onAsk,
  onDevMove,
}: SidePanelProps) {
  return (
    <aside className="side-col">
      {phase === 'over' && (
        <div className="result" data-testid="result">
          {result}
        </div>
      )}

      {phase === 'over' && (
        <ReviewPanel plies={plies} playerColor={playerColor} onJump={onInspect} />
      )}

      {card && card.mover === playerColor && (
        <>
          <ReasonCard
            ply={card}
            tone={tone}
            onHighlight={onHighlight}
            preview={preview}
            onPreviewEnter={onPreviewEnter}
            onPreviewStep={onPreviewStep}
            onPreviewExit={onPreviewExit}
          />
          <QuestionPanel
            ply={card}
            disabled={inspectActive || phase !== 'player'}
            onAsk={(q) => onAsk(card, q)}
          />
        </>
      )}

      {import.meta.env.DEV && myTurn && onDevMove && (
        <button data-testid="dev-move" className="dev" onClick={onDevMove}>
          自动走一步（开发用）
        </button>
      )}

      <section className="history">
        <h2>棋谱</h2>
        {plies.length === 0 ? (
          <p className="hint">还没有走棋</p>
        ) : (
          <ol data-testid="history">
            {plies.map((p, i) => {
              const meta = p.tier ? TIER_META[p.tier] : null;
              return (
                <li key={i} className={p.mover === 'red' ? 'red' : 'black'}>
                  {p.mover === 'red' ? '红' : '黑'} {chineseMoves[i]}
                  {meta && (
                    <span style={{ marginLeft: 8, color: meta.color, fontSize: 12 }}>
                      {meta.glyph}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </aside>
  );
}
