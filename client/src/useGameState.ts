import { useState, useCallback } from 'react';
import type { GameState, PlayerPiece, Position, DiceResult, DiceLogEntry, Scenario } from './types';
import { computeReachable, key, neighbours } from './bfs';

const TURNS_PER_HALF = 8;
const COLS = 26;

// ── Free-play initial pieces ─────────────────────────────────────────────────
const FREE_PLAY_PIECES: PlayerPiece[] = [
  { id: 'human', team: 'human', name: 'Lineman',     position: { col: 6,  row: 7 }, ma: 6, st: 3, ag: 3, av: 8, skills: ['Block'],     activated: false, hasBall: false },
  { id: 'orc',   team: 'orc',   name: 'Orc Lineman', position: { col: 19, row: 7 }, ma: 4, st: 3, ag: 3, av: 9, skills: ['Animosity'], activated: false, hasBall: false },
];

function makeBlankState(overrides: Partial<GameState> = {}): GameState {
  return {
    pieces: [],
    activeTeam: 'human',
    selectedPieceId: null,
    reachableSquares: [],
    dodgeSquares: [],
    originPos: null,
    plannedPath: [],
    remainingMa: 0,
    pendingDodgeStep: null,
    pendingDodgeTargets: [],
    humanTurn: 1,
    orcTurn: 1,
    half: 1,
    score: { human: 0, orc: 0 },
    phase: 'playing',
    pendingDodge: null,
    lastDiceResult: null,
    diceLog: [],
    pendingProb: 1,
    isPuzzleMode: false,
    scenarioId: null,
    isTouchdownAttempt: false,
    ...overrides,
  };
}

export function makeFreePlayState(): GameState {
  return makeBlankState({ pieces: FREE_PLAY_PIECES.map(p => ({ ...p })) });
}

