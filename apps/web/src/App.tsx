import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyMove,
  isKingInCheck,
  moveToChinese,
  parseFen,
  parseUciMove,
  type Position,
  type Square,
  type Tone,
} from '@cc/rules';
import { Chessboard } from './board/Chessboard';
import { ReasonCard } from './explain/ReasonCard';
import { QuestionPanel } from './explain/QuestionPanel';
import { ReviewPanel } from './explain/ReviewPanel';
import { answerQuestion } from './explain/qa';
import { TIER_META } from './explain/winrate';
import { START_FEN, useGame } from './game/useGame';
import { applyPv } from './game/pv';
import { playMoveSound, primeAudio } from './game/sound';
import type { Ply } from './game/types';

export default function App() {
  const game = useGame();
  const [tone, setTone] = useState<Tone>('blunt');
  const [highlights, setHighlights] = useState<Square[]>([]);
  const [preview, setPreview] = useState<{ moves: string[]; index: number } | null>(null);
  const [inspect, setInspect] = useState<Ply | null>(null);

  const card = inspect ?? game.card;
  const started = game.phase !== 'idle';

  // 浏览器要求用户手势后才能出声，首次点任意位置先解锁
  useEffect(() => {
    const unlock = () => primeAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // 每走一步响一下：吃子更沉，将军叠铃声；悔棋（步数变少）不响
  const lastMoveRef = useRef(game.lastMove);
  const prevPosRef = useRef(game.position);
  const plyCountRef = useRef(game.plies.length);
  useEffect(() => {
    const undone = game.plies.length < plyCountRef.current;
    const isNewMove = game.lastMove !== lastMoveRef.current && game.lastMove !== null;
    if (isNewMove && !undone) {
      const captured =
        prevPosRef.current.board.filter(Boolean).length > game.position.board.filter(Boolean).length;
      playMoveSound({ capture: captured, check: isKingInCheck(game.position, game.position.turn) });
    }
    lastMoveRef.current = game.lastMove;
    prevPosRef.current = game.position;
    plyCountRef.current = game.plies.length;
  }, [game.lastMove, game.position, game.plies.length]);

  const resetViews = () => {
    setPreview(null);
    setHighlights([]);
    setInspect(null);
  };

  const displayPosition = useMemo(() => {
    if (preview && card?.fenBefore) {
      return applyPv(parseFen(card.fenBefore), preview.moves.slice(0, preview.index));
    }
    if (inspect?.fenBefore) return parseFen(inspect.fenBefore);
    return game.position;
  }, [preview, card, inspect, game.position]);

  const displayLastMove = useMemo(() => {
    if (preview) return null;
    if (inspect) return parseUciMove(inspect.uci);
    return game.lastMove;
  }, [preview, inspect, game.lastMove]);

  const chineseMoves = useMemo(() => {
    const out: string[] = [];
    let pos: Position | null = parseFen(START_FEN);
    for (const p of game.plies) {
      let text = p.uci;
      if (pos) {
        text = moveToChinese(pos, p.uci);
        try {
          pos = applyMove(pos, parseUciMove(p.uci));
        } catch {
          pos = null;
        }
      }
      out.push(text);
    }
    return out;
  }, [game.plies]);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>象棋教练</h1>
          <p className="status" data-testid="status">
            {game.status}
          </p>
        </div>
        <div className="actions">
          {game.savedPlies && !started && (
            <button
              data-testid="resume"
              onClick={() => {
                resetViews();
                void game.resume();
              }}
            >
              继续上一局（{Math.ceil(game.savedPlies.length / 2)} 回合）
            </button>
          )}
          {!started ? (
            <>
              <button
                data-testid="start-red"
                onClick={() => {
                  resetViews();
                  void game.start('red');
                }}
              >
                执红先手
              </button>
              <button
                data-testid="start-black"
                onClick={() => {
                  resetViews();
                  void game.start('black');
                }}
              >
                执黑后手
              </button>
            </>
          ) : (
            <button
              data-testid="start"
              onClick={() => {
                resetViews();
                void game.start(game.playerColor);
              }}
            >
              重新开始
            </button>
          )}
          <button data-testid="undo" disabled={!started || game.phase === 'loading'} onClick={game.undo}>
            悔棋
          </button>
          <button
            data-testid="difficulty"
            onClick={() => game.setDifficulty(game.difficulty === 'casual' ? 'serious' : 'casual')}
          >
            {game.difficulty === 'casual' ? '难度：陪练' : '难度：认真'}
          </button>
          <button data-testid="tone" onClick={() => setTone(tone === 'blunt' ? 'plain' : 'blunt')}>
            {tone === 'blunt' ? '语气：毒舌' : '语气：正经'}
          </button>
        </div>
      </header>

      {game.progress > 0 && game.progress < 100 && (
        <div className="progress" data-testid="progress">
          引擎加载 {game.progress}%
        </div>
      )}
      {game.error && (
        <pre className="error" data-testid="error">
          {game.error}
        </pre>
      )}

      <main className="layout">
        <div className="board-col">
          <Chessboard
            position={displayPosition}
            flipped={game.playerColor === 'black'}
            selected={preview || inspect ? null : game.selected}
            targets={preview || inspect ? [] : game.targets}
            lastMove={displayLastMove}
            highlights={highlights}
            onSquareClick={
              preview ? undefined : inspect ? () => setInspect(null) : game.onSquareClick
            }
          />
          {preview ? (
            <p className="hint">预演中，棋盘显示引擎推荐的变化。</p>
          ) : inspect ? (
            <p className="hint">
              正在回看第 {game.plies.indexOf(inspect) + 1} 步，点棋盘返回当前局面。
            </p>
          ) : (
            !started && (
              <p className="hint">选「执红先手」或「执黑后手」加载引擎，红方先走。</p>
            )
          )}
        </div>

        <aside className="side-col">
          {game.phase === 'over' && (
            <div className="result" data-testid="result">
              {game.result}
            </div>
          )}

          {game.phase === 'over' && (
            <ReviewPanel
              plies={game.plies}
              playerColor={game.playerColor}
              onJump={(ply) => {
                setPreview(null);
                setHighlights([]);
                setInspect(ply);
              }}
            />
          )}

          {card && card.mover === game.playerColor && (
            <>
              <ReasonCard
                ply={card}
                tone={tone}
                onHighlight={(sqs) => setHighlights(sqs)}
                preview={preview ? { index: preview.index, total: preview.moves.length } : null}
                onPreviewEnter={() => {
                  if (card.pv?.length) setPreview({ moves: card.pv, index: 0 });
                }}
                onPreviewStep={(delta) =>
                  setPreview((p) =>
                    p
                      ? { ...p, index: Math.max(0, Math.min(p.moves.length, p.index + delta)) }
                      : p
                  )
                }
                onPreviewExit={() => setPreview(null)}
              />
              <QuestionPanel
                ply={card}
                disabled={!!inspect || game.phase !== 'player'}
                onAsk={(q) =>
                  game.addQuestion(card, q, answerQuestion(card, q, tone, game.difficulty))
                }
              />
            </>
          )}

          <section className="history">
            <h2>棋谱</h2>
            {game.plies.length === 0 ? (
              <p className="hint">还没有走棋</p>
            ) : (
              <ol data-testid="history">
                {game.plies.map((p, i) => {
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

          {import.meta.env.DEV && game.phase === 'player' && (
            <button data-testid="dev-move" className="dev" onClick={() => game.devAutoMove()}>
              自动走一步（开发用）
            </button>
          )}
        </aside>
      </main>
    </div>
  );
}
