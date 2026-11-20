import { parseSquare, pieceAt, pieceName } from './board';
import { parseUciMove } from './facts';
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
 */
export function moveToChinese(pos: Position, uci: string): string {
  const move = tryParseUci(uci);
  const piece = move ? pieceAt(pos, move.from) : null;
  if (!move || !piece) return uci;
  const red = piece.color === 'red';

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
    : `${pieceName(piece)}${fileLane(move.from.file, piece.color)}`;

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
      : fileLane(move.to.file, piece.color);
  return `${head}${verb}${dest}`;
}