export function makeScenarioState(scenario: Scenario): GameState {
  const pieces: PlayerPiece[] = scenario.pieces.map(def => ({
    ...def,
    activated: false,
  }));
  return makeBlankState({
    pieces,
    activeTeam: scenario.activeTeam,
    isPuzzleMode: true,
    scenarioId: scenario.id,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function posKey(p: Position) { return key(p); }

function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
}

export function successChance(target: number): number {
  return Math.max(0, Math.min(1, (7 - target) / 6));
}

function computeHighlights(
  state: GameState,
  pieceId: string,
  fromPos: Position,
  remainingMa: number,
): Pick<GameState, 'reachableSquares' | 'dodgeSquares'> {
  const piece = state.pieces.find(p => p.id === pieceId)!;
  const opponents = state.pieces.filter(p => p.team !== piece.team).map(p => p.position);
  const others    = state.pieces.filter(p => p.id !== pieceId).map(p => p.position);
  const { free, dodge } = computeReachable(fromPos, remainingMa, others, opponents);
  return { reachableSquares: free, dodgeSquares: dodge };
}

function clearSelection(state: GameState): GameState {
  return {
    ...state,
    selectedPieceId: null,
    reachableSquares: [],
    dodgeSquares: [],
    originPos: null,
    plannedPath: [],
    remainingMa: 0,
    pendingDodgeStep: null,
    pendingDodgeTargets: [],
    pendingProb: 1,
    isTouchdownAttempt: false,
  };
}

function commitMove(state: GameState): GameState['pieces'] {
  if (!state.selectedPieceId || state.plannedPath.length === 0) return state.pieces;
  const dest = state.plannedPath[state.plannedPath.length - 1];
  return state.pieces.map(p =>
    p.id === state.selectedPieceId ? { ...p, position: dest, activated: true } : p
  );
}

/** Is `pos` a touchdown square for `team`? */
function isTouchdownSquare(pos: Position, team: string): boolean {
  return team === 'human' ? pos.col === COLS - 1 : pos.col === 0;
}

function advanceTurn(state: GameState): GameState {
  const next = { ...state };
  if (state.activeTeam === 'human') {
    next.activeTeam = 'orc';
    next.humanTurn = state.humanTurn + 1;
  } else {
    next.activeTeam = 'human';
    next.orcTurn = state.orcTurn + 1;
  }
  next.pieces = next.pieces.map(p => ({ ...p, activated: false }));
  next.selectedPieceId = null;
  next.reachableSquares = [];
  next.dodgeSquares = [];
  next.originPos = null;
  next.plannedPath = [];
  next.remainingMa = 0;
  next.pendingDodgeStep = null;
  next.pendingDodgeTargets = [];
  next.lastDiceResult = null;
  next.diceLog = [];
  next.pendingProb = 1;
  next.isTouchdownAttempt = false;
  if (!state.isPuzzleMode) {
    if (next.humanTurn > TURNS_PER_HALF && next.orcTurn > TURNS_PER_HALF) {
      next.phase = next.half === 1 ? 'half_over' : 'game_over';
    }
  }
  return next;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useGameState(initialState: GameState) {
  const [state, setState] = useState<GameState>(initialState);

  const handleSquareClick = useCallback((col: number, row: number) => {
    setState(prev => {
      if (prev.phase !== 'playing') return prev;

      const clickedPos: Position = { col, row };
      const clickedKey = posKey(clickedPos);
      const pieceOnSquare = prev.pieces.find(p => posKey(p.position) === clickedKey);

      // Cancel: clicked the selected piece
      if (prev.selectedPieceId && pieceOnSquare?.id === prev.selectedPieceId) {
        return clearSelection(prev);
      }

      // Free step
      const isFree = prev.reachableSquares.some(p => posKey(p) === clickedKey);
      if (isFree && prev.selectedPieceId) {
        const pathTip = prev.plannedPath.length > 0
          ? prev.plannedPath[prev.plannedPath.length - 1]
          : prev.originPos!;
        const cost = chebyshev(pathTip, clickedPos);
        const newRemainingMa = prev.remainingMa - cost;
        const newPath = [...prev.plannedPath, clickedPos];

        if (newRemainingMa <= 0) {
          const pieces = prev.pieces.map(p =>
            p.id === prev.selectedPieceId ? { ...p, position: clickedPos, activated: true } : p
          );
          return clearSelection({ ...prev, pieces });
        }
        const highlights = computeHighlights(prev, prev.selectedPieceId, clickedPos, newRemainingMa);
        return { ...prev, plannedPath: newPath, remainingMa: newRemainingMa, pendingDodgeStep: null, ...highlights };
      }

      // Dodge zone
      const isDodge = prev.dodgeSquares.some(p => posKey(p) === clickedKey);
      if (isDodge && prev.selectedPieceId) {
        const movingPiece = prev.pieces.find(p => p.id === prev.selectedPieceId)!;
        const target = movingPiece.ag;
        const isPendingThisSquare = prev.pendingDodgeStep && posKey(prev.pendingDodgeStep) === clickedKey;

        if (isPendingThisSquare) {
          const pathTip = prev.plannedPath.length > 0
            ? prev.plannedPath[prev.plannedPath.length - 1]
            : prev.originPos!;
          const cost = chebyshev(pathTip, clickedPos);
          const newRemainingMa = prev.remainingMa - cost;
          const newPath = [...prev.plannedPath, clickedPos];
          const newTargets = [...prev.pendingDodgeTargets, target];
          const newPendingProb = prev.pendingProb * successChance(target);

          if (newRemainingMa <= 0) {
            const pieces = commitMove({ ...prev, plannedPath: newPath });
            return {
              ...prev, pieces, plannedPath: newPath, remainingMa: newRemainingMa,
              pendingDodgeStep: null, pendingDodgeTargets: newTargets, pendingProb: newPendingProb,
              reachableSquares: [], dodgeSquares: [], phase: 'dodge_roll', lastDiceResult: null,
              pendingDodge: { pieceId: prev.selectedPieceId, destination: clickedPos, target: newTargets[0] },
            };
          }
          const highlights = computeHighlights(prev, prev.selectedPieceId, clickedPos, newRemainingMa);
          return { ...prev, plannedPath: newPath, remainingMa: newRemainingMa, pendingDodgeStep: null, pendingDodgeTargets: newTargets, pendingProb: newPendingProb, ...highlights };
        } else {
          return { ...prev, pendingDodgeStep: clickedPos };
        }
      }

      // Select own unactivated piece (puzzle: only activeTeam)
      if (
        pieceOnSquare &&
        pieceOnSquare.team === prev.activeTeam &&
        !pieceOnSquare.activated
      ) {
        const highlights = computeHighlights(prev, pieceOnSquare.id, pieceOnSquare.position, pieceOnSquare.ma);
        return {
          ...prev,
          selectedPieceId: pieceOnSquare.id,
          originPos: pieceOnSquare.position,
          plannedPath: [],
          remainingMa: pieceOnSquare.ma,
          pendingDodgeStep: null,
          pendingDodgeTargets: [],
          pendingProb: 1,
          ...highlights,
        };
      }

      // Deselect
      if (prev.selectedPieceId) return clearSelection(prev);
      return prev;
    });
  }, []);

  const handleCancelSelection = useCallback(() => {
    setState(prev => prev.selectedPieceId ? clearSelection(prev) : prev);
  }, []);

  const handleEndTurn = useCallback(() => {
    setState(prev => {
      if (prev.phase !== 'playing') return prev;

      // Check for touchdown attempt (puzzle mode: ball carrier path ends in end zone)
      if (prev.isPuzzleMode && prev.selectedPieceId && prev.plannedPath.length > 0) {
        const movingPiece = prev.pieces.find(p => p.id === prev.selectedPieceId)!;
        const dest = prev.plannedPath[prev.plannedPath.length - 1];
        if (movingPiece.hasBall && isTouchdownSquare(dest, movingPiece.team)) {
          const pieces = commitMove(prev);
          if (prev.pendingDodgeTargets.length > 0) {
            return {
              ...prev, pieces, phase: 'dodge_roll', lastDiceResult: null,
              isTouchdownAttempt: true,
              pendingDodge: {
                pieceId: prev.selectedPieceId,
                destination: dest,
                target: prev.pendingDodgeTargets[0],
              },
            };
          }
          // No dodges needed — immediate touchdown
          return clearSelection({ ...prev, pieces, phase: 'touchdown', isTouchdownAttempt: false });
        }
      }

      // Normal end turn: resolve pending dodges first
      if (prev.pendingDodgeTargets.length > 0 && prev.plannedPath.length > 0) {
        const pieces = commitMove(prev);
        return {
          ...prev, pieces, phase: 'dodge_roll', lastDiceResult: null,
          pendingDodge: {
            pieceId: prev.selectedPieceId ?? '',
            destination: prev.plannedPath[prev.plannedPath.length - 1],
            target: prev.pendingDodgeTargets[0],
          },
        };
      }

      const pieces = prev.plannedPath.length > 0 ? commitMove(prev) : prev.pieces;
      return advanceTurn({ ...prev, pieces });
    });
  }, []);

  const handleRollDodge = useCallback(() => {
    setState(prev => {
      if (prev.phase !== 'dodge_roll' || !prev.pendingDodge) return prev;
      const roll = Math.ceil(Math.random() * 6);
      const { target } = prev.pendingDodge;
      return { ...prev, lastDiceResult: { roll, success: roll >= target, target } };
    });
  }, []);

  const handleDismissDodge = useCallback(() => {
    setState(prev => {
      if (!prev.lastDiceResult || !prev.pendingDodge) return prev;
      const { success, roll, target } = prev.lastDiceResult;
      const { pieceId } = prev.pendingDodge;

      const entry: DiceLogEntry = {
        target, roll, success,
        cumulativeProb: prev.diceLog.reduce((acc, e) => acc * successChance(e.target), successChance(target)),
      };
      const newLog = [...prev.diceLog, entry];

      if (!success) {
        // Snap back to origin
        const pieces = prev.pieces.map(p =>
          p.id === pieceId && prev.originPos ? { ...p, position: prev.originPos, activated: false } : p
        );
        const failed = clearSelection({ ...prev, pieces, phase: 'playing', pendingDodge: null, diceLog: newLog });
        if (prev.isTouchdownAttempt) {
          return { ...failed, phase: 'touchdown_fail' };
        }
        return advanceTurn(failed);
      }

      // Success — next queued target?
      const remainingTargets = prev.pendingDodgeTargets.slice(1);
      if (remainingTargets.length > 0) {
        return {
          ...prev,
          pendingDodgeTargets: remainingTargets,
          lastDiceResult: null,
          diceLog: newLog,
          pendingDodge: { ...prev.pendingDodge, target: remainingTargets[0] },
        };
      }

      // All dodges passed
      const base = { ...prev, phase: 'playing' as const, pendingDodge: null, pendingDodgeTargets: [], lastDiceResult: null, diceLog: newLog, pendingProb: 1 };

      if (prev.isTouchdownAttempt) {
        return clearSelection({ ...base, phase: 'touchdown', isTouchdownAttempt: false });
      }

      return advanceTurn(clearSelection(base));
    });
  }, []);

  const handleContinue = useCallback(() => {
    setState(prev => {
      if (prev.phase === 'half_over') {
        return { ...makeFreePlayState(), half: 2 as const, score: prev.score, activeTeam: 'orc' as const };
      }
      if (prev.phase === 'game_over') return makeFreePlayState();
      return prev;
    });
  }, []);

  return { state, setState, handleSquareClick, handleCancelSelection, handleRollDodge, handleDismissDodge, handleEndTurn, handleContinue };
}
