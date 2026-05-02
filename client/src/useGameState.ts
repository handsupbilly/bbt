import { useState, useCallback } from 'react';
import type { GameState, PlayerPiece, Position, ActionLogEntry, Scenario } from './types';
import { computeReachable, findShortestPath, key } from './bfs';

const TURNS_PER_HALF = 8;
const ROWS = 26;

const FREE_PLAY_PIECES: PlayerPiece[] = [
  // Human ball carrier: row 6, col 7 — exactly MA6 from the top end zone (row 0)
  { id: 'human', team: 'human', role: 'thrower', name: 'Aldric Swiftfoot', position: { col: 7, row: 6 }, ma: 6, st: 3, ag: 3, av: 8, skills: ['Block'], activated: false, hasBall: true },
  { id: 'orc1',  team: 'orc',   role: 'blocker', name: 'Grukk Ironjaw',     position: { col: 6, row: 4 }, ma: 4, st: 3, ag: 3, av: 9, skills: ['Animosity'], activated: false, hasBall: false },
  { id: 'orc2',  team: 'orc',   role: 'blocker', name: 'Muzgash Skullkrak', position: { col: 8, row: 4 }, ma: 4, st: 3, ag: 3, av: 9, skills: ['Animosity'], activated: false, hasBall: false },
];

const MAX_GFI = 2;

