import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeMove,
  applyMove,
  confirmFacts,
  generateLegalMoves,
  isKingInCheck,
  judgeGameEnd,
  parseFen,
  parseUciMove,
  pieceAt,
  sameSquare,
  squareName,
  toFen,
  type Fact,
  type GameEnd,
  type Move,
  type Position,
  type Square,
} from '@cc/rules';
import { aiSearch, engineSearch, loadEngine } from './engineClient';
import { cpToWinPct, tierFor } from '../explain/winrate';
import type { Difficulty, Phase, Ply } from './types';
import { clearCurrent, loadCurrent, saveCurrent, saveFinished } from './storage';

export const START_FEN =
  'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

/** 对手别秒回，留出反应时间。 */
const AI_REPLY_PAUSE_MS = 2200;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface Baseline {
  fen: string;
  bestMove: string;
  scoreCp: number;
  pv: string[];
}

/** 从开局重放，得到逐局面历史与「该步是否将军」，供重复局面/长将判定使用。 */
function buildHistory(plies: Ply[]): { positions: Position[]; checks: boolean[] } {
  let pos = parseFen(START_FEN);
  const positions: Position[] = [pos];
  const checks: boolean[] = [false];
  for (const p of plies) {
    const next = applyMove(pos, parseUciMove(p.uci));
    checks.push(isKingInCheck(next, next.turn));
    positions.push(next);
    pos = next;
  }
  return { positions, checks };
}

function endMessage(end: GameEnd): string {
  switch (end.reason) {
    case 'checkmate':
      return end.winner === 'red' ? '你将死了对手，赢了' : '你被将死了';
    case 'stalemate':
      return end.winner === 'red' ? '对手无棋可走（困毙），你赢了' : '你无棋可走（困毙），输了';
    case 'repetition':
      return '三次重复局面，和棋';
    case 'perpetual-check':
      return end.winner === 'red' ? '对手长将判负，你赢了' : '你长将判负，输了';
    case 'sixty-move':
      return '60 回合无吃子，和棋';
    default:
      return '对局结束';
  }
}

