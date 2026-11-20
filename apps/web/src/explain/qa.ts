import {
  applyMove,
  findHangingPieces,
  generateLegalMoves,
  HANGING_THRESHOLD,
  idx,
  isKingInCheck,
  parseChineseMove,
  parseFen,
  parseUciMove,
  pieceName,
  renderFacts,
  sameSquare,
  seeCapture,
  squareName,
  toFen,
  type Position,
  type Square,
  type Tone,
} from '@cc/rules';
import { moveChineseFrom, pvChineseFrom } from '../game/pv';
import type { Difficulty, Ply } from '../game/types';

/** 走完这一手之后的局面 FEN；局面或着法异常时返回 null。 */
function fenAfterOf(ply: Ply): string | null {
  if (!ply.fenBefore) return null;
  try {
    return toFen(applyMove(parseFen(ply.fenBefore), parseUciMove(ply.uci)));
  } catch {
    return null;
  }
}

/** 把一串着法转成「，接着 a b」形式的后缀（首步已在主句里说过）。 */
function followOf(moves: string[]): string {
  const rest = moves.slice(1);
  return rest.length > 0 ? `，接着 ${rest.join(' ')}` : '';
}

/**
 * 规则层没抓到硬伤时的解释，拆成两个出口：
 * - describeDownside：卡片正文用，只讲后果（胜率、推荐走法卡片上另有展示）
 * - softWhyExplain：问答用，后果 + 胜率损失 + 引擎更想要的走法
 */

/** 「你走了 X，之后对手可以应 Y，接着 …」：用对手应着说明这一步的后果。 */
function consequenceOf(ply: Ply, tone: Tone): string {
  const mine = moveChineseFrom(ply.fenBefore, ply.uci);
  const afterFen = fenAfterOf(ply);
  const replyZh = afterFen && ply.replyMove ? moveChineseFrom(afterFen, ply.replyMove) : null;
  const replyLine = afterFen && ply.replyPv ? pvChineseFrom(afterFen, ply.replyPv.slice(0, 3)) : [];

  if (replyZh) {
    return tone === 'blunt'
      ? `你走 ${mine} 之后，对手可以直接 ${replyZh}${followOf(replyLine)}`
      : `你走了 ${mine}，之后对手可以应 ${replyZh}${followOf(replyLine)}`;
  }
  return tone === 'blunt'
    ? `你走了 ${mine}，问题出在子力位置和攻守节奏上`
    : `你走了 ${mine}，这更像子力位置与攻守节奏上的亏损`;
}

/** 问句里是否在问对手（他/对手/黑方…）。 */
function mentionsOpponent(text: string): boolean {
  return /(他|她|对手|对方|黑方|电脑)/.test(text);
}

const PIECE_WORDS = ['炮', '马', '车', '車', '兵', '卒'] as const;
const USER_PIECES = ['帅', '仕', '相', '兵'];
const FOE_PIECES = ['将', '士', '象', '卒'];

/** 问句里提到的棋子名，统一成规则层的叫法（車 -> 车）。 */
function pieceWordOf(text: string): string | null {
  const hit = PIECE_WORDS.find((w) => text.includes(w));
  return hit ? hit.replace('車', '车') : null;
}

/** 这个棋子说的是「你的子」还是「对手的子」：帅仕相兵是你的，将士象卒是对手的，车马炮看上下文。 */
function pieceSide(word: string, text: string): 'mine' | 'theirs' {
  if (USER_PIECES.includes(word)) return 'mine';
  if (FOE_PIECES.includes(word)) return 'theirs';
  return /吃|白送|白得|白吃|丢|送/.test(text) ? 'mine' : 'theirs';
}

/** 陪练档会刻意漏战术，解释对手「为什么没吃」时必须点明。 */
function casualNote(difficulty?: Difficulty): string {
  return difficulty === 'casual'
    ? '另外，陪练档会刻意漏着，这种白送的子它经常不吃，别把它的选择当成安全。'
    : '';
}

/** 问句里是否在声称这步能将军 / 抽将。 */
function claimsCheck(text: string): boolean {
  return /(将军|将一军|打将|抽将|抽|叫将)/.test(text);
}

/** 同一着法之前问过没有：问过就不再重念「你说的是 X 吧」。 */
function alreadyAsked(ply: Ply, pos: Position, uci: string): boolean {
  return (ply.qa ?? []).some((item) => parseChineseMove(pos, item.q) === uci);
}

/** 将军这步换到了什么：能吃掉将军的子就说不划算，能解将就说没收获。 */
function checkVerdict(after: Position, checkingTo: Square): string {
  const replies = generateLegalMoves(after);
  if (replies.length === 0) return '而且这是将死，不是普通将军。';
  const best = replies
    .filter((m) => sameSquare(m.to, checkingTo))
    .reduce((max, m) => Math.max(max, seeCapture(after, m)), -Infinity);
  if (best > 0) return '但你的子能直接吃掉将军的棋子，这个将换不到东西。';
  return '你的帅可以躲开或垫子解将，这步将军逼不出实质收获。';
}