function makeBlankState(overrides: Partial<GameState> = {}): GameState {
  return {
    pieces: [],
    activeTeam: 'human',
    selectedPieceId: null,
    reachableKeys: new Set(),
    originPos: null,
    committedPath: [],
    walkedSquares: [],
    pathPreview: [],
    remainingMa: 0,
    remainingGfi: 0,
    pendingDodgeTargets: [],
    humanTurn: 1,
    orcTurn: 1,
    half: 1,
    score: { human: 0, orc: 0 },
    phase: 'playing',
    activationLogStart: 0,
    pendingProb: 1,
    actionLog: [],
    isPuzzleMode: false,
    scenarioId: null,
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

/** Recompute the full reachable set from `fromPos` with `ma` and `gfi` remaining. */
function recomputeReachable(
  state: GameState,
  pieceId: string,
  fromPos: Position,
  ma: number,
  gfi: number = 0,
): Pick<GameState, 'reachableKeys'> {
  const piece = state.pieces.find(p => p.id === pieceId)!;
  const opponents = state.pieces.filter(p => p.team !== piece.team).map(p => p.position);
  const others    = state.pieces.filter(p => p.id !== pieceId).map(p => p.position);
  const { reachableKeys } = computeReachable(fromPos, ma, others, opponents, gfi);
  return { reachableKeys };
}

function clearSelection(state: GameState, cancelActivation = false): GameState {
  return {
    ...state,
    selectedPieceId: null,
    reachableKeys: new Set(),
    originPos: null,
    committedPath: [],
    walkedSquares: [],
    pathPreview: [],
    remainingMa: 0,
    remainingGfi: 0,
    pendingDodgeTargets: [],
    pendingProb: 1,
    activationLogStart: 0,
    actionLog: cancelActivation
      ? state.actionLog.slice(0, state.activationLogStart)
      : state.actionLog,
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
  return team === 'human' ? pos.row === 0 : pos.row === ROWS - 1;
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
  next.walkedSquares = [];
  next.pathPreview = [];
  next.remainingMa = 0;
  next.remainingGfi = 0;
  next.pendingDodgeTargets = [];
  next.pendingProb = 1;
  next.activationLogStart = 0;
  next.actionLog = [];
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

      const path = findShortestPath(tip, hovered, prev.remainingMa, others, opponents, piece.ag, prev.remainingGfi);
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

      // End activation: clicked the selected piece, or double-clicked the current path tip
      const pathTip = prev.selectedPieceId
        ? (prev.committedPath.length > 0
            ? prev.committedPath[prev.committedPath.length - 1]
            : prev.originPos)
        : null;
      const clickedTip = pathTip && posKey(pathTip) === clickedKey;

      if (prev.selectedPieceId && (pieceOnSquare?.id === prev.selectedPieceId || clickedTip)) {
        const dest = prev.committedPath.length > 0
          ? prev.committedPath[prev.committedPath.length - 1]
          : null;
        // If no moves were made, cancel (roll back log); otherwise commit
        const hasMoved = prev.committedPath.length > 0;
        const pieces = dest
          ? prev.pieces.map(p => p.id === prev.selectedPieceId ? { ...p, position: dest, activated: true } : p)
          : prev.pieces.map(p => p.id === prev.selectedPieceId ? { ...p, activated: true } : p);
        return clearSelection({ ...prev, pieces }, !hasMoved);
      }

      // Commit move to a reachable square
      if (prev.selectedPieceId && prev.reachableKeys.has(clickedKey)) {
        const tip = prev.committedPath.length > 0
          ? prev.committedPath[prev.committedPath.length - 1]
          : prev.originPos!;

        const piece = prev.pieces.find(p => p.id === prev.selectedPieceId)!;
        const opponents = prev.pieces.filter(p => p.team !== piece.team).map(p => p.position);
        const others    = prev.pieces.filter(p => p.id !== piece.id).map(p => p.position);

        const path = findShortestPath(tip, clickedPos, prev.remainingMa, others, opponents, piece.ag, prev.remainingGfi);
        if (!path || path.length === 0) return prev;

        // Deduct MA and GFI separately
        let newRemainingMa = prev.remainingMa;
        let newRemainingGfi = prev.remainingGfi;
        for (const step of path) {
          if (step.isGfi) {
            newRemainingGfi = Math.max(0, newRemainingGfi - 1);
          } else {
            newRemainingMa = Math.max(0, newRemainingMa - 1);
          }
        }

        const newCommittedPath = [...prev.committedPath, clickedPos];
        const newWalkedSquares = [...prev.walkedSquares, ...path.map(s => s.pos)];

        let runningCumProb = prev.actionLog.length > 0
          ? prev.actionLog[prev.actionLog.length - 1].cumulativeProb : 1;
        let runningPendingProb = prev.pendingProb;
        const newDodgeTargets = [...prev.pendingDodgeTargets];
        const perStepEntries: ActionLogEntry[] = [];

        let fromPos = tip;
        for (const step of path) {
          // GFI = 2+ (5/6 success). Dodge and GFI can stack — multiply probabilities.
          const gfiProb  = step.isGfi ? successChance(2) : 1;
          const dodgeProb = step.dodgeTarget !== null ? successChance(step.dodgeTarget) : 1;
          const stepProb = gfiProb * dodgeProb;
          runningCumProb = runningCumProb * stepProb;

          if (step.isGfi || step.dodgeTarget !== null) {
            runningPendingProb = runningPendingProb * stepProb;
            if (step.dodgeTarget !== null) newDodgeTargets.push(step.dodgeTarget);
          }

          perStepEntries.push({
            kind: 'move',
            pieceName: piece.name,
            from: fromPos,
            to: step.pos,
            steps: 1,
            dodgeTarget: step.dodgeTarget,
            isGfi: step.isGfi,
            actionProb: stepProb,
            cumulativeProb: runningCumProb,
          });
          fromPos = step.pos;
        }

        const newPendingProb = runningPendingProb;
        const newActionLog = [...prev.actionLog, ...perStepEntries];

        // Touchdown: ball carrier reached the end zone
        if (piece.hasBall && isTouchdownSquare(clickedPos, piece.team)) {
          const pieces = prev.pieces.map(p =>
            p.id === piece.id ? { ...p, position: clickedPos, activated: true } : p
          );
          return clearSelection({
            ...prev,
            pieces,
            committedPath: newCommittedPath,
            walkedSquares: newWalkedSquares,
            pendingDodgeTargets: newDodgeTargets,
            pendingProb: newPendingProb,
            actionLog: newActionLog,
            phase: 'touchdown',
          });
        }

        // No MA or GFI left — freeze reachable
        if (newRemainingMa <= 0 && newRemainingGfi <= 0) {
          return {
            ...prev,
            committedPath: newCommittedPath,
            walkedSquares: newWalkedSquares,
            remainingMa: 0,
            remainingGfi: 0,
            reachableKeys: new Set(),
            pathPreview: [],
            pendingDodgeTargets: newDodgeTargets,
            pendingProb: newPendingProb,
            actionLog: newActionLog,
          };
        }

        const { reachableKeys } = recomputeReachable(prev, prev.selectedPieceId, clickedPos, newRemainingMa, newRemainingGfi);

        return {
          ...prev,
          committedPath: newCommittedPath,
          walkedSquares: newWalkedSquares,
          remainingMa: newRemainingMa,
          remainingGfi: newRemainingGfi,
          reachableKeys,
          pathPreview: [],
          pendingDodgeTargets: newDodgeTargets,
          pendingProb: newPendingProb,
          actionLog: newActionLog,
        };
      }

      // Select own unactivated piece
      if (
        pieceOnSquare &&
        pieceOnSquare.team === prev.activeTeam &&
        !pieceOnSquare.activated
      ) {
        const { reachableKeys } = recomputeReachable(prev, pieceOnSquare.id, pieceOnSquare.position, pieceOnSquare.ma, MAX_GFI);
        return {
          ...prev,
          selectedPieceId: pieceOnSquare.id,
          originPos: pieceOnSquare.position,
          committedPath: [],
          walkedSquares: [],
          pathPreview: [],
          remainingMa: pieceOnSquare.ma,
          remainingGfi: MAX_GFI,
          pendingDodgeTargets: [],
          pendingProb: 1,
          reachableKeys,
          activationLogStart: prev.actionLog.length,
        };
      }

      // Deselect (cancel)
      if (prev.selectedPieceId) return clearSelection(prev, true);
      return prev;
    });
  }, []);

  const handleCancelSelection = useCallback(() => {
    setState(prev => prev.selectedPieceId ? clearSelection(prev, true) : prev);
  }, []);

  const handleEndTurn = useCallback(() => {
    setState(prev => {
      if (prev.phase !== 'playing') return prev;

      const pieces = prev.committedPath.length > 0 ? commitMove(prev) : prev.pieces;

      // Check if the ball carrier just reached the end zone
      const ballCarrier = pieces.find(p => p.hasBall && p.team === prev.activeTeam);
      if (ballCarrier && isTouchdownSquare(ballCarrier.position, ballCarrier.team)) {
        return clearSelection({ ...prev, pieces, phase: 'touchdown' });
      }

      return advanceTurn({ ...prev, pieces });
    });
  }, []);

  const handleContinue = useCallback(() => {
    setState(prev => {
      if (prev.phase === 'half_over') return { ...makeFreePlayState(), half: 2 as const, score: prev.score, activeTeam: 'orc' as const };
      if (prev.phase === 'game_over') return makeFreePlayState();
      return prev;
    });
  }, []);

  return { state, setState, handleSquareClick, handleSquareHover, handleSquareLeave, handleCancelSelection, handleEndTurn, handleContinue };
}
