import type { Fact } from './types';

/**
 * 引擎侧的证据。事实层只认「引擎也确实这么看」的结论，避免出现
 * 「卡片说你送子，但引擎根本没打算吃」这种自相矛盾。
 */
export interface EngineEvidence {
  /** 你走后，引擎给出的对手最佳应着（UCI） */
  bestReply: string;
  /** 你走之前，引擎给你的最佳着法（UCI） */
  bestMoveBefore: string;
  /** 这步的胜率损失（百分点） */
  lossPct: number;
}

/** 兑子亏损至少要有这么多胜率损失，才算「引擎也认为亏」。 */
export const BAD_TRADE_MIN_LOSS = 5;

export function confirmFacts(facts: Fact[], evidence: EngineEvidence): Fact[] {
  return facts.filter((fact) => {
    switch (fact.type) {
      case 'allow_mate':
        // 规则层已经证明存在一步杀，不需要引擎背书
        return true;
      case 'bad_trade':
        return evidence.lossPct >= BAD_TRADE_MIN_LOSS;
      case 'missed_capture':
        // 只有引擎真的建议吃这一手，才叫「错过」
        return fact.move === evidence.bestMoveBefore;
      case 'hanging_piece':
      case 'missed_threat':
        // 只有引擎的应着确实是这一步吃子，才预测「对手会来吃」
        return fact.move === evidence.bestReply;
    }
  });
}
