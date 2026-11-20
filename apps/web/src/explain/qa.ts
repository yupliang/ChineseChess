import {
  applyMove,
  parseFen,
  parseUciMove,
  renderFacts,
  toFen,
  type Tone,
} from '@cc/rules';
import { moveChineseFrom, pvChineseFrom } from '../game/pv';
import type { Ply } from '../game/types';

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
export function answerQuestion(ply: Ply, question: string, tone: Tone = 'plain'): string {
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
