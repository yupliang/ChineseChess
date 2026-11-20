import { parseSquare, pieceAt, pieceName } from './board';
import { moveToUci, parseUciMove } from './facts';
import { generateLegalMoves } from './movegen';
import type { Color, Move, Position } from './types';

const CN_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 纵线路数名：红方用中文数字从右往左数（file 8 = 一路），黑方用阿拉伯数字从左往右数（file 0 = 1路）。 */
export function fileLane(file: number, color: Color): string {
  return color === 'red' ? CN_NUMS[8 - file] : String(file + 1);
}

/** UCI 格子名（如 h2）换成该色视角的路数名。 */
export function laneName(sq: string, color: Color): string {
  return fileLane(parseSquare(sq).file, color);
}

function tryParseUci(uci: string): Move | null {
  try {
    return parseUciMove(uci);
  } catch {
    return null;
  }
}

/**
 * 把 UCI 着法转成传统中文记谱：炮二平五 / 马8进7 / 前车退三。
 * pos 必须是走这步之前的局面（同线消歧需要）；解析失败或起点无子时原样返回 uci。
 * laneColor 可强制指定路数编号视角（默认按棋子颜色），供反解时兼容两种视角。
 */
export function moveToChinese(pos: Position, uci: string, laneColor?: Color): string {
  const move = tryParseUci(uci);
  const piece = move ? pieceAt(pos, move.from) : null;
  if (!move || !piece) return uci;
  const red = piece.color === 'red';
  const view = laneColor ?? piece.color;

  // 同纵线同色同种棋子需要「前/中/后」消歧：沿纵线由前到后排序，取本位次
  const others: number[] = [];
  for (let rank = 0; rank <= 9; rank++) {
    if (rank === move.from.rank) continue;
    const p = pos.board[rank * 9 + move.from.file];
    if (p && p.color === piece.color && p.type === piece.type) others.push(rank);
  }
  let prefix = '';
  if (others.length > 0) {
    const ranks = [...others, move.from.rank].sort((a, b) => (red ? b - a : a - b));
    const order = ranks.indexOf(move.from.rank);
    prefix =
      ranks.length === 2
        ? order === 0
          ? '前'
          : '后'
        : ranks.length === 3
          ? ['前', '中', '后'][order]
          : CN_NUMS[order];
  }
  // 前/后写在棋子名前（前车退三）；否则路数写在棋子名后（炮二平五）
  const head = prefix
    ? `${prefix}${pieceName(piece)}`
    : `${pieceName(piece)}${fileLane(move.from.file, view)}`;

  const df = move.to.file - move.from.file;
  const dr = move.to.rank - move.from.rank;
  const forward = dr > 0 === red;
  const verb = dr === 0 ? '平' : forward ? '进' : '退';
  // 纵走写步数（红中文、黑阿拉伯），横走写目标路数
  const dest =
    df === 0
      ? red
        ? CN_NUMS[Math.abs(dr) - 1]
        : String(Math.abs(dr))
      : fileLane(move.to.file, view);
  return `${head}${verb}${dest}`;
}

const CN_DIGIT: Record<string, string> = {
  一: '1',
  二: '2',
  三: '3',
  四: '4',
  五: '5',
  六: '6',
  七: '7',
  八: '8',
  九: '9',
};

/** 归一化记谱：繁体「進」转简体、去掉空白与标点、中文数字转阿拉伯数字，便于字符串比对。 */
export function normalizeNotation(text: string): string {
  return text
    .replace(/進/g, '进')
    .replace(/[\s，。、；：？！,.;:?!'"“”‘’（）()\[\]【】]/g, '')
    .replace(/[一二三四五六七八九]/g, (d) => CN_DIGIT[d]);
}

/**
 * 反解中文记谱：枚举当前局面所有合法着法，生成两种视角的记谱并与输入比对，取最长匹配。
 * 找不到合法对应着法时返回 null。
 */
export function parseChineseMove(pos: Position, text: string): string | null {
  const want = normalizeNotation(text);
  if (!want) return null;
  const alt: Color = pos.turn === 'red' ? 'black' : 'red';
  const pick = (laneColor?: Color): string | null => {
    let best: { uci: string; len: number } | null = null;
    for (const move of generateLegalMoves(pos)) {
      const uci = moveToUci(move);
      const cand = normalizeNotation(moveToChinese(pos, uci, laneColor));
      if (cand.length < 3 || !want.includes(cand)) continue;
      if (!best || cand.length > best.len) best = { uci, len: cand.length };
    }
    return best ? best.uci : null;
  };
  // 先按行棋方自己的记谱习惯匹配，匹配不到再试另一视角，避免两种视角归一化后互相串味
  return pick() ?? pick(alt);
}
