// 纯 UCI 文本解析，无 DOM 依赖，可单测。
// Pikafish 输出形如：
//   info depth 14 seldepth 22 multipv 1 score cp 123 nodes 123456 nps 1000000 pv h2e2 e7e6 ...
//   info depth 14 multipv 1 score mate 3 pv ...
//   bestmove h2e2 ponder e7e6

export interface ParsedInfo {
  depth: number;
  multipv: number; // 1 起
  scoreCp: number;
  mateIn?: number;
  pv: string[];
  nps?: number;
}

export interface SearchResultShape {
  bestMove: string;
  scoreCp: number;
  mateIn?: number;
  depth: number;
  pv: string[];
  nps?: number;
}

const CP_RE = /score cp (-?\d+)/;
const MATE_RE = /score mate (-?\d+)/;
const PV_RE = /\bpv (.+)$/;
const DEPTH_RE = /\bdepth (\d+)/;
const MPV_RE = /\bmultipv (\d+)/;
const NPS_RE = /\bnps (\d+)/;

export function parseInfoLine(line: string): ParsedInfo | null {
  if (!line.startsWith('info')) return null;
  const cp = CP_RE.exec(line);
  const mate = MATE_RE.exec(line);
  if (!cp && !mate) return null; // 只关心带评分的行
  const pvMatch = PV_RE.exec(line);
  const npsMatch = NPS_RE.exec(line);
  const mateIn = mate ? parseInt(mate[1], 10) : undefined;
  return {
    depth: parseInt(DEPTH_RE.exec(line)?.[1] ?? '0', 10),
    multipv: parseInt(MPV_RE.exec(line)?.[1] ?? '1', 10),
    scoreCp: cp
      ? parseInt(cp[1], 10)
      : mateIn! > 0
        ? 30000
        : -30000,
    mateIn,
    pv: pvMatch ? pvMatch[1].trim().split(/\s+/) : [],
    nps: npsMatch ? parseInt(npsMatch[1], 10) : undefined,
  };
}

export function parseBestmove(line: string): string | null {
  const m = /^bestmove (\S+)/.exec(line);
  return m ? m[1] : null;
}

/** 从一次搜索的全部 UCI 行里，取每个 multipv 最深的一条 info 并挂上 bestmove。 */
export function assembleSearch(lines: string[]): SearchResultShape[] {
  const best = new Map<number, ParsedInfo>();
  for (const l of lines) {
    const info = parseInfoLine(l);
    if (!info) continue;
    const prev = best.get(info.multipv);
    if (!prev || info.depth >= prev.depth) best.set(info.multipv, info);
  }

  let bestmove = '';
  for (const l of lines) {
    const bm = parseBestmove(l);
    if (bm) {
      bestmove = bm;
      break;
    }
  }

  return [...best.values()]
    .sort((a, b) => b.scoreCp - a.scoreCp)
    .map((info, i) => ({
      bestMove: i === 0 && bestmove ? bestmove : (info.pv[0] ?? ''),
      scoreCp: info.scoreCp,
      mateIn: info.mateIn,
      depth: info.depth,
      pv: info.pv,
      nps: info.nps,
    }));
}
