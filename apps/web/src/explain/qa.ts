import { renderFacts, type Tone } from '@cc/rules';
import type { Ply } from '../game/types';

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
        return ply.tier === 'best'
          ? '引擎认为这步就是首选，没有可挑的战术问题。'
          : '这步整体偏亏，但找不到单一明确的战术原因。';
      }
      return renderFacts(ply.facts, tone).join('');
    case 'correct':
      if (!ply.bestMove) return '引擎还没给出推荐走法。';
      if (ply.bestMove === ply.uci) return `你走的 ${ply.uci} 就是引擎首选。`;
      return `引擎推荐 ${ply.bestMove}，比你走的 ${ply.uci} 更好${
        ply.pv && ply.pv.length > 1 ? `，后续可能是 ${ply.pv.slice(0, 4).join(' ')}` : ''
      }。`;
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