export function useGame() {
  const [position, setPosition] = useState<Position>(() => parseFen(START_FEN));
  const [plies, setPlies] = useState<Ply[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState('点击「开始对局」，红方先走');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Square | null>(null);
  const [card, setCard] = useState<Ply | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('casual');
  const [result, setResult] = useState('');
  const [savedPlies, setSavedPlies] = useState<Ply[] | null>(() => loadCurrent());

  const baselineRef = useRef<Baseline | null>(null);
  const busyRef = useRef(false);

  // 每走完一段就落盘，刷新后可继续
  useEffect(() => {
    if (plies.length > 0 && (phase === 'player' || phase === 'thinking')) {
      saveCurrent(plies);
    }
  }, [plies, phase]);

  const targets = useMemo<Square[]>(() => {
    if (!selected || phase !== 'player') return [];
    return generateLegalMoves(position)
      .filter((m) => sameSquare(m.from, selected))
      .map((m) => m.to);
  }, [position, selected, phase]);

  const refreshBaseline = useCallback(async (pos: Position): Promise<Baseline> => {
    const fen = toFen(pos);
    const result = await engineSearch(fen);
    const baseline = { fen, bestMove: result.bestMove, scoreCp: result.scoreCp, pv: result.pv };
    baselineRef.current = baseline;
    return baseline;
  }, []);

  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    clearCurrent();
    setSavedPlies(null);
    setResult('');
    setError('');
    setProgress(0);
    setPhase('loading');
    setStatus('正在加载引擎与权重（约 11MB，首次较慢）…');
    try {
      await loadEngine((loaded, total) => {
        setProgress(total ? Math.round((loaded / total) * 100) : 0);
      });
      const pos = parseFen(START_FEN);
      setPosition(pos);
      setPlies([]);
      setCard(null);
      setLastMove(null);
      setSelected(null);
      baselineRef.current = null;
      setStatus('引擎就绪，正在计算…');
      await refreshBaseline(pos);
      setPhase('player');
      setStatus('你的回合（红方）');
    } catch (e) {
      setError('引擎加载失败：' + (e instanceof Error ? e.message : String(e)));
      setPhase('idle');
      setStatus('加载失败');
    } finally {
      busyRef.current = false;
    }
  }, [refreshBaseline]);

  const resume = useCallback(async () => {
    if (!savedPlies || busyRef.current) return;
    busyRef.current = true;
    setError('');
    setProgress(0);
    setResult('');
    setPhase('loading');
    setStatus('正在恢复上一局…');
    try {
      await loadEngine((loaded, total) => {
        setProgress(total ? Math.round((loaded / total) * 100) : 0);
      });
      let pos = parseFen(START_FEN);
      for (const p of savedPlies) pos = applyMove(pos, parseUciMove(p.uci));
      setPosition(pos);
      setPlies(savedPlies);
      const last = savedPlies[savedPlies.length - 1];
      setLastMove(last ? parseUciMove(last.uci) : null);
      const lastRed = [...savedPlies].reverse().find((p) => p.mover === 'red') ?? null;
      setCard(lastRed);
      setSavedPlies(null);
      setPhase('player');
      setStatus('你的回合（红方）');
      await refreshBaseline(pos);
    } catch (e) {
      setError('恢复失败：' + (e instanceof Error ? e.message : String(e)));
      setPhase('idle');
    } finally {
      busyRef.current = false;
    }
  }, [savedPlies, refreshBaseline]);

  const playRed = useCallback(
    async (move: Move, currentPosition: Position, currentPlies: Ply[]) => {
      const fenBefore = toFen(currentPosition);
      const uci = squareName(move.from) + squareName(move.to);

      let staticFacts: Fact[] = [];
      try {
        staticFacts = analyzeMove(fenBefore, uci);
      } catch {
        staticFacts = [];
      }

      const after = applyMove(currentPosition, move);
      const afterFen = toFen(after);

      setSelected(null);
      setPosition(after);
      setLastMove({ from: move.from, to: move.to });
      setPhase('thinking');
      setStatus('正在复盘你这一步…');

      try {
        const analysis = await engineSearch(afterFen);

        let baseline = baselineRef.current;
        if (!baseline || baseline.fen !== fenBefore) {
          const beforeEval = await engineSearch(fenBefore);
          baseline = {
            fen: fenBefore,
            bestMove: beforeEval.bestMove,
            scoreCp: beforeEval.scoreCp,
            pv: beforeEval.pv,
          };
          baselineRef.current = baseline;
        }

        const winBefore = cpToWinPct(baseline.scoreCp);
        const winAfter = cpToWinPct(-analysis.scoreCp);
        const lossPct = Math.max(0, winBefore - winAfter);

        // 事实必须和引擎结论一致才展示，避免「说你送子但引擎根本没打算吃」
        const facts = confirmFacts(staticFacts, {
          bestReply: analysis.bestMove,
          bestMoveBefore: baseline.bestMove,
          lossPct,
        });

        const ply: Ply = {
          uci,
          mover: 'red',
          tier: tierFor(lossPct, baseline.bestMove === uci),
          lossPct,
          facts,
          bestMove: baseline.bestMove,
          pv: baseline.pv,
          replyMove: analysis.bestMove,
          replyPv: analysis.pv,
          fenBefore,
          winBefore,
          winAfter,
        };
        setCard(ply);

        const myPlies: Ply[] = [...currentPlies, ply];
        const mine = buildHistory(myPlies);
        const myPos = mine.positions[mine.positions.length - 1];
        const endAfterMe = judgeGameEnd(myPos, mine.positions, mine.checks);

        if (endAfterMe.over) {
          setPlies(myPlies);
          setPhase('over');
          setResult(endMessage(endAfterMe));
          setStatus(endMessage(endAfterMe));
          saveFinished(myPlies);
          return;
        }

        // 对手按难度走棋（陪练会漏战术，认真接近全力）；先停顿一下别秒回
        setStatus('对手正在思考…');
        await sleep(AI_REPLY_PAUSE_MS);
        const reply = await aiSearch(afterFen, difficulty);
        const legalAfter = generateLegalMoves(myPos);
        const aiUci = legalAfter.some(
          (m) => squareName(m.from) + squareName(m.to) === reply.bestMove
        )
          ? reply.bestMove
          : squareName(legalAfter[0].from) + squareName(legalAfter[0].to);
        const aiMove = parseUciMove(aiUci);
        const aiPos = applyMove(myPos, aiMove);
        const withReply: Ply = { ...ply, opponentMove: aiUci };
        const next: Ply[] = [...currentPlies, withReply, { uci: aiUci, mover: 'black' }];
        setCard(withReply);

        setPosition(aiPos);
        setLastMove({ from: aiMove.from, to: aiMove.to });
        setPlies(next);

        const both = buildHistory(next);
        const endAfterAi = judgeGameEnd(
          both.positions[both.positions.length - 1],
          both.positions,
          both.checks
        );

        if (endAfterAi.over) {
          setPhase('over');
          setResult(endMessage(endAfterAi));
          setStatus(endMessage(endAfterAi));
          saveFinished(next);
          return;
        }

        setPhase('player');
        setStatus('你的回合（红方）');
        // 顺手把「对手应完之后你该怎么走」也算好，问答里的「我该怎么走」直接用它
        const nextBaseline = await refreshBaseline(aiPos);
        const enriched: Ply = {
          ...withReply,
          nextFen: nextBaseline.fen,
          nextBest: nextBaseline.bestMove,
          nextPv: nextBaseline.pv,
        };
        setCard(enriched);
        setPlies(next.map((p) => (p === withReply ? enriched : p)));
      } catch (e) {
        setError('分析失败：' + (e instanceof Error ? e.message : String(e)));
        setPhase('player');
        setStatus('你的回合（红方）');
      }
    },
    [difficulty, refreshBaseline]
  );

  const playMove = useCallback(
    (move: Move) => {
      if (phase !== 'player' || busyRef.current) return;
      busyRef.current = true;
      void playRed(move, position, plies).finally(() => {
        busyRef.current = false;
      });
    },
    [phase, position, plies, playRed]
  );

  /** 开发用：让引擎按当前难度档替红方走一步，非法或失败时退回首合法走法。 */
  const devAutoMove = useCallback(() => {
    if (phase !== 'player' || busyRef.current) return;
    const moves = generateLegalMoves(position);
    if (moves.length === 0) return;
    busyRef.current = true;
    void aiSearch(toFen(position), difficulty)
      .then((r) => {
        const target = moves.find(
          (m) => squareName(m.from) + squareName(m.to) === r.bestMove
        );
        return target ?? moves[0];
      })
      .catch(() => moves[0])
      .then((move) => playRed(move, position, plies))
      .finally(() => {
        busyRef.current = false;
      });
  }, [phase, position, plies, difficulty, playRed]);

  const onSquareClick = useCallback(
    (sq: Square) => {
      if (phase !== 'player' || busyRef.current) return;

      if (selected) {
        const moves = generateLegalMoves(position).filter((m) => sameSquare(m.from, selected));
        const target = moves.find((m) => sameSquare(m.to, sq));
        if (target) {
          playMove(target);
          return;
        }
      }

      const piece = pieceAt(position, sq);
      if (piece && piece.color === 'red') {
        setSelected(sq);
        return;
      }
      setSelected(null);
    },
    [phase, position, selected, playMove]
  );

  /** 给某一步追加一条问答，随 Ply 一起持久化。 */
  const addQuestion = useCallback(
    (target: Ply, question: string, answer: string) => {
      let idx = plies.indexOf(target);
      if (idx < 0) idx = plies.findIndex((p) => p.uci === target.uci && p.mover === target.mover);
      if (idx < 0) return;
      const updated: Ply = {
        ...plies[idx],
        qa: [...(plies[idx].qa ?? []), { q: question, a: answer, at: Date.now() }],
      };
      const next = [...plies];
      next[idx] = updated;
      setPlies(next);
      if (card === target) setCard(updated);
      saveCurrent(next);
    },
    [plies, card]
  );

  const undo = useCallback(() => {
    if (busyRef.current || phase === 'loading') return;
    let keep = -1;
    for (let i = plies.length - 1; i >= 0; i--) {
      if (plies[i].mover === 'red') {
        keep = i;
        break;
      }
    }
    if (keep < 0) return;
    const kept = plies.slice(0, keep);
    let pos = parseFen(START_FEN);
    for (const p of kept) pos = applyMove(pos, parseUciMove(p.uci));

    setPosition(pos);
    setPlies(kept);
    setCard(null);
    setSelected(null);
    setResult('');
    setPhase('player');
    setStatus('你的回合（红方）');
    const last = kept[kept.length - 1];
    setLastMove(last ? parseUciMove(last.uci) : null);
    baselineRef.current = null;
    busyRef.current = true;
    void refreshBaseline(pos)
      .catch((e) => setError('分析失败：' + (e instanceof Error ? e.message : String(e))))
      .finally(() => {
        busyRef.current = false;
      });
  }, [plies, phase, refreshBaseline]);

  return {
    position,
    plies,
    phase,
    status,
    progress,
    error,
    selected,
    targets,
    lastMove,
    card,
    difficulty,
    setDifficulty,
    result,
    savedPlies,
    start,
    resume,
    undo,
    playMove,
    devAutoMove,
    onSquareClick,
    dismissCard: () => setCard(null),
    addQuestion,
  };
}
