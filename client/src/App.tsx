import { useState, useCallback, useEffect } from 'react';
import { useGameState, makeFreePlayState, makeScenarioState } from './useGameState';
import { Pitch } from './Pitch';
import { PieceMenu } from './PieceMenu';
import type { PieceMenuAction } from './PieceMenu';
import { PlayerPanel } from './PlayerPanel';
import { DiceLog } from './DiceLog';
import { PhaseModal } from './PhaseModal';
import { ScenarioSelect } from './ScenarioSelect';
import { SubmitModal } from './SubmitModal';
import { Leaderboard } from './Leaderboard';
import { ScoreSummary } from './ScoreSummary';
import { submitScore, fetchLeaderboard } from './api';
import type { AppMode, PlayerPiece, Scenario, LeaderboardEntry } from './types';
import { key } from './bfs';
import './App.css';

const TURNS_PER_HALF = 8;

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('home');
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [leaderboardHighlight, setLeaderboardHighlight] = useState<string | undefined>();
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);
  const [leaderboardInitialEntries, setLeaderboardInitialEntries] = useState<LeaderboardEntry[] | undefined>();
  const [selectedEntry, setSelectedEntry] = useState<LeaderboardEntry | undefined>();


  // Game state — reinitialised when mode/scenario changes
  const { state, setState, handleSquareClick: hookSquareClick, handleSquareHover: hookSquareHover,
          handleSquareLeave: hookSquareLeave, handleCancelSelection,
          handleContinue, handleHandoffAction, handleHandoffTarget }
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

  // Route square clicks: handoff targeting takes priority over normal movement
  const handleSquareClick = useCallback((col: number, row: number) => {
    if (state.isHandoffTargeting) {
      handleHandoffTarget(col, row);
    } else {
      hookSquareClick(col, row);
    }
  }, [state.isHandoffTargeting, handleHandoffTarget, hookSquareClick]);

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

    // During handoff targeting, clicking a highlighted receiver executes the handoff
    if (state.isHandoffTargeting) {
      if (state.handoffTargets.has(k)) {
        handleHandoffTarget(col, row);
      } else {
        handleCancelSelection();
      }
      return;
    }

    // If a piece is already selected and this is a reachable square — treat as a move waypoint
    if (state.selectedPieceId && state.reachableKeys.has(k)) {
      hookSquareClick(col, row);
      return;
    }

    // Clicking the already-selected piece ends activation
    if (piece.id === state.selectedPieceId) {
      hookSquareClick(col, row);
      return;
    }

    // Own unactivated piece — show context menu
    if (piece.team === state.activeTeam && !piece.activated) {
      setPieceMenu({ piece, x, y });
      return;
    }

    // Anything else (opponent, activated piece) — fall through to normal click
    hookSquareClick(col, row);
  }, [state.pieces, state.selectedPieceId, state.reachableKeys, state.activeTeam,
      state.isHandoffTargeting, state.handoffTargets,
      hookSquareClick, handleHandoffTarget, handleCancelSelection]);

  const handleMenuAction = useCallback((actionKey: string) => {
    if (!pieceMenu) return;
    setPieceMenu(null);
    if (actionKey === 'move') {
      const { col, row } = pieceMenu.piece.position;
      hookSquareClick(col, row);
    } else if (actionKey === 'handoff') {
      handleHandoffAction(pieceMenu.piece.id);
    }
  }, [pieceMenu, hookSquareClick, handleHandoffAction]);

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
    // Risky moves: dodge/GFI steps AND handoff catch rolls
    const riskyMoves = state.actionLog.filter(e =>
      e.kind === 'handoff' || e.dodgeTarget !== null || e.isGfi
    );
    const dodgeCount = riskyMoves.length;
    const moves = riskyMoves.map(e => {
      if (e.kind === 'handoff') {
        return {
          pieceName: e.pieceName,
          pieceRole: e.pieceRole,
          receiverName: e.receiverName,
          receiverRole: e.receiverRole,
          from: e.from,
          to: e.to,
          dodgeTarget: null as null,
          isGfi: false as false,
          catchTarget: e.catchTarget,
          actionProb: e.actionProb,
          cumulativeProb: e.cumulativeProb,
        };
      }
      return {
        pieceName: e.pieceName,
        pieceRole: e.pieceRole,
        from: e.from,
        to: e.to,
        dodgeTarget: e.dodgeTarget,
        isGfi: e.isGfi,
        actionProb: e.actionProb,
        cumulativeProb: e.cumulativeProb,
      };
    });
    try {
      const entry = await submitScore(activeScenario.id, name, cumulativeProb, dodgeCount, moves);
      setLeaderboardHighlight(entry.id);
      setState(s => ({ ...s, phase: 'playing' }));
      setAppMode('leaderboard');
      await new Promise(res => setTimeout(res, 3000));
      const entries = await fetchLeaderboard(activeScenario.id);
      setLeaderboardInitialEntries(entries);
      setLeaderboardRefreshKey(k => k + 1);
    } catch {
      setState(s => ({ ...s, phase: 'playing' }));
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
    if (selectedEntry) {
      return (
        <div className="app app--home">
          <ScoreSummary
            entry={selectedEntry}
            onBack={() => setSelectedEntry(undefined)}
          />
        </div>
      );
    }
    return (
      <div className="app app--home">
        <Leaderboard
          key={leaderboardRefreshKey}
          scenario={activeScenario}
          onBack={() => { setLeaderboardInitialEntries(undefined); setAppMode('home'); }}
          highlightId={leaderboardHighlight}
          initialEntries={leaderboardInitialEntries}
          onEntriesLoaded={setLeaderboardInitialEntries}
          onRowClick={setSelectedEntry}
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
  const activationStatus = state.isHandoffTargeting
    ? 'Select a receiver to hand off to · Esc to cancel'
    : state.pendingHandoff
    ? `Hand Off declared — move up to ${state.remainingMa} MA, then click piece to hand off · Esc to cancel`
    : activePiece?.activated && !state.selectedPieceId
    ? 'Piece activated — end your turn'
    : state.selectedPieceId
    ? `Planning — ${state.remainingMa} MA left · Esc to cancel`
    : 'Select your piece to move';

  const currentTurn = state.activeTeam === 'human' ? state.humanTurn : state.orcTurn;
  const displayTurn = Math.min(currentTurn, TURNS_PER_HALF);

  // Live probability: committed actions × pending dodges not yet committed
  const lastCommittedProb = state.actionLog.length > 0
    ? state.actionLog[state.actionLog.length - 1].cumulativeProb : 1;
  const liveProbPct = Math.round(lastCommittedProb * state.pendingProb * 100);
  // Always show in puzzle mode — starts at 100% and decreases as risky moves are added

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

        {state.isPuzzleMode && (
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
      {pieceMenu && (() => {
        const menuPiece = pieceMenu.piece;
        const canHandoff = menuPiece.hasBall && !state.passUsed && !menuPiece.activated;
        const menuActions: PieceMenuAction[] = [
          { label: 'Move', key: 'move' },
          { label: 'Hand Off', key: 'handoff', disabled: !canHandoff },
        ];
        return (
          <PieceMenu
            piece={menuPiece}
            x={pieceMenu.x}
            y={pieceMenu.y}
            actions={menuActions}
            onAction={handleMenuAction}
            onDismiss={dismissMenu}
          />
        );
      })()}
    </div>
  );
}
