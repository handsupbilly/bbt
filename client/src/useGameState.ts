import { useState, useCallback } from 'react';
import type { GameState, PlayerPiece, Position, DiceResult, DiceLogEntry, Scenario } from './types';
import { computeReachable, findShortestPath, key } from './bfs';
import type { PathStep } from './bfs';

const TURNS_PER_HALF = 8;
const COLS = 26;

const FREE_PLAY_PIECES: PlayerPiece[] = [
  { id: 'human', team: 'human', name: 'Lineman',     position: { col: 6,  row: 7 }, ma: 6, st: 3, ag: 3, av: 8, skills: ['Block'],     activated: false, hasBall: false },
  { id: 'orc',   team: 'orc',   name: 'Orc Lineman', position: { col: 19, row: 7 }, ma: 4, st: 3, ag: 3, av: 9, skills: ['Animosity'], activated: false, hasBall: false },
];

function makeBlankState(overrides: Partial<GameState> = {}): GameState {
  return {
    pieces: [],
    activeTeam: 'human',
    selectedPieceId: null,
    reachableKeys: new Set(),
    originPos: null,
    committedPath: [],
    pathPreview: [],
    remainingMa: 0,
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
  return makeBlankState({
    pieces: scenario.pieces.map(def => ({ ...def, activated: false })),
    activeTeam: scenario.activeTeam,
    isPuzzleMode: true,
    scenarioId: scenario.id,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function successChance(target: number): number {
  return Math.max(0, Math.min(1, (7 - target) / 6));
}

function posKey(p: Position) { return key(p); }

/** Recompute the full reachable set from `fromPos` with `ma` remaining. */
function recomputeReachable(
  state: GameState,
  pieceId: string,
  fromPos: Position,
  ma: number,
): Pick<GameState, 'reachableKeys'> {
  const piece = state.pieces.find(p => p.id === pieceId)!;
  const opponents = state.pieces.filter(p => p.team !== piece.team).map(p => p.position);
  const others    = state.pieces.filter(p => p.id !== pieceId).map(p => p.position);
  const { reachableKeys } = computeReachable(fromPos, ma, others, opponents);
  return { reachableKeys };
}

function clearSelection(state: GameState): GameState {
  return {
    ...state,
    selectedPieceId: null,
    reachableKeys: new Set(),
    originPos: null,
    committedPath: [],
    pathPreview: [],
    remainingMa: 0,
    pendingDodgeTargets: [],
    pendingProb: 1,
    isTouchdownAttempt: false,
  };
}

/** Move piece to the last square in committedPath. */
function commitMove(state: GameState): GameState['pieces'] {
  if (!state.selectedPieceId || state.committedPath.length === 0) return state.pieces;
  const dest = state.committedPath[state.committedPath.length - 1];
  return state.pieces.map(p =>
    p.id === state.selectedPieceId ? { ...p, position: dest, activated: true } : p
  );
}

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
  next.reachableKeys = new Set();
  next.originPos = null;
  next.committedPath = [];
  next.pathPreview = [];
  next.remainingMa = 0;
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

  /**
   * Called on mouse hover over a square.
   * If a piece is selected, compute the shortest path from the current path tip
   * to the hovered square and store it as pathPreview.
   */
  const handleSquareHover = useCallback((col: number, row: number) => {
    setState(prev => {
      if (prev.phase !== 'playing' || !prev.selectedPieceId) return prev;

      const hovered: Position = { col, row };
      const hoveredKey = posKey(hovered);

      // Only preview if the square is reachable
      if (!prev.reachableKeys.has(hoveredKey)) {
        return { ...prev, pathPreview: [] };
      }

      // Path tip = last committed square, or origin
      const tip = prev.committedPath.length > 0
        ? prev.committedPath[prev.committedPath.length - 1]
        : prev.originPos!;

      const piece = prev.pieces.find(p => p.id === prev.selectedPieceId)!;
      const opponents = prev.pieces.filter(p => p.team !== piece.team).map(p => p.position);
      const others    = prev.pieces.filter(p => p.id !== piece.id).map(p => p.position);

      const path = findShortestPath(tip, hovered, prev.remainingMa, others, opponents);
      return { ...prev, pathPreview: path ?? [] };
    });
  }, []);

  const handleSquareLeave = useCallback(() => {
    setState(prev => ({ ...prev, pathPreview: [] }));
  }, []);

  /**
   * Called on click.
   * - If a piece is selected and the clicked square is reachable:
   *   commit the preview path, deduct MA, recompute reachable from new tip.
   * - If clicking own unactivated piece: select it.
   * - If clicking selected piece: cancel.
   * - Otherwise: deselect.
   */
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

      // Commit move to a reachable square
      if (prev.selectedPieceId && prev.reachableKeys.has(clickedKey)) {
        const tip = prev.committedPath.length > 0
          ? prev.committedPath[prev.committedPath.length - 1]
          : prev.originPos!;

        const piece = prev.pieces.find(p => p.id === prev.selectedPieceId)!;
        const opponents = prev.pieces.filter(p => p.team !== piece.team).map(p => p.position);
        const others    = prev.pieces.filter(p => p.id !== piece.id).map(p => p.position);

        const path = findShortestPath(tip, clickedPos, prev.remainingMa, others, opponents);
        if (!path || path.length === 0) return prev;

        // Deduct MA = number of steps in path
        const cost = path.length;
        const newRemainingMa = prev.remainingMa - cost;

        // Collect dodge targets from this path segment
        const newDodgeTargets = [
          ...prev.pendingDodgeTargets,
          ...path.filter(s => s.requiresDodge).map(() => piece.ag),
        ];
        const newPendingProb = path
          .filter(s => s.requiresDodge)
          .reduce((acc) => acc * successChance(piece.ag), prev.pendingProb);

        const newCommittedPath = [...prev.committedPath, clickedPos];

        if (newRemainingMa <= 0) {
          // MA exhausted — lock in, no more moves
          return {
            ...prev,
            committedPath: newCommittedPath,
            remainingMa: 0,
            reachableKeys: new Set(),
            pathPreview: [],
            pendingDodgeTargets: newDodgeTargets,
            pendingProb: newPendingProb,
          };
        }

        // Recompute reachable from new tip
        const { reachableKeys } = recomputeReachable(prev, prev.selectedPieceId, clickedPos, newRemainingMa);

        return {
          ...prev,
          committedPath: newCommittedPath,
          remainingMa: newRemainingMa,
          reachableKeys,
          pathPreview: [],
          pendingDodgeTargets: newDodgeTargets,
          pendingProb: newPendingProb,
        };
      }

      // Select own unactivated piece
      if (
        pieceOnSquare &&
        pieceOnSquare.team === prev.activeTeam &&
        !pieceOnSquare.activated
      ) {
        const { reachableKeys } = recomputeReachable(prev, pieceOnSquare.id, pieceOnSquare.position, pieceOnSquare.ma);
        return {
          ...prev,
          selectedPieceId: pieceOnSquare.id,
          originPos: pieceOnSquare.position,
          committedPath: [],
          pathPreview: [],
          remainingMa: pieceOnSquare.ma,
          pendingDodgeTargets: [],
          pendingProb: 1,
          reachableKeys,
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

      // Touchdown check (puzzle mode)
      if (prev.isPuzzleMode && prev.selectedPieceId && prev.committedPath.length > 0) {
        const movingPiece = prev.pieces.find(p => p.id === prev.selectedPieceId)!;
        const dest = prev.committedPath[prev.committedPath.length - 1];
        if (movingPiece.hasBall && isTouchdownSquare(dest, movingPiece.team)) {
          const pieces = commitMove(prev);
          if (prev.pendingDodgeTargets.length > 0) {
            return {
              ...prev, pieces, phase: 'dodge_roll', lastDiceResult: null,
              isTouchdownAttempt: true,
              pendingDodge: { pieceId: prev.selectedPieceId, destination: dest, target: prev.pendingDodgeTargets[0] },
            };
          }
          return clearSelection({ ...prev, pieces, phase: 'touchdown' });
        }
      }

      // Resolve pending dodges before ending turn
      if (prev.pendingDodgeTargets.length > 0 && prev.committedPath.length > 0) {
        const pieces = commitMove(prev);
        return {
          ...prev, pieces, phase: 'dodge_roll', lastDiceResult: null,
          pendingDodge: {
            pieceId: prev.selectedPieceId ?? '',
            destination: prev.committedPath[prev.committedPath.length - 1],
            target: prev.pendingDodgeTargets[0],
          },
        };
      }

      const pieces = prev.committedPath.length > 0 ? commitMove(prev) : prev.pieces;
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
        const pieces = prev.pieces.map(p =>
          p.id === pieceId && prev.originPos ? { ...p, position: prev.originPos, activated: false } : p
        );
        const failed = clearSelection({ ...prev, pieces, phase: 'playing', pendingDodge: null, diceLog: newLog });
        return prev.isTouchdownAttempt ? { ...failed, phase: 'touchdown_fail' } : advanceTurn(failed);
      }

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

      const base = { ...prev, phase: 'playing' as const, pendingDodge: null, pendingDodgeTargets: [], lastDiceResult: null, diceLog: newLog, pendingProb: 1 };
      if (prev.isTouchdownAttempt) return clearSelection({ ...base, phase: 'touchdown', isTouchdownAttempt: false });
      return advanceTurn(clearSelection(base));
    });
  }, []);

  const handleContinue = useCallback(() => {
    setState(prev => {
      if (prev.phase === 'half_over') return { ...makeFreePlayState(), half: 2 as const, score: prev.score, activeTeam: 'orc' as const };
      if (prev.phase === 'game_over') return makeFreePlayState();
      return prev;
    });
  }, []);

  return { state, setState, handleSquareClick, handleSquareHover, handleSquareLeave, handleCancelSelection, handleRollDodge, handleDismissDodge, handleEndTurn, handleContinue };
}
