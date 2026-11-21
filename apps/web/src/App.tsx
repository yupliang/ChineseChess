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
import { answerQuestion } from './explain/qa';
import { START_FEN, useGame } from './game/useGame';
import { applyPv } from './game/pv';
import { playMoveSound, primeAudio } from './game/sound';
import type { Ply } from './game/types';
import { SidePanel } from './side/SidePanel';
import {
  createPanelChannel,
  type PanelAction,
  type PanelLink,
  type PanelSnapshot,
} from './sync/panelSync';

export default function App() {
  const game = useGame();
  const [tone, setTone] = useState<Tone>('blunt');
  const [highlights, setHighlights] = useState<Square[]>([]);
  const [preview, setPreview] = useState<{ moves: string[]; index: number } | null>(null);
  const [inspect, setInspect] = useState<Ply | null>(null);

  const card = inspect ?? game.card;
  const started = game.phase !== 'idle';

  // 独立面板窗口：主窗口是唯一数据源，面板只负责展示并把操作发回来
  const popupRef = useRef<Window | null>(null);
  const [detached, setDetached] = useState(false);
  const linkRef = useRef<PanelLink | null>(null);
  const actionRef = useRef<(action: PanelAction) => void>(() => {});

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

  const snapshot: PanelSnapshot = {
    phase: game.phase,
    status: game.status,
    result: game.result,
    error: game.error,
    progress: game.progress,
    tone,
    difficulty: game.difficulty,
    playerColor: game.playerColor,
    myTurn: game.myTurn,
    plies: game.plies,
    chineseMoves,
    card,
    inspectActive: !!inspect,
    previewIndex: preview ? preview.index : null,
    previewTotal: preview ? preview.moves.length : null,
  };
  const snapshotRef = useRef<PanelSnapshot>(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    const link = createPanelChannel((msg) => {
      if (msg.kind === 'action') actionRef.current(msg.action);
    });
    linkRef.current = link;
    return () => {
      link.close();
      linkRef.current = null;
    };
  }, []);

  // 每次渲染都把最新快照推给面板窗口
  useEffect(() => {
    linkRef.current?.postState(snapshot);
  });

  actionRef.current = (action: PanelAction) => {
    switch (action.type) {
      case 'requestState':
        linkRef.current?.postState(snapshotRef.current);
        break;
      case 'ask': {
        const ply = game.plies[action.plyIndex];
        if (ply) game.addQuestion(ply, action.question, action.answer);
        break;
      }
      case 'devMove':
        game.devAutoMove();
        break;
      case 'highlight':
        setHighlights(action.squares);
        break;
      case 'previewEnter':
        if (card?.pv?.length) setPreview({ moves: card.pv, index: 0 });
        break;
      case 'previewStep':
        setPreview((p) =>
          p ? { ...p, index: Math.max(0, Math.min(p.moves.length, p.index + action.delta)) } : p
        );
        break;
      case 'previewExit':
        setPreview(null);
        break;
      case 'inspect': {
        const ply = game.plies[action.plyIndex];
        if (ply) {
          setPreview(null);
          setHighlights([]);
          setInspect(ply);
        }
        break;
      }
      case 'inspectExit':
        setInspect(null);
        break;
    }
  };

  const openPanel = () => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
      return;
    }
    const popup = window.open(
      '/panel.html',
      'chesscoach-panel',
      'popup=yes,width=460,height=880'
    );
    if (popup) {
      popupRef.current = popup;
      setDetached(true);
    }
  };

  const closePanel = () => {
    popupRef.current?.close();
    popupRef.current = null;
    setDetached(false);
  };

  // 用户直接关掉小窗时，侧栏自动回到主窗口
  useEffect(() => {
    if (!detached) return;
    const timer = window.setInterval(() => {
      if (!popupRef.current || popupRef.current.closed) {
        popupRef.current = null;
        setDetached(false);
      }
    }, 800);
    return () => window.clearInterval(timer);
  }, [detached]);

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
          <button
            data-testid="opponent-mode"
            disabled={game.phase === 'loading'}
            onClick={game.toggleOpponentMode}
            title="选择轮到对手时由电脑走，还是你自己替他走"
          >
            {game.manualOpponent ? '对手：我来走' : '对手：电脑走'}
          </button>
          <button data-testid="tone" onClick={() => setTone(tone === 'blunt' ? 'plain' : 'blunt')}>
            {tone === 'blunt' ? '语气：毒舌' : '语气：正经'}
          </button>
          <button
            data-testid="panel"
            onClick={detached ? closePanel : openPanel}
            title="把教练面板（问答、棋谱）放到独立窗口"
          >
            {detached ? '关闭独立面板' : '弹出独立面板'}
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

      <main className={detached ? 'layout detached' : 'layout'}>
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
              <p className="hint">
                选「执红先手」或「执黑后手」加载引擎，红方先走。想自己替对手走棋，先切换「对手：我来走」。
              </p>
            )
          )}
        </div>

        {!detached && (
          <SidePanel
            phase={game.phase}
            result={game.result}
            tone={tone}
            playerColor={game.playerColor}
            myTurn={game.myTurn}
            plies={game.plies}
            chineseMoves={chineseMoves}
            card={card}
            inspectActive={!!inspect}
            preview={preview ? { index: preview.index, total: preview.moves.length } : null}
            onHighlight={(sqs) => setHighlights(sqs)}
            onPreviewEnter={() => {
              if (card?.pv?.length) setPreview({ moves: card.pv, index: 0 });
            }}
            onPreviewStep={(delta) =>
              setPreview((p) =>
                p ? { ...p, index: Math.max(0, Math.min(p.moves.length, p.index + delta)) } : p
              )
            }
            onPreviewExit={() => setPreview(null)}
            onInspect={(ply) => {
              setPreview(null);
              setHighlights([]);
              setInspect(ply);
            }}
            onAsk={(ply, q) => game.addQuestion(ply, q, answerQuestion(ply, q, tone, game.difficulty))}
            onDevMove={() => game.devAutoMove()}
          />
        )}
      </main>
    </div>
  );
}