/** 「他为什么不 X」：先核实前提（能不能吃到、是不是将军），再解释为什么不吃 / 该不该挪。 */
function explainOpponentMove(
  fenAfter: string,
  uci: string,
  question: string,
  ply: Ply,
  tone: Tone,
  difficulty?: Difficulty
): string {
  const pos = parseFen(fenAfter);
  const move = parseUciMove(uci);
  const zh = moveChineseFrom(fenAfter, uci);
  const piece = pos.board[idx(move.from)];
  const target = pos.board[idx(move.to)];
  const after = applyMove(pos, move);
  const checks = isKingInCheck(after, after.turn);
  const opener = alreadyAsked(ply, pos, uci)
    ? '还是这步，'
    : tone === 'blunt'
      ? `${zh} 这步，`
      : `你提到的 ${zh}，`;

  const engineZh = ply.replyMove ? moveChineseFrom(fenAfter, ply.replyMove) : null;
  const actualZh = ply.opponentMove ? moveChineseFrom(fenAfter, ply.opponentMove) : null;
  const tail =
    (engineZh ? `引擎给对手选的是 ${engineZh}。` : '') +
    (actualZh && actualZh !== engineZh ? `他实际走的是 ${actualZh}。` : '');

  // 用户明确说「这步能将军」，先把这件事核实清楚，不要绕过去
  if (claimsCheck(question)) {
    if (checks) return `${opener}走完确实将军。${checkVerdict(after, move.to)}${tail}`;
    const extra = target && target.type !== 'K' ? '' : '它也没吃到子，';
    return `${opener}这步不将军——走完 ${zh}，你的帅并没有被攻击。${extra}${tail}`;
  }

  if (target && target.type !== 'K') {
    const gain = seeCapture(pos, move);
    if (gain >= HANGING_THRESHOLD) {
      return `${opener}确实能白吃你的${pieceName(target)}。${
        checks ? '还带将军。' : ''
      }${tail}${casualNote(difficulty)}这个${pieceName(target)}没人保护，你该先挪开或补一手保护。`;
    }
    if (gain > 0) {
      return `${opener}能吃你的${pieceName(target)}，但换下来只净赚 ${gain}，够不上白吃。${tail}`;
    }
    return `${opener}能吃你的${pieceName(target)}，但吃完会被吃回来，净亏约 ${Math.abs(
      gain
    )}，所以引擎不选它。`;
  }

  const who = piece ? pieceName(piece) : '子';
  const checkNote = checks ? `不过它确实带将军，${checkVerdict(after, move.to)}` : '';
  return `${opener}只是把${who}挪了个位置，吃不到你的子，谈不上白得。${checkNote}${tail}`;
}

/** 「他为什么不吃我的 X」：在对手可吃范围里找那颗子；若说的是对手自己的子，则直接说那步走不出来。 */
function explainOpponentPiece(
  fenAfter: string,
  word: string,
  question: string,
  ply: Ply,
  difficulty?: Difficulty
): string {
  const pos = parseFen(fenAfter);
  const foe = pos.turn;
  if (pieceSide(word, question) === 'theirs') {
    const foeName = foe === 'black' ? '黑方' : '红方';
    return `这个局面里${foeName}的${word}走不出你说的那步：那条路线被挡或不合规则，不是他不想走。`;
  }
  const hanging = findHangingPieces(pos, foe).filter((h) => pieceName(h.piece) === word);
  if (hanging.length === 0) {
    return `对手现在没有能白吃你${word}的着法：你的${word}有子保护，或者不在它的攻击范围里。`;
  }
  const best = hanging[0];
  const captureZh = moveChineseFrom(fenAfter, squareName(best.from) + squareName(best.square));
  const actualZh = ply.opponentMove ? moveChineseFrom(fenAfter, ply.opponentMove) : null;
  return `你的${word}在 ${squareName(best.square)} 确实是白送的，对手走 ${captureZh} 能净赚约 ${
    best.gain
  }。${actualZh ? `他实际走的是 ${actualZh}。` : ''}${casualNote(
    difficulty
  )}这子应该先挪开或补一手保护。`;
}

/** 对手视角的提问；不是这类问题时返回 null，交给常规回答。 */
function answerOpponent(
  ply: Ply,
  question: string,
  tone: Tone,
  difficulty?: Difficulty
): string | null {
  const fenAfter = fenAfterOf(ply);
  if (!fenAfter) return null;
  let pos;
  try {
    pos = parseFen(fenAfter);
  } catch {
    return null;
  }
  const uci = parseChineseMove(pos, question);
  if (uci) return explainOpponentMove(fenAfter, uci, question, ply, tone, difficulty);
  if (!mentionsOpponent(question)) return null;
  const word = pieceWordOf(question);
  return word ? explainOpponentPiece(fenAfter, word, question, ply, difficulty) : null;
}

