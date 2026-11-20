import { pieceName, squareName, type Piece, type Position, type Square } from '@cc/rules';

const CELL = 54;
const MARGIN = 34;
const W = 8 * CELL + MARGIN * 2;
const H = 9 * CELL + MARGIN * 2;

const px = (file: number) => MARGIN + file * CELL;
const py = (rank: number) => MARGIN + (9 - rank) * CELL;

const FILES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const RANKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export interface ChessboardProps {
  position: Position;
  selected?: Square | null;
  targets?: Square[];
  lastMove?: { from: Square; to: Square } | null;
  highlights?: Square[];
  onSquareClick?: (sq: Square) => void;
}

function PieceView({ piece, sq }: { piece: Piece; sq: Square }) {
  const red = piece.color === 'red';
  const ink = red ? '#b3261e' : '#262626';
  return (
    <g pointerEvents="none">
      <circle cx={px(sq.file)} cy={py(sq.rank)} r={23} fill="#fdf3d8" stroke={ink} strokeWidth={2.5} />
      <circle
        cx={px(sq.file)}
        cy={py(sq.rank)}
        r={19}
        fill="none"
        stroke={ink}
        strokeWidth={1}
        opacity={0.45}
      />
      <text
        x={px(sq.file)}
        y={py(sq.rank) + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={26}
        fontFamily="Songti SC, STSong, SimSun, serif"
        fontWeight={700}
        fill={ink}
      >
        {pieceName(piece)}
      </text>
    </g>
  );
}

export function Chessboard({
  position,
  selected = null,
  targets = [],
  lastMove = null,
  highlights = [],
  onSquareClick,
}: ChessboardProps) {
  const pieces: Array<{ piece: Piece; sq: Square }> = [];
  for (const rank of RANKS) {
    for (const file of FILES) {
      const piece = position.board[rank * 9 + file];
      if (piece) pieces.push({ piece, sq: { file, rank } });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', maxWidth: 520, display: 'block', touchAction: 'manipulation' }}
      role="img"
      aria-label="中国象棋棋盘"
    >
      <rect width={W} height={H} rx={12} fill="#f0d9a7" />

      {/* 棋格 */}
      <g stroke="#7a5c34" strokeWidth={1.2}>
        {RANKS.map((rank) => (
          <line key={`h${rank}`} x1={px(0)} y1={py(rank)} x2={px(8)} y2={py(rank)} />
        ))}
        {[0, 8].map((file) => (
          <line key={`v${file}`} x1={px(file)} y1={py(0)} x2={px(file)} y2={py(9)} />
        ))}
        {[1, 2, 3, 4, 5, 6, 7].map((file) => (
          <g key={`vs${file}`}>
            <line x1={px(file)} y1={py(0)} x2={px(file)} y2={py(4)} />
            <line x1={px(file)} y1={py(5)} x2={px(file)} y2={py(9)} />
          </g>
        ))}
        {/* 九宫斜线 */}
        <line x1={px(3)} y1={py(0)} x2={px(5)} y2={py(2)} />
        <line x1={px(5)} y1={py(0)} x2={px(3)} y2={py(2)} />
        <line x1={px(3)} y1={py(7)} x2={px(5)} y2={py(9)} />
        <line x1={px(5)} y1={py(7)} x2={px(3)} y2={py(9)} />
      </g>

      <rect
        x={px(0) - 6}
        y={py(9) - 6}
        width={px(8) - px(0) + 12}
        height={py(0) - py(9) + 12}
        fill="none"
        stroke="#7a5c34"
        strokeWidth={2.5}
      />

      <text
        x={px(2)}
        y={(py(4) + py(5)) / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={21}
        fill="#a8865a"
        fontFamily="Songti SC, STSong, serif"
        letterSpacing={6}
      >
        楚 河
      </text>
      <text
        x={px(6)}
        y={(py(4) + py(5)) / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={21}
        fill="#a8865a"
        fontFamily="Songti SC, STSong, serif"
        letterSpacing={6}
      >
        汉 界
      </text>

      {/* 上一步走法 */}
      {lastMove &&
        [lastMove.from, lastMove.to].map((sq, i) => (
          <rect
            key={`lm${i}`}
            x={px(sq.file) - CELL / 2 + 3}
            y={py(sq.rank) - CELL / 2 + 3}
            width={CELL - 6}
            height={CELL - 6}
            rx={6}
            fill="rgba(255,193,7,0.35)"
          />
        ))}

      {/* 事实高亮 */}
      {highlights.map((sq, i) => (
        <rect
          key={`hl${i}`}
          x={px(sq.file) - CELL / 2 + 2}
          y={py(sq.rank) - CELL / 2 + 2}
          width={CELL - 4}
          height={CELL - 4}
          rx={6}
          fill="none"
          stroke="#d32f2f"
          strokeWidth={2.5}
          strokeDasharray="6 4"
        />
      ))}

      {/* 可落点 */}
      {targets.map((sq, i) => {
        const occupied = position.board[sq.rank * 9 + sq.file] !== null;
        return occupied ? (
          <circle
            key={`tg${i}`}
            cx={px(sq.file)}
            cy={py(sq.rank)}
            r={25}
            fill="none"
            stroke="#2e7d32"
            strokeWidth={3}
            opacity={0.85}
          />
        ) : (
          <circle
            key={`tg${i}`}
            cx={px(sq.file)}
            cy={py(sq.rank)}
            r={7}
            fill="#2e7d32"
            opacity={0.55}
          />
        );
      })}

      {pieces.map(({ piece, sq }) => (
        <PieceView key={`${sq.file}-${sq.rank}`} piece={piece} sq={sq} />
      ))}

      {/* 选中 */}
      {selected && (
        <rect
          x={px(selected.file) - CELL / 2 + 1}
          y={py(selected.rank) - CELL / 2 + 1}
          width={CELL - 2}
          height={CELL - 2}
          rx={8}
          fill="none"
          stroke="#1565c0"
          strokeWidth={3}
        />
      )}

      {/* 点击层 */}
      {RANKS.map((rank) =>
        FILES.map((file) => {
          const sq = { file, rank };
          return (
            <rect
              key={`c${file}-${rank}`}
              data-square={squareName(sq)}
              x={px(file) - CELL / 2}
              y={py(rank) - CELL / 2}
              width={CELL}
              height={CELL}
              fill="rgba(0,0,0,0)"
              style={{ cursor: onSquareClick ? 'pointer' : 'default' }}
              onClick={() => onSquareClick?.(sq)}
            />
          );
        })
      )}
    </svg>
  );
}
