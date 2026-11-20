import type { Color, Fact } from '@cc/rules';
import type { Tier } from '../explain/winrate';

export type Difficulty = 'casual' | 'serious';

export type Phase = 'idle' | 'loading' | 'player' | 'thinking' | 'over';

export interface Ply {
  uci: string;
  mover: Color;
  /** 以下字段只有你（红方）的着法才有 */
  tier?: Tier;
  lossPct?: number;
  facts?: Fact[];
  bestMove?: string;
  pv?: string[];
  fenBefore?: string;
  winBefore?: number;
  winAfter?: number;
}
