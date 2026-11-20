import {
  applyMove,
  findHangingPieces,
  generateLegalMoves,
  HANGING_THRESHOLD,
  idx,
  isKingInCheck,
  moveToUci,
  parseChineseMove,
  parseFen,
  parseUciMove,
  pieceName,
  pieceValue,
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

/** 反吃回这一格的最佳着法所用的棋子名；没人能吃回来返回 null。 */
function bestRecaptureName(after: Position, square: Square): string | null {
  let best: { name: string; score: number } | null = null;
  for (const reply of generateLegalMoves(after)) {
    if (!sameSquare(reply.to, square)) continue;
    const piece = after.board[idx(reply.from)];
    if (!piece) continue;
    const score = seeCapture(after, reply);
    if (!best || score > best.score) best = { name: pieceName(piece), score };
  }
  return best ? best.name : null;
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
    const taken = pieceValue(target.type);
    const targetName = pieceName(target);
    const recapture = bestRecaptureName(after, move.to);
    // 把 SEE 的算式摊开：吃到的子写清楚，反吃方写清楚，剩下的才是净收益
    const trade = recapture
      ? `他能用${piece ? pieceName(piece) : '子'}吃你的${targetName}（+${taken}），但你的${recapture}立刻能吃回来，一进一出`
      : `他能用${piece ? pieceName(piece) : '子'}吃你的${targetName}（+${taken}），你的子吃不到它，`;

    if (gain >= HANGING_THRESHOLD) {
      return `${opener}${trade}净赚 ${gain}，这是白吃。${
        checks ? '还带将军。' : ''
      }${tail}${casualNote(difficulty)}这个${targetName}没人保护，你该先挪开或补一手保护。`;
    }
    if (gain > 0) {
      const verdict =
        gain < pieceValue('P')
          ? `只净赚 ${gain}，连一个兵（${pieceValue('P')}）都不如，谈不上白吃。`
          : `净赚 ${gain}，够不上白吃，所以引擎不选它。`;
      return `${opener}${trade}${verdict}${tail}`;
    }
    if (gain === 0) {
      return `${opener}${trade}正好打平，等于白忙。${tail}`;
    }
    return `${opener}${trade}他反而倒亏 ${Math.abs(gain)}，所以引擎不选它。${tail}`;
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

/* ---------- 追问：逐条核实用户嘴里的战术断言 ---------- */

const BLOCK_RE = /(垫|挡)/;
const CAPTURE_RE = /(吃|捉|兑|换|白得|白送)/;

/** 按标点和转折词切句，逐条核实。 */
function splitClaims(text: string): string[] {
  return text
    .split(/[，,。；;！!？?]|可是|不过|但|而且|然后|同时/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 「我这边要垫/挡」的断言；提到他/对手时不算，避免张冠李戴。 */
function isMineBlockClaim(text: string): boolean {
  return BLOCK_RE.test(text) && !/(他|对手|对方)/.test(text);
}

/** 上一轮讨论过的那一步：只取着法指针，局面每轮从锚点重算，不跨轮存盘。 */
function lastDiscussedMove(ply: Ply, pos: Position): string | null {
  const history = ply.qa ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    const uci = parseChineseMove(pos, history[i].q);
    if (uci) return uci;
  }
  return null;
}

interface BlockRisk {
  zh: string;
  piece: string;
}

interface BlockResult {
  text: string;
  after: Position | null;
  risk: BlockRisk | null;
}

/** 垫子：枚举所有非帅的合法解将着法，按「垫完会不会新丢子」给出优先建议。 */
function blockVerdict(base: Position, me: 'red' | 'black', fen: string): BlockResult {
  if (!isKingInCheck(base, me)) {
    return { text: '这时候你并没有被将军，用不着垫子。', after: null, risk: null };
  }
  const replies = generateLegalMoves(base);
  if (replies.length === 0) {
    return { text: '你已经被将死，没有垫的可能。', after: null, risk: null };
  }

  const foe = me === 'red' ? 'black' : 'red';
  const already = new Set(findHangingPieces(base, foe).map((h) => squareName(h.square)));
  const options: { uci: string; cost: number; piece: string }[] = [];

  for (const move of replies) {
    const mover = base.board[idx(move.from)];
    if (!mover || mover.type === 'K') continue; // 帅自己动不算「垫」
    const after = applyMove(base, move);
    const fresh = findHangingPieces(after, foe).filter(
      (h) => !already.has(squareName(h.square))
    );
    const worst = fresh[0];
    options.push({
      uci: moveToUci(move),
      cost: worst ? worst.gain : 0,
      piece: worst ? pieceName(worst.piece) : '',
    });
  }

  if (options.length === 0) {
    return { text: '你没有别的子能垫，只能动帅。', after: null, risk: null };
  }

  options.sort((a, b) => a.cost - b.cost);
  const best = options[0];
  const risky = options.find((o) => o.cost > 0) ?? null;
  const bestZh = moveChineseFrom(fen, best.uci);
  const after = applyMove(base, parseUciMove(best.uci));
  const risk = risky ? { zh: moveChineseFrom(fen, risky.uci), piece: risky.piece } : null;

  if (best.cost > 0) {
    return {
      text: `垫是能垫，但每条路都要丢子，最便宜的是 ${bestZh}，之后会丢一个${best.piece}。`,
      after,
      risk,
    };
  }

  const alt = options.find((o) => o.uci !== best.uci && o.cost === 0);
  const altZh = alt ? ` 或 ${moveChineseFrom(fen, alt.uci)}` : '';
  const warn = risky
    ? `但用 ${moveChineseFrom(fen, risky.uci)} 垫的话，他下一步就能吃你的${risky.piece}。`
    : '';
  return { text: `能垫：${bestZh}${altZh}，垫完不亏子。${warn}`, after, risk };
}

/** 「他能吃我的子」：不猜哪一颗，直接扫全盘所有能被白吃的子。垫子那句已经讲过代价就不再复述。 */
function captureVerdict(
  base: Position,
  me: 'red' | 'black',
  fen: string,
  risk: BlockRisk | null
): string | null {
  if (risk) return null;
  const foe = me === 'red' ? 'black' : 'red';
  const hanging = findHangingPieces(base, foe);
  if (hanging.length === 0) {
    return '这时候他没有能白吃你子的着法，这个担心不成立。';
  }
  const list = hanging
    .slice(0, 2)
    .map(
      (h) =>
        `${moveChineseFrom(fen, squareName(h.from) + squareName(h.square))} 吃你的${pieceName(
          h.piece
        )}`
    );
  return `不过你这里确实有子没人保：他能 ${list.join('、')}。`;
}

/** 逐条核实追问里的战术断言；不是这类追问时返回 null，交给常规回答。 */
function answerClaims(ply: Ply, question: string): string | null {
  const fenAfter = fenAfterOf(ply);
  if (!fenAfter) return null;
  let anchor: Position;
  try {
    anchor = parseFen(fenAfter);
  } catch {
    return null;
  }

  const me = ply.mover;
  const segments = splitClaims(question);
  const hasBlock = segments.some(isMineBlockClaim);
  const claimed = segments.filter(
    (s) => BLOCK_RE.test(s) || CAPTURE_RE.test(s) || parseChineseMove(anchor, s) !== null
  ).length;
  // 单条「他为什么不 X」交给对手视角那条通路；这里只接复合追问或垫子追问
  if (!hasBlock && claimed < 2) return null;

  const prev = lastDiscussedMove(ply, anchor);
  let base = prev ? applyMove(anchor, parseUciMove(prev)) : anchor;
  let fen = toFen(base);
  const parts: string[] = [];
  let risk: BlockRisk | null = null;

  for (const seg of segments) {
    if (isMineBlockClaim(seg)) {
      const result = blockVerdict(base, me, fen);
      parts.push(result.text);
      if (result.risk) risk = result.risk;
      if (result.after) {
        base = result.after;
        fen = toFen(base);
      }
      continue;
    }

    if (CAPTURE_RE.test(seg)) {
      const text = captureVerdict(base, me, fen, risk);
      if (text) parts.push(text);
      continue;
    }

    const uci = parseChineseMove(base, seg);
    if (uci) {
      const after = applyMove(base, parseUciMove(uci));
      const taken = base.board[idx(parseUciMove(uci).to)];
      const notes = [
        taken ? `能吃他的${pieceName(taken)}` : '吃不到子',
        isKingInCheck(after, after.turn) ? '还带将军' : '',
      ].filter(Boolean);
      parts.push(`${moveChineseFrom(fen, uci)} 这步走得出来，${notes.join('，')}。`);
      continue;
    }

    if (seg.length >= 3) {
      parts.push('剩下那句我没法从局面上核实，你把具体着法说出来我再算。');
    }
  }

  return parts.length > 0 ? parts.join('') : null;
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

const FALLBACK =
  '这句我没法直接从局面上算出来。你把想验证的一步说具体些（比如「车9进1 能吃我什么」），我就能给你结果；也可以问这步为什么臭、正确走法是什么、掉了多少。';

/** 规则式回答：覆盖「为什么臭 / 正确走法 / 掉了多少」三类意图，答不上来返回降级语。 */
export function answerQuestion(
  ply: Ply,
  question: string,
  tone: Tone = 'plain',
  difficulty?: Difficulty
): string {
  const claims = answerClaims(ply, question);
  if (claims) return claims;
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
