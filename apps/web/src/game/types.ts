import type { Color, Fact } from '@cc/rules';
import type { Tier } from '../explain/winrate';

export type Difficulty = 'casual' | 'serious';

export type Phase = 'idle' | 'loading' | 'player' | 'thinking' | 'over';

export interface QAItem {
  q: string;
  a: string;
  at: number;
}

export interface Ply {
  uci: string;
  mover: Color;
  /** 以下字段只有你（执红或执黑）的着法才有 */
  tier?: Tier;
  lossPct?: number;
  facts?: Fact[];
  bestMove?: string;
  pv?: string[];
  /** 你走完之后，引擎给出的对手最佳应着与后续主变（UCI） */
  replyMove?: string;
  replyPv?: string[];
  /** 对手实际走出的应着（UCI） */
  opponentMove?: string;
  /** 对手应着之后的局面，以及引擎在这个新局面上给你的最佳着法与主变 */
  nextFen?: string;
  nextBest?: string;
  nextPv?: string[];
  fenBefore?: string;
  winBefore?: number;
  winAfter?: number;
  /** 用户对这一步的提问与规则式回答 */
  qa?: QAItem[];
}
