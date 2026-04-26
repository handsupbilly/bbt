import type { GameState, Position } from './types';
import { tacklezoneKeys, key } from './bfs';
import './Pitch.css';

const COLS = 26;
const ROWS = 15;

interface Props {
  state: GameState;
  onSquareClick: (col: number, row: number) => void;
  onSquareHover: (col: number, row: number) => void;
  onSquareLeave: () => void;
}

export function Pitch({ state, onSquareClick, onSquareHover, onSquareLeave }: Props) {
  const pieceMap = new Map(state.pieces.map(p => [key(p.position), p]));

  // Preview path keys and their dodge status
  const previewDodgeKeys = new Set(
    state.pathPreview.filter(s => s.requiresDodge).map(s => key(s.pos))
  );
  const previewFreeKeys = new Set(
    state.pathPreview.filter(s => !s.requiresDodge).map(s => key(s.pos))
  );

  // Ghost = last square in preview path
  const ghostKey = state.pathPreview.length > 0
    ? key(state.pathPreview[state.pathPreview.length - 1].pos)
    : null;

  // Committed path dots (excluding origin and current piece position)
  const committedKeys = new Set(state.committedPath.map(key));

  // Ghost carries ball if selected piece has ball
  const selectedPiece = state.selectedPieceId
    ? state.pieces.find(p => p.id === state.selectedPieceId)
    : null;
  const ghostHasBall = selectedPiece?.hasBall ?? false;

  // Tackle zones — only when a piece is selected
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

      // Reachable but not in preview = dim highlight
      const isReachable = state.reachableKeys.has(k) && !previewFreeKeys.has(k) && !previewDodgeKeys.has(k) && k !== ghostKey;
      const isPreviewFree  = previewFreeKeys.has(k) && k !== ghostKey;
      const isPreviewDodge = previewDodgeKeys.has(k) && k !== ghostKey;
      const isGhost        = ghostKey === k && !piece;
      const isInTZ         = tzKeys.has(k) && !isReachable && !isPreviewFree && !isPreviewDodge;
      const isCommitted    = committedKeys.has(k) && !piece && !isGhost;

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

      squares.push(
        <div
          key={k}
          className={classes}
          onClick={() => onSquareClick(col, row)}
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

          {isCommitted && !isGhost && (
            <div className={`path-dot path-dot--${state.activeTeam}`} />
          )}

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
