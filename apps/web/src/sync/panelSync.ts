import type { Color, Square, Tone } from '@cc/rules';
import type { Difficulty, Phase, Ply } from '../game/types';

/** 主窗口广播给独立面板窗口的完整可序列化快照。 */
export interface PanelSnapshot {
  phase: Phase;
  status: string;
  result: string;
  error: string;
  progress: number;
  tone: Tone;
  difficulty: Difficulty;
  playerColor: Color;
  myTurn: boolean;
  plies: Ply[];
  chineseMoves: string[];
  card: Ply | null;
  inspectActive: boolean;
  previewIndex: number | null;
  previewTotal: number | null;
}

/** 面板窗口发回主窗口的操作，统一由主窗口执行。 */
export type PanelAction =
  | { type: 'requestState' }
  | { type: 'ask'; plyIndex: number; question: string; answer: string }
  | { type: 'devMove' }
  | { type: 'highlight'; squares: Square[] }
  | { type: 'previewEnter' }
  | { type: 'previewStep'; delta: number }
  | { type: 'previewExit' }
  | { type: 'inspect'; plyIndex: number }
  | { type: 'inspectExit' };

export type PanelMessage =
  | { kind: 'state'; snapshot: PanelSnapshot }
  | { kind: 'action'; action: PanelAction };

export interface PanelLink {
  postState: (snapshot: PanelSnapshot) => void;
  postAction: (action: PanelAction) => void;
  close: () => void;
}

const CHANNEL_NAME = 'chesscoach-panel';

/** 两个窗口共用一条 BroadcastChannel：主窗口发 state，面板发 action。 */
export function createPanelChannel(onMessage: (msg: PanelMessage) => void): PanelLink {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (e: MessageEvent<PanelMessage>) => onMessage(e.data);
  return {
    postState: (snapshot) => channel.postMessage({ kind: 'state', snapshot } satisfies PanelMessage),
    postAction: (action) => channel.postMessage({ kind: 'action', action } satisfies PanelMessage),
    close: () => channel.close(),
  };
}
