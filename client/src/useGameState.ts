import { useState, useCallback } from 'react';
import type { GameState, PlayerPiece, Position, DiceResult, DiceLogEntry } from './types';
import { computeReachable, key, neighbours } from './bfs';

const TURNS_PER_HALF = 8;

const INITIAL_PIECES: PlayerPiece[] = [
  {
    id: 'human', team: 'human', name: 'Lineman',
    position: { col: 6, row: 7 },
    ma: 6, st: 3, ag: 3, av: 8,
    skills: ['Block'],
    activated: false,
  },
  {
    id: 'orc', team: 'orc', name: 'Orc Lineman',
    position: { col: 19, row: 7 },
    ma: 4, st: 3, ag: 3, av: 9,
    skills: ['Animosity'],
    activated: false,
  },
];

function makeInitialState(): GameState {
  return {
    pieces: INITIAL_PIECES.map(p => ({ ...p })),
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
  };
}

function posKey(p: Position) { return key(p); }

/** Minimum squares traversed between two positions (Chebyshev / 8-directional distance). */
function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
}

function successChance(target: number): number {
  return Math.max(0, Math.min(1, (7 - target) / 6));
}

/**
 * Compute reachable squares from `fromPos` with `ma` steps remaining.
 * The piece's actual position in state is still at origin — we pass `fromPos`
 * (the tip of the planned path) as the BFS origin.
 */
function computeHighlights(
  state: GameState,
  pieceId: string,
  fromPos: Position,
  remainingMa: number,
): Pick<GameState, 'reachableSquares' | 'dodgeSquares'> {
  const piece = state.pieces.find(p => p.id === pieceId)!;
  const opponents = state.pieces.filter(p => p.team !== piece.team).map(p => p.position);
  // Treat all other pieces as blockers (piece itself is at origin, not fromPos, so exclude by id)
  const others = state.pieces.filter(p => p.id !== pieceId).map(p => p.position);
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
  };
}

/** Commit the planned path: move piece to destination, return updated pieces array. */
function commitMove(state: GameState): GameState['pieces'] {
  if (!state.selectedPieceId || state.plannedPath.length === 0) return state.pieces;
  const dest = state.plannedPath[state.plannedPath.length - 1];
  return state.pieces.map(p =>
    p.id === state.selectedPieceId
      ? { ...p, position: dest, activated: true }
      : p
  );
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
  if (next.humanTurn > TURNS_PER_HALF && next.orcTurn > TURNS_PER_HALF) {
    next.phase = next.half === 1 ? 'half_over' : 'game_over';
  }
  return next;
}

/** Is `pos` in the tackle zone of any opponent? */
function inTackleZone(pos: Position, opponentPositions: Position[]): boolean {
  const k = posKey(pos);
  return opponentPositions.some(op =>
    neighbours(op).some(n => posKey(n) === k)
  );
}

