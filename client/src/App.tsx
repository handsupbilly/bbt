import { useState, useCallback, useEffect } from 'react';
import { useGameState, makeFreePlayState, makeScenarioState, successChance } from './useGameState';
import { Pitch } from './Pitch';
import { PlayerPanel } from './PlayerPanel';
import { DiceLog } from './DiceLog';
import { DiceModal } from './DiceModal';
import { PhaseModal } from './PhaseModal';
import { ScenarioSelect } from './ScenarioSelect';
import { SubmitModal } from './SubmitModal';
import { Leaderboard } from './Leaderboard';
import { submitScore } from './api';
import type { AppMode, PlayerPiece, Scenario } from './types';
import { key } from './bfs';
import './App.css';

const TURNS_PER_HALF = 8;

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('home');
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [leaderboardHighlight, setLeaderboardHighlight] = useState<string | undefined>();
  const [submitPending, setSubmitPending] = useState(false);

  // Game state — reinitialised when mode/scenario changes
  const { state, setState, handleSquareClick, handleSquareHover: hookSquareHover,
          handleSquareLeave: hookSquareLeave, handleCancelSelection,
          handleRollDodge, handleDismissDodge, handleEndTurn, handleContinue }
    = useGameState(makeFreePlayState());

  const startFreePlay = useCallback(() => {
    setState(makeFreePlayState());
    setAppMode('freeplay');
  }, [setState]);

  const startPuzzle = useCallback((scenario: Scenario) => {
    setActiveScenario(scenario);
    setState(makeScenarioState(scenario));
    setAppMode('puzzle');
  }, [setState]);

  const goLeaderboard = useCallback((scenario: Scenario) => {
    setActiveScenario(scenario);
    setLeaderboardHighlight(undefined);
    setAppMode('leaderboard');
  }, []);

  // Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCancelSelection(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleCancelSelection]);

  // Hover state for right panel (opponent info) — combined with movement hover
  const [hoveredOpponent, setHoveredOpponent] = useState<PlayerPiece | null>(null);
  const handleSquareHover = useCallback((col: number, row: number) => {
    // Update movement preview in game state
    hookSquareHover(col, row);
    // Update opponent panel
    const k = key({ col, row });
    const piece = state.pieces.find(p => key(p.position) === k);
    setHoveredOpponent(piece && piece.team !== state.activeTeam ? piece : null);
  }, [hookSquareHover, state.pieces, state.activeTeam]);
  const handleSquareLeave = useCallback(() => {
    hookSquareLeave();
    setHoveredOpponent(null);
  }, [hookSquareLeave]);

  // Submission handler
  const handleSubmit = useCallback(async (name: string) => {
    if (!activeScenario) return;
    setSubmitPending(true);
    try {
      const prob = state.diceLog.length > 0
        ? state.diceLog[state.diceLog.length - 1].cumulativeProb
        : 1;
      const entry = await submitScore(activeScenario.id, name, prob, state.diceLog.length);
      setLeaderboardHighlight(entry.id);
      setState(s => ({ ...s, phase: 'playing' }));
      setAppMode('leaderboard');
    } catch {
      // submission failed — still go to leaderboard
      setAppMode('leaderboard');
    } finally {
      setSubmitPending(false);
    }
  }, [activeScenario, state.diceLog, setState]);

  const handleSkipSubmit = useCallback(() => {
    setState(s => ({ ...s, phase: 'playing' }));
    setAppMode('home');
  }, [setState]);

  const handleTouchdownFail = useCallback(() => {
    // Reset puzzle to initial state
    if (activeScenario) {
      setState(makeScenarioState(activeScenario));
    }
  }, [activeScenario, setState]);

  // ── Render: non-game screens ─────────────────────────────────────────────
  if (appMode === 'home') {
    return (
      <div className="app app--home">
        <ScenarioSelect
          onPlay={startPuzzle}
          onLeaderboard={goLeaderboard}
          onFreePlay={startFreePlay}
        />
      </div>
    );
  }

  if (appMode === 'leaderboard' && activeScenario) {
    return (
      <div className="app app--home">
        <Leaderboard
          scenario={activeScenario}
          onBack={() => setAppMode('home')}
          highlightId={leaderboardHighlight}
        />
      </div>
    );
  }

  // ── Game screen (freeplay or puzzle) ─────────────────────────────────────
  const selectedPiece = state.selectedPieceId
    ? state.pieces.find(p => p.id === state.selectedPieceId) ?? null
    : null;

  const teamLabel = state.activeTeam === 'human' ? 'Human' : 'Orc';
  const activePiece = state.pieces.find(p => p.team === state.activeTeam);
  const activationStatus = activePiece?.activated && !state.selectedPieceId
    ? 'Piece activated — end your turn'
    : state.selectedPieceId
    ? `Planning — ${state.remainingMa} MA left · End Turn to confirm · Esc to cancel`
    : 'Select your piece to move';

  const currentTurn = state.activeTeam === 'human' ? state.humanTurn : state.orcTurn;
  const displayTurn = Math.min(currentTurn, TURNS_PER_HALF);

  // Live probability display
  const liveProbPct = (() => {
    const rolled = state.diceLog.length > 0
      ? state.diceLog[state.diceLog.length - 1].cumulativeProb : 1;
    return Math.round(rolled * state.pendingProb * 100);
  })();
  const showProb = state.diceLog.length > 0 || state.pendingDodgeTargets.length > 0;

  return (
    <div className="app">
      <header className="hud">
        <button className="hud__back" onClick={() => setAppMode('home')}>← Menu</button>

        {!state.isPuzzleMode && (
          <div className="hud__score">
            <span className="hud__score-label hud__score-label--human">Human</span>
            <span className="hud__score-value">{state.score.human}</span>
            <span className="hud__score-sep">–</span>
            <span className="hud__score-value">{state.score.orc}</span>
            <span className="hud__score-label hud__score-label--orc">Orc</span>
          </div>
        )}

        {state.isPuzzleMode && showProb && (
          <div className="hud__prob">
            <span className="hud__prob-label">Success chance</span>
            <span className={`hud__prob-value ${liveProbPct < 50 ? 'hud__prob-value--risky' : ''}`}>
              {liveProbPct}%
            </span>
          </div>
        )}

        {!state.isPuzzleMode && (
          <div className="hud__meta">
            <span className="hud__half">Half {state.half}</span>
            <span className="hud__turn">Turn {displayTurn} / {TURNS_PER_HALF}</span>
          </div>
        )}

        <div className="hud__team">
          <span className={`hud__dot hud__dot--${state.activeTeam}`} />
          <strong>{teamLabel}'s Turn</strong>
        </div>

        <div className="hud__status">{activationStatus}</div>

        <button className="hud__end-turn" onClick={handleEndTurn} disabled={state.phase !== 'playing'}>
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
          <PlayerPanel piece={hoveredOpponent} side="right" />
        </div>
      </div>

      {/* Dodge modal */}
      {state.phase === 'dodge_roll' && state.pendingDodge && (
        <DiceModal
          pending={state.pendingDodge}
          lastResult={state.lastDiceResult}
          onRoll={handleRollDodge}
          onDismiss={handleDismissDodge}
        />
      )}

      {/* Free-play half/game over */}
      {(state.phase === 'half_over' || state.phase === 'game_over') && (
        <PhaseModal state={state} onContinue={handleContinue} />
      )}

      {/* Puzzle: touchdown — submit score */}
      {state.phase === 'touchdown' && state.isPuzzleMode && (
        <SubmitModal
          probability={state.diceLog.length > 0
            ? state.diceLog[state.diceLog.length - 1].cumulativeProb : 1}
          diceCount={state.diceLog.length}
          onSubmit={handleSubmit}
          onDismiss={handleSkipSubmit}
        />
      )}

      {/* Puzzle: touchdown failed */}
      {state.phase === 'touchdown_fail' && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2 className="modal__title">Dodge Failed!</h2>
            <p className="modal__desc">The ball carrier was brought down. Try a different route.</p>
            <button className="modal__roll-btn" onClick={handleTouchdownFail}>Try Again</button>
          </div>
        </div>
      )}
    </div>
  );
}
