import { useState, useCallback, useEffect } from 'react';
import { useGameState } from './useGameState';
import { Pitch } from './Pitch';
import { PlayerPanel } from './PlayerPanel';
import { DiceLog } from './DiceLog';
import { DiceModal } from './DiceModal';
import { PhaseModal } from './PhaseModal';
import type { PlayerPiece } from './types';
import { key } from './bfs';
import './App.css';

const TURNS_PER_HALF = 8;

function App() {
  const {
    state,
    handleSquareClick,
    handleCancelSelection,
    handleRollDodge,
    handleDismissDodge,
    handleEndTurn,
    handleContinue,
  } = useGameState();

  // Escape key cancels selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancelSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleCancelSelection]);

  // Piece shown in the right panel — opponent hovered or clicked
  const [hoveredOpponent, setHoveredOpponent] = useState<PlayerPiece | null>(null);

  const handleSquareHover = useCallback((col: number, row: number) => {
    const k = key({ col, row });
    const piece = state.pieces.find(p => key(p.position) === k);
    if (piece && piece.team !== state.activeTeam) {
      setHoveredOpponent(piece);
    } else {
      setHoveredOpponent(null);
    }
  }, [state.pieces, state.activeTeam]);

  const handleSquareLeave = useCallback(() => {
    setHoveredOpponent(null);
  }, []);

  // Left panel: selected own piece
  const selectedPiece = state.selectedPieceId
    ? state.pieces.find(p => p.id === state.selectedPieceId) ?? null
    : null;

  // Right panel: hovered opponent, or clicked opponent
  const rightPiece = hoveredOpponent;

  const teamLabel = state.activeTeam === 'human' ? 'Human' : 'Orc';
  const activePiece = state.pieces.find(p => p.team === state.activeTeam);
  const activationStatus = activePiece?.activated && !state.selectedPieceId
    ? 'Piece activated — end your turn'
    : state.selectedPieceId
    ? `Planning path — ${state.remainingMa} MA left · End Turn to confirm · click piece or Esc to cancel`
    : 'Select your piece to move';

  const currentTurn = state.activeTeam === 'human' ? state.humanTurn : state.orcTurn;
  const displayTurn = Math.min(currentTurn, TURNS_PER_HALF);

  return (
    <div className="app">
      <header className="hud">
        <div className="hud__score">
          <span className="hud__score-label hud__score-label--human">Human</span>
          <span className="hud__score-value">{state.score.human}</span>
          <span className="hud__score-sep">–</span>
          <span className="hud__score-value">{state.score.orc}</span>
          <span className="hud__score-label hud__score-label--orc">Orc</span>
        </div>

        <div className="hud__meta">
          <span className="hud__half">Half {state.half}</span>
          <span className="hud__turn">Turn {displayTurn} / {TURNS_PER_HALF}</span>
        </div>

        <div className="hud__team">
          <span className={`hud__dot hud__dot--${state.activeTeam}`} />
          <strong>{teamLabel}'s Turn</strong>
        </div>

        <div className="hud__status">{activationStatus}</div>

        <button
          className="hud__end-turn"
          onClick={handleEndTurn}
          disabled={state.phase !== 'playing'}
        >
          End Turn
        </button>
      </header>

      <div className="legend">
        <span className="legend__item legend__item--tz">Tackle Zone</span>
        <span className="legend__item legend__item--free">Free Move</span>
        <span className="legend__item legend__item--dodge">Dodge Required</span>
      </div>

      <div className="game-area">
        <div className="side-col side-col--left">
          <PlayerPanel piece={selectedPiece} side="left" />
          <DiceLog
            log={state.diceLog}
            pendingProb={state.pendingProb}
            pendingTargets={state.pendingDodgeTargets}
          />
        </div>

        <main className="pitch-wrapper">
          <Pitch
            state={state}
            onSquareClick={handleSquareClick}
            onSquareHover={handleSquareHover}
            onSquareLeave={handleSquareLeave}
          />
        </main>

        <div className="side-col side-col--right">
          <PlayerPanel piece={rightPiece} side="right" />
        </div>
      </div>

      {state.phase === 'dodge_roll' && state.pendingDodge && (
        <DiceModal
          pending={state.pendingDodge}
          lastResult={state.lastDiceResult}
          onRoll={handleRollDodge}
          onDismiss={handleDismissDodge}
        />
      )}

      {(state.phase === 'half_over' || state.phase === 'game_over') && (
        <PhaseModal state={state} onContinue={handleContinue} />
      )}
    </div>
  );
}

export default App;