/** 卡片正文：只讲后果。 */
export function describeDownside(ply: Ply, tone: Tone = 'plain'): string {
  if (ply.tier === 'best' || (ply.lossPct ?? 0) < 5) {
    return tone === 'blunt' ? '这步没什么可挑的，继续。' : '这一步没有明显的战术问题，正常继续就好。';
  }
  return consequenceOf(ply, tone);
}

/** 问答：后果 + 胜率损失 + 引擎更想要的走法。 */
export function softWhyExplain(ply: Ply, tone: Tone = 'plain'): string {
  if (ply.tier === 'best') return '引擎认为这步就是首选，没有可挑的战术问题。';

  const lossValue = ply.lossPct ?? 0;
  const mine = moveChineseFrom(ply.fenBefore, ply.uci);
  if (lossValue < 5) {
    return tone === 'blunt'
      ? `这步 ${mine} 和引擎首选几乎等价，没有明显弊端。`
      : `这步 ${mine} 与引擎首选差别很小，没有明显的战术问题。`;
  }

  const loss = lossValue.toFixed(1);
  const verdict =
    tone === 'blunt'
      ? `这步大约亏了 ${loss}% 胜率`
      : `这一步大约损失了 ${loss}% 的胜率`;
  const bestZh = ply.bestMove ? moveChineseFrom(ply.fenBefore, ply.bestMove) : null;
  const bestLine = ply.pv ? pvChineseFrom(ply.fenBefore, ply.pv.slice(0, 3)) : [];
  const advice = bestZh
    ? tone === 'blunt'
      ? `；引擎更想让你走 ${bestZh}${followOf(bestLine)}`
      : `；引擎更推荐的走法是 ${bestZh}${followOf(bestLine)}`
    : '';

  return `${consequenceOf(ply, tone)}，${verdict}${advice}。`;
}

type Intent = 'why' | 'correct' | 'loss' | null;

/** 意图识别：顺序即优先级，长且具体的模式必须排在短模式之前，避免被误吞。 */
const INTENT_RULES: { intent: Exclude<Intent, null>; patterns: RegExp[] }[] = [
  {
    intent: 'correct',
    patterns: [/正确走法/, /正确走/, /应该走/, /该走/, /怎么走/, /走什么好/, /最佳/, /推荐/],
  },
  { intent: 'loss', patterns: [/掉了多少/, /掉多少/, /亏多少/, /胜率/, /损失/, /输多少/] },
  {
    intent: 'why',
    patterns: [/为什么臭/, /为什么坏/, /为什么错/, /哪里错/, /哪里坏/, /哪里臭/, /原因/, /臭棋/, /为什么/],
  },
];

export function classifyIntent(question: string): Intent {
  const text = question.trim();
  if (!text) return null;
  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((re) => re.test(text))) return rule.intent;
  }
  return null;
}

const FALLBACK = '我暂时只能回答三类：这步为什么臭、正确走法是什么、这步掉了多少。换个问法试试。';

/** 规则式回答：覆盖「为什么臭 / 正确走法 / 掉了多少」三类意图，答不上来返回降级语。 */
export function answerQuestion(
  ply: Ply,
  question: string,
  tone: Tone = 'plain',
  difficulty?: Difficulty
): string {
  const opponent = answerOpponent(ply, question, tone, difficulty);
  if (opponent) return opponent;
  if (ply.mover !== 'red') return FALLBACK;

  switch (classifyIntent(question)) {
    case 'why':
      if (!ply.facts || ply.facts.length === 0) {
        return softWhyExplain(ply, tone);
      }
      return renderFacts(ply.facts, tone, ply.mover).join('');
    case 'correct': {
      if (!ply.bestMove) return '引擎还没给出推荐走法。';
      const mine = moveChineseFrom(ply.fenBefore, ply.uci);
      if (ply.bestMove === ply.uci) return `你走的 ${mine} 就是引擎首选。`;
      const follow =
        ply.pv && ply.pv.length > 1
          ? `，后续可能是 ${pvChineseFrom(ply.fenBefore, ply.pv.slice(0, 4)).join(' ')}`
          : '';
      return `引擎推荐 ${moveChineseFrom(ply.fenBefore, ply.bestMove)}，比你走的 ${mine} 更好${follow}。`;
    }
    case 'loss':
      if (ply.lossPct === undefined) return '这一步没有胜率数据。';
      if (ply.lossPct < 0.5) return '这步对胜率几乎没有影响。';
      return `这步掉了约 ${ply.lossPct.toFixed(1)}% 胜率${
        ply.winAfter !== undefined ? `，走完剩 ${ply.winAfter.toFixed(1)}%` : ''
      }。`;
    default:
      return FALLBACK;
  }
}

/** 预设快捷问题：双轨匹配的按钮端。 */
export const PRESET_QUESTIONS = ['这步为什么臭？', '正确走法是什么？', '这步掉了多少？'] as const;
