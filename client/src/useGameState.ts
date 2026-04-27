import { useState, useCallback } from 'react';
import type { GameState, PlayerPiece, Position, ActionLogEntry, Scenario } from './types';
import { computeReachable, findShortestPath, key } from './bfs';

const TURNS_PER_HALF = 8;
const COLS = 26;

const FREE_PLAY_PIECES: PlayerPiece[] = [
  // Human ball carrier: col 19, row 7 — exactly MA6 from the right end zone (col 25)
  { id: 'human', team: 'human', name: 'Aldric Swiftfoot', position: { col: 19, row: 7 }, ma: 6, st: 3, ag: 3, av: 8, skills: ['Block'], activated: false, hasBall: true },
  // Two orcs side by side with one square gap between them, blocking the direct path
  { id: 'orc1',  team: 'orc',   name: 'Grukk Ironjaw',   position: { col: 21, row: 6 }, ma: 4, st: 3, ag: 3, av: 9, skills: ['Animosity'], activated: false, hasBall: false },
  { id: 'orc2',  team: 'orc',   name: 'Muzgash Skullkrak', position: { col: 21, row: 8 }, ma: 4, st: 3, ag: 3, av: 9, skills: ['Animosity'], activated: false, hasBall: false },
];

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
    pendingDodgeTargets: [],
    humanTurn: 1,
    orcTurn: 1,
    half: 1,
    score: { human: 0, orc: 0 },
    phase: 'playing',
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
    walkedSquares: [],
    pathPreview: [],
    remainingMa: 0,
    pendingDodgeTargets: [],
    pendingProb: 1,
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
  next.walkedSquares = [];
  next.pathPreview = [];
  next.remainingMa = 0;
  next.pendingDodgeTargets = [];
  next.pendingProb = 1;
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

      const path = findShortestPath(tip, hovered, prev.remainingMa, others, opponents, piece.ag);
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
        const pieces = dest
          ? prev.pieces.map(p => p.id === prev.selectedPieceId ? { ...p, position: dest, activated: true } : p)
          : prev.pieces.map(p => p.id === prev.selectedPieceId ? { ...p, activated: true } : p);
        return clearSelection({ ...prev, pieces });
      }

      // Commit move to a reachable square
      if (prev.selectedPieceId && prev.reachableKeys.has(clickedKey)) {
        const tip = prev.committedPath.length > 0
          ? prev.committedPath[prev.committedPath.length - 1]
          : prev.originPos!;

        const piece = prev.pieces.find(p => p.id === prev.selectedPieceId)!;
        const opponents = prev.pieces.filter(p => p.team !== piece.team).map(p => p.position);
        const others    = prev.pieces.filter(p => p.id !== piece.id).map(p => p.position);

        const path = findShortestPath(tip, clickedPos, prev.remainingMa, others, opponents, piece.ag);
        if (!path || path.length === 0) return prev;

        // Deduct MA = number of steps in path
        const cost = path.length;
        const newRemainingMa = prev.remainingMa - cost;

        // Collect per-step dodge targets (proper BB2020 targets from bfs)
        const dodgeSteps = path.filter(s => s.requiresDodge && s.dodgeTarget !== null);
        const newDodgeTargets = [
          ...prev.pendingDodgeTargets,
          ...dodgeSteps.map(s => s.dodgeTarget!),
        ];
        // Probability of this path segment alone
        const segmentProb = dodgeSteps
          .reduce((acc, s) => acc * successChance(s.dodgeTarget!), 1);
        const newPendingProb = prev.pendingProb * segmentProb;

        const firstDodgeTarget = dodgeSteps.length > 0 ? dodgeSteps[0].dodgeTarget! : null;
        const prevCumProb = prev.actionLog.length > 0
          ? prev.actionLog[prev.actionLog.length - 1].cumulativeProb : 1;
        const moveEntry: ActionLogEntry = {
          kind: 'move',
          pieceName: piece.name,
          from: tip,
          to: clickedPos,
          steps: cost,
          dodgeTarget: firstDodgeTarget,
          actionProb: segmentProb,
          cumulativeProb: prevCumProb * segmentProb,
        };

        const newCommittedPath = [...prev.committedPath, clickedPos];
        const newWalkedSquares = [...prev.walkedSquares, ...path.map(s => s.pos)];
        const newActionLog = [...prev.actionLog, moveEntry];

        // Touchdown: ball carrier reached the end zone — commit and end immediately
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

        if (newRemainingMa <= 0) {
          return {
            ...prev,
            committedPath: newCommittedPath,
            walkedSquares: newWalkedSquares,
            remainingMa: 0,
            reachableKeys: new Set(),
            pathPreview: [],
            pendingDodgeTargets: newDodgeTargets,
            pendingProb: newPendingProb,
            actionLog: newActionLog,
          };
        }

        const { reachableKeys } = recomputeReachable(prev, prev.selectedPieceId, clickedPos, newRemainingMa);

        return {
          ...prev,
          committedPath: newCommittedPath,
          walkedSquares: newWalkedSquares,
          remainingMa: newRemainingMa,
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