export function useGameState() {
  const [state, setState] = useState<GameState>(makeInitialState);

  const handleSquareClick = useCallback((col: number, row: number) => {
    setState(prev => {
      if (prev.phase !== 'playing') return prev;

      const clickedPos: Position = { col, row };
      const clickedKey = posKey(clickedPos);
      const pieceOnSquare = prev.pieces.find(p => posKey(p.position) === clickedKey);

      // ── Cancel: clicked the selected piece (still at origin) ──
      if (prev.selectedPieceId && pieceOnSquare?.id === prev.selectedPieceId) {
        return clearSelection(prev); // piece never moved, nothing to undo
      }

      // ── Free step: add to planned path ──
      const isFree = prev.reachableSquares.some(p => posKey(p) === clickedKey);
      if (isFree && prev.selectedPieceId) {
        const pathTip = prev.plannedPath.length > 0
          ? prev.plannedPath[prev.plannedPath.length - 1]
          : prev.originPos!;
        const cost = chebyshev(pathTip, clickedPos);
        const newRemainingMa = prev.remainingMa - cost;
        const newPath = [...prev.plannedPath, clickedPos];

        if (newRemainingMa <= 0) {
          // MA exhausted — commit move immediately (no dodges pending from free squares)
          const pieces = prev.pieces.map(p =>
            p.id === prev.selectedPieceId
              ? { ...p, position: clickedPos, activated: true }
              : p
          );
          return clearSelection({ ...prev, pieces });
        }

        const highlights = computeHighlights(prev, prev.selectedPieceId, clickedPos, newRemainingMa);
        return {
          ...prev,
          plannedPath: newPath,
          remainingMa: newRemainingMa,
          pendingDodgeStep: null,
          ...highlights,
        };
      }

      // ── Dodge zone: first or second click ──
      const isDodge = prev.dodgeSquares.some(p => posKey(p) === clickedKey);
      if (isDodge && prev.selectedPieceId) {
        const movingPiece = prev.pieces.find(p => p.id === prev.selectedPieceId)!;
        const target = movingPiece.ag;

        const isPendingThisSquare =
          prev.pendingDodgeStep && posKey(prev.pendingDodgeStep) === clickedKey;

        if (isPendingThisSquare) {
          // Second click — confirm this dodge step
          const pathTip = prev.plannedPath.length > 0
            ? prev.plannedPath[prev.plannedPath.length - 1]
            : prev.originPos!;
          const cost = chebyshev(pathTip, clickedPos);
          const newRemainingMa = prev.remainingMa - cost;
          const newPath = [...prev.plannedPath, clickedPos];
          const newTargets = [...prev.pendingDodgeTargets, target];
          const newPendingProb = prev.pendingProb * successChance(target);

          if (newRemainingMa <= 0) {
            // MA exhausted — trigger dodge rolls now
            const pieces = commitMove({ ...prev, plannedPath: newPath });
            return {
              ...prev,
              pieces,
              plannedPath: newPath,
              remainingMa: newRemainingMa,
              pendingDodgeStep: null,
              pendingDodgeTargets: newTargets,
              pendingProb: newPendingProb,
              reachableSquares: [],
              dodgeSquares: [],
              phase: 'dodge_roll',
              lastDiceResult: null,
              pendingDodge: {
                pieceId: prev.selectedPieceId,
                destination: clickedPos,
                target: newTargets[0],
              },
            };
          }

          const highlights = computeHighlights(prev, prev.selectedPieceId, clickedPos, newRemainingMa);
          return {
            ...prev,
            plannedPath: newPath,
            remainingMa: newRemainingMa,
            pendingDodgeStep: null,
            pendingDodgeTargets: newTargets,
            pendingProb: newPendingProb,
            ...highlights,
          };
        } else {
          // First click — mark as pending
          return { ...prev, pendingDodgeStep: clickedPos };
        }
      }

      // ── Select: clicked own unactivated piece ──
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

      // ── Deselect: anything else ──
      if (prev.selectedPieceId) {
        return clearSelection(prev); // piece never moved
      }

      return prev;
    });
  }, []);

  const handleCancelSelection = useCallback(() => {
    setState(prev => {
      if (!prev.selectedPieceId) return prev;
      return clearSelection(prev); // piece never moved during planning
    });
  }, []);

  // ── End Turn: commit planned path then resolve dodges ────────────────────
  const handleEndTurn = useCallback(() => {
    setState(prev => {
      if (prev.phase !== 'playing') return prev;

      if (prev.pendingDodgeTargets.length > 0 && prev.plannedPath.length > 0) {
        // Commit the move visually, then roll dodges
        const pieces = commitMove(prev);
        return {
          ...prev,
          pieces,
          phase: 'dodge_roll',
          lastDiceResult: null,
          pendingDodge: {
            pieceId: prev.selectedPieceId ?? '',
            destination: prev.plannedPath[prev.plannedPath.length - 1],
            target: prev.pendingDodgeTargets[0],
          },
        };
      }

      // No dodges — commit move and advance turn
      const pieces = prev.plannedPath.length > 0 ? commitMove(prev) : prev.pieces;
      return advanceTurn({ ...prev, pieces });
    });
  }, []);

  const handleRollDodge = useCallback(() => {
    setState(prev => {
      if (prev.phase !== 'dodge_roll' || !prev.pendingDodge) return prev;
      const roll = Math.ceil(Math.random() * 6);
      const { target } = prev.pendingDodge;
      const result: DiceResult = { roll, success: roll >= target, target };
      return { ...prev, lastDiceResult: result };
    });
  }, []);

  const handleDismissDodge = useCallback(() => {
    setState(prev => {
      if (!prev.lastDiceResult || !prev.pendingDodge) return prev;
      const { success, roll, target } = prev.lastDiceResult;
      const { pieceId } = prev.pendingDodge;

      const entry: DiceLogEntry = {
        target,
        roll,
        success,
        cumulativeProb: prev.diceLog.reduce(
          (acc, e) => acc * successChance(e.target),
          successChance(target)
        ),
      };
      const newLog = [...prev.diceLog, entry];

      if (!success) {
        // Failed — snap piece back to origin
        const pieces = prev.pieces.map(p =>
          p.id === pieceId && prev.originPos
            ? { ...p, position: prev.originPos, activated: false }
            : p
        );
        return advanceTurn(clearSelection({
          ...prev,
          pieces,
          phase: 'playing',
          pendingDodge: null,
          diceLog: newLog,
        }));
      }

      // Success — pop next queued target
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

      // All dodges passed — end turn
      const base = {
        ...prev,
        phase: 'playing' as const,
        pendingDodge: null,
        pendingDodgeTargets: [],
        lastDiceResult: null,
        diceLog: newLog,
        pendingProb: 1,
      };
      return advanceTurn(clearSelection(base));
    });
  }, []);

  const handleContinue = useCallback(() => {
    setState(prev => {
      if (prev.phase === 'half_over') {
        return { ...makeInitialState(), half: 2, score: prev.score, activeTeam: 'orc' };
      }
      if (prev.phase === 'game_over') return makeInitialState();
      return prev;
    });
  }, []);

  return {
    state,
    handleSquareClick,
    handleCancelSelection,
    handleRollDodge,
    handleDismissDodge,
    handleEndTurn,
    handleContinue,
  };
}
