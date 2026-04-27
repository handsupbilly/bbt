import type { GameState } from './types';
import { tacklezoneKeys, key } from './bfs';
import './Pitch.css';

// Dot positions for each face of a d6 (cx, cy as % of viewBox 0 0 20 20)
const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[10, 10]],
  2: [[5, 5], [15, 15]],
  3: [[5, 5], [10, 10], [15, 15]],
  4: [[5, 5], [15, 5], [5, 15], [15, 15]],
  5: [[5, 5], [15, 5], [10, 10], [5, 15], [15, 15]],
  6: [[5, 4], [15, 4], [5, 10], [15, 10], [5, 16], [15, 16]],
};

function DiceFace({ target }: { target: number }) {
  const dots = DOT_POSITIONS[target] ?? DOT_POSITIONS[6];
  return (
    <svg
      className="dodge-die"
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="18" height="18" rx="3" ry="3"
        fill="rgba(30,20,10,0.75)" stroke="rgba(255,160,0,0.9)" strokeWidth="1.5" />
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="2" fill="rgba(255,200,80,0.95)" />
      ))}
    </svg>
  );
}

const COLS = 26;
const ROWS = 15;

interface Props {
  state: GameState;
  onSquareClick: (col: number, row: number) => void;
  onPieceClick: (col: number, row: number, x: number, y: number) => void;
  onSquareHover: (col: number, row: number) => void;
  onSquareLeave: () => void;
}

export function Pitch({ state, onSquareClick, onPieceClick, onSquareHover, onSquareLeave }: Props) {
  const pieceMap = new Map(state.pieces.map(p => [key(p.position), p]));

  // Preview path: map from key -> step info
  const previewStepMap = new Map<string, { stepNum: number; requiresDodge: boolean; dodgeTarget: number | null }>();
  state.pathPreview.forEach((s, i) => {
    previewStepMap.set(key(s.pos), { stepNum: i + 1, requiresDodge: s.requiresDodge, dodgeTarget: s.dodgeTarget });
  });

  // Ghost = last square in preview path
  const ghostKey = state.pathPreview.length > 0
    ? key(state.pathPreview[state.pathPreview.length - 1].pos)
    : null;

  // Walked squares: every individual square stepped through, in order.
  // Map key -> 1-based step number for rendering.
  const walkedMap = new Map<string, number>();
  state.walkedSquares.forEach((pos, i) => walkedMap.set(key(pos), i + 1));

  const selectedPiece = state.selectedPieceId
    ? state.pieces.find(p => p.id === state.selectedPieceId)
    : null;
  const ghostHasBall = selectedPiece?.hasBall ?? false;

  const isSelecting = !!state.selectedPieceId;
  const opponents   = state.pieces.filter(p => p.team !== state.activeTeam).map(p => p.position);
  const tzKeys      = isSelecting ? tacklezoneKeys(opponents) : new Set<string>();

  const squares = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const k = `${col},${row}`;
      const piece      = pieceMap.get(k);
      const isSelected = piece?.id === state.selectedPieceId;
      const isEndZone  = col === 0 || col === COLS - 1;

      const previewStep    = previewStepMap.get(k);
      const isGhost        = ghostKey === k && !piece;
      const isPreviewFree  = previewStep && !previewStep.requiresDodge && !isGhost;
      const isPreviewDodge = previewStep && previewStep.requiresDodge && !isGhost;
      const isReachable    = state.reachableKeys.has(k) && !previewStep && k !== ghostKey;
      const isInTZ         = tzKeys.has(k) && !isReachable && !previewStep;
      const walkedStep     = walkedMap.get(k);
      const isCommitted    = walkedStep !== undefined && !piece && !isGhost;

      const classes = [
        'square',
        (col + row) % 2 === 0 ? 'square--light' : 'square--dark',
        isEndZone       ? (col === 0 ? 'square--endzone-left' : 'square--endzone-right') : '',
        isReachable     ? 'square--reachable'    : '',
        isPreviewFree   ? 'square--preview-free' : '',
        isPreviewDodge  ? 'square--preview-dodge': '',
        isInTZ          ? 'square--tz'           : '',
        isCommitted     ? 'square--path'         : '',
      ].filter(Boolean).join(' ');

      // Step numbers on both committed and preview squares.
      // squaresWalked = MA spent = piece.ma - remainingMa.
      const squaresWalked = selectedPiece ? selectedPiece.ma - state.remainingMa : 0;
      const displayStep = isGhost
        ? null
        : previewStep
          ? squaresWalked + previewStep.stepNum
          : (isCommitted ? walkedStep! : null);

      squares.push(
        <div
          key={k}
          className={classes}
          onClick={(e) => {
            if (piece) {
              onPieceClick(col, row, e.clientX, e.clientY);
            } else {
              onSquareClick(col, row);
            }
          }}
          onMouseEnter={() => onSquareHover(col, row)}
          onMouseLeave={onSquareLeave}
        >
          {piece && (
            <div className={[
              'piece',
              `piece--${piece.team}`,
              isSelected      ? 'piece--selected'  : '',
              piece.activated ? 'piece--activated' : '',
              piece.hasBall   ? 'piece--carrier'   : '',
            ].filter(Boolean).join(' ')}>
              {piece.hasBall && <span className="ball-marker">🏈</span>}
            </div>
          )}

          {displayStep !== null && (
            <span className={`step-num ${previewStep ? 'step-num--preview' : 'step-num--committed'}`}>
              {displayStep}
            </span>
          )}

          {/* Dice face on dodge squares */}
          {previewStep?.requiresDodge && !isGhost && previewStep.dodgeTarget !== null && (
            <DiceFace target={previewStep.dodgeTarget} />
          )}

          {/* Ghost piece at hover destination */}
          {isGhost && (
            <div className={`piece piece--${state.activeTeam} piece--ghost`}>
              {ghostHasBall && <span className="ball-marker ball-marker--ghost">🏈</span>}
            </div>
          )}
        </div>
      );
    }
  }

  return <div className="pitch">{squares}</div>;
}
