import { useState, useCallback, useEffect } from 'react';
import { useGameState, makeFreePlayState, makeScenarioState } from './useGameState';
import { Pitch } from './Pitch';
import { PieceMenu, DEFAULT_ACTIONS } from './PieceMenu';
import { PlayerPanel } from './PlayerPanel';
import { DiceLog } from './DiceLog';
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
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);


  // Game state — reinitialised when mode/scenario changes
  const { state, setState, handleSquareClick, handleSquareHover: hookSquareHover,
          handleSquareLeave: hookSquareLeave, handleCancelSelection,
          handleContinue }
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

  // Context menu state
  const [pieceMenu, setPieceMenu] = useState<{ piece: PlayerPiece; x: number; y: number } | null>(null);

  const handlePieceClick = useCallback((col: number, row: number, x: number, y: number) => {
    const k = key({ col, row });
    const piece = state.pieces.find(p => key(p.position) === k);
    if (!piece) return;

    // If a piece is already selected and this is a reachable square — treat as a move waypoint
    if (state.selectedPieceId && state.reachableKeys.has(k)) {
      handleSquareClick(col, row);
      return;
    }

    // Clicking the already-selected piece ends activation
    if (piece.id === state.selectedPieceId) {
      handleSquareClick(col, row);
      return;
    }

    // Own unactivated piece — show context menu
    if (piece.team === state.activeTeam && !piece.activated) {
      setPieceMenu({ piece, x, y });
      return;
    }

    // Anything else (opponent, activated piece) — fall through to normal click
    handleSquareClick(col, row);
  }, [state.pieces, state.selectedPieceId, state.reachableKeys, state.activeTeam, handleSquareClick]);

  const handleMenuAction = useCallback((actionKey: string) => {
    if (!pieceMenu) return;
    setPieceMenu(null);
    if (actionKey === 'move') {
      const { col, row } = pieceMenu.piece.position;
      handleSquareClick(col, row);
    }
  }, [pieceMenu, handleSquareClick]);

  const dismissMenu = useCallback(() => setPieceMenu(null), []);

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
    const cumulativeProb = state.actionLog.length > 0
      ? state.actionLog[state.actionLog.length - 1].cumulativeProb
      : 1;
    const dodgeCount = state.actionLog.filter(e => e.dodgeTarget !== null || e.isGfi).length;
    try {
      const entry = await submitScore(activeScenario.id, name, cumulativeProb, dodgeCount);
      setLeaderboardHighlight(entry.id);
      setLeaderboardRefreshKey(k => k + 1);
      setState(s => ({ ...s, phase: 'playing' }));
      setAppMode('leaderboard');
    } catch {
      setAppMode('leaderboard');
    }
  }, [activeScenario, state.actionLog, setState]);

  const handleSkipSubmit = useCallback(() => {
    setState(s => ({ ...s, phase: 'playing' }));
    setAppMode('home');
  }, [setState]);

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
          refreshKey={leaderboardRefreshKey}
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

  // Live probability: committed actions × pending dodges not yet committed
  const lastCommittedProb = state.actionLog.length > 0
    ? state.actionLog[state.actionLog.length - 1].cumulativeProb : 1;
  const liveProbPct = Math.round(lastCommittedProb * state.pendingProb * 100);
  const showProb = state.actionLog.some(e => e.dodgeTarget !== null || e.isGfi) || state.pendingDodgeTargets.length > 0;

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
      </header>

      <div className="legend">
        <span className="legend__item legend__item--tz">Tackle Zone</span>
        <span className="legend__item legend__item--free">Free Move</span>
        <span className="legend__item legend__item--gfi">Go For It</span>
        <span className="legend__item legend__item--dodge">Dodge Required</span>
      </div>

      <div className="game-area">
        <div className="side-col side-col--left">
          <PlayerPanel piece={selectedPiece} side="left" />
          <DiceLog
            log={state.actionLog}
            pendingProb={state.pendingProb}
            pendingTargets={state.pendingDodgeTargets}
          />

        </div>

        <main className="pitch-wrapper">
          <Pitch
            state={state}
            onSquareClick={handleSquareClick}
            onPieceClick={handlePieceClick}
            onSquareHover={handleSquareHover}
            onSquareLeave={handleSquareLeave}
          />
        </main>

        <div className="side-col side-col--right">
          <PlayerPanel piece={hoveredOpponent} side="right" />
        </div>
      </div>

      {/* Free-play half/game over */}
      {(state.phase === 'half_over' || state.phase === 'game_over') && (
        <PhaseModal state={state} onContinue={handleContinue} />
      )}

      {/* Touchdown — show summary and submit score */}
      {state.phase === 'touchdown' && (
        <SubmitModal
          actionLog={state.actionLog}
          onSubmit={handleSubmit}
          onDismiss={handleSkipSubmit}
        />
      )}

      {/* Piece context menu */}
      {pieceMenu && (
        <PieceMenu
          piece={pieceMenu.piece}
          x={pieceMenu.x}
          y={pieceMenu.y}
          actions={DEFAULT_ACTIONS}
          onAction={handleMenuAction}
          onDismiss={dismissMenu}
        />
      )}
    </div>
  );
}
