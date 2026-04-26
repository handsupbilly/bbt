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
  const freeKeys   = new Set(state.reachableSquares.map(key));
  const dodgeKeys  = new Set(state.dodgeSquares.map(key));
  const pathKeys   = new Set(state.plannedPath.map(key));
  const pieceMap   = new Map(state.pieces.map(p => [key(p.position), p]));

  const ghostKey = state.plannedPath.length > 0
    ? key(state.plannedPath[state.plannedPath.length - 1])
    : null;

  // Ghost carries ball if the selected piece has the ball
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
      const piece          = pieceMap.get(k);
      const isFree         = freeKeys.has(k);
      const isDodge        = dodgeKeys.has(k);
      const isInTZ         = tzKeys.has(k) && !isFree && !isDodge;
      const isPath         = pathKeys.has(k) && !piece;
      const isGhost        = ghostKey === k && !piece;
      const isSelected     = piece?.id === state.selectedPieceId;
      const isEndZone      = col === 0 || col === COLS - 1;
      const isPendingDodge = state.pendingDodgeStep
        ? key(state.pendingDodgeStep) === k : false;

      const classes = [
        'square',
        (col + row) % 2 === 0 ? 'square--light' : 'square--dark',
        isEndZone ? (col === 0 ? 'square--endzone-left' : 'square--endzone-right') : '',
        isFree         ? 'square--reachable'     : '',
        isDodge        ? 'square--dodge'         : '',
        isPendingDodge ? 'square--dodge-pending' : '',
        isInTZ         ? 'square--tz'            : '',
        isPath && !isGhost ? 'square--path'      : '',
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
            <div
              className={[
                'piece',
                `piece--${piece.team}`,
                isSelected      ? 'piece--selected'  : '',
                piece.activated ? 'piece--activated' : '',
                piece.hasBall   ? 'piece--carrier'   : '',
              ].filter(Boolean).join(' ')}
            >
              {piece.hasBall && <span className="ball-marker">🏈</span>}
            </div>
          )}

          {isPath && !isGhost && (
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
