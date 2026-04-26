import type { Position } from './types';

const COLS = 26;
const ROWS = 15;

const DIRS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],          [1,  0],
  [-1,  1], [0,  1], [1,  1],
];

export function key(p: Position): string {
  return `${p.col},${p.row}`;
}

export function fromKey(k: string): Position {
  const [col, row] = k.split(',').map(Number);
  return { col, row };
}

export function neighbours(pos: Position): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of DIRS) {
    const c = pos.col + dc;
    const r = pos.row + dr;
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
      result.push({ col: c, row: r });
    }
  }
  return result;
}

export function tacklezoneKeys(opponentPositions: Position[]): Set<string> {
  const tz = new Set<string>();
  for (const op of opponentPositions) {
    for (const n of neighbours(op)) {
      tz.add(key(n));
    }
  }
  return tz;
}

// ── Reachable flood-fill (for highlighting all reachable squares) ─────────────

export interface ReachResult {
  free: Position[];
  dodge: Position[];
  // All reachable keys (free + dodge) for quick lookup
  reachableKeys: Set<string>;
}

export function computeReachable(
  origin: Position,
  ma: number,
  allPiecePositions: Position[],
  opponentPositions: Position[],
): ReachResult {
  const blockedKeys = new Set(allPiecePositions.map(key));
  const tzKeys = tacklezoneKeys(opponentPositions);
  const originKey = key(origin);

  const cleanDist = new Map<string, number>();
  const dodgeDist = new Map<string, number>();

  type Node = { pos: Position; steps: number; dodged: boolean };
  const queue: Node[] = [{ pos: origin, steps: 0, dodged: false }];
  cleanDist.set(originKey, 0);

  while (queue.length > 0) {
    const { pos, steps, dodged } = queue.shift()!;
    if (steps >= ma) continue;

    const leavingTZ = tzKeys.has(key(pos));

    for (const next of neighbours(pos)) {
      const nk = key(next);
      if (blockedKeys.has(nk)) continue;

      const needsDodge = dodged || leavingTZ;

      if (!needsDodge) {
        if (cleanDist.has(nk)) continue;
        cleanDist.set(nk, steps + 1);
        queue.push({ pos: next, steps: steps + 1, dodged: false });
      } else {
        if (cleanDist.has(nk) || dodgeDist.has(nk)) continue;
        dodgeDist.set(nk, steps + 1);
        queue.push({ pos: next, steps: steps + 1, dodged: true });
      }
    }
  }

  const free: Position[] = [];
  const dodge: Position[] = [];
  const reachableKeys = new Set<string>();

  for (const [k] of cleanDist) {
    if (k !== originKey) { free.push(fromKey(k)); reachableKeys.add(k); }
  }
  for (const [k] of dodgeDist) {
    dodge.push(fromKey(k)); reachableKeys.add(k);
  }

  return { free, dodge, reachableKeys };
}

// ── Shortest path finder (for hover preview, FFB-style) ───────────────────────

export interface PathStep {
  pos: Position;
  /** True if leaving the *previous* square required a dodge */
  requiresDodge: boolean;
}

/**
 * Find the shortest path (Chebyshev distance) from `origin` to `target`
 * within `ma` steps, avoiding blocked squares.
 *
 * Returns the sequence of squares from origin (exclusive) to target (inclusive),
 * each annotated with whether a dodge is required to enter it.
 *
 * Returns null if target is unreachable within ma.
 */
export function findShortestPath(
  origin: Position,
  target: Position,
  ma: number,
  allPiecePositions: Position[],
  opponentPositions: Position[],
): PathStep[] | null {
  const blockedKeys = new Set(allPiecePositions.map(key));
  const tzKeys = tacklezoneKeys(opponentPositions);
  const targetKey = key(target);
  const originKey = key(origin);

  if (blockedKeys.has(targetKey)) return null;

  // Dijkstra: state = (pos, steps, dodged)
  // We want minimum steps to reach target
  type State = { pos: Position; steps: number; dodged: boolean; path: PathStep[] };

  // visited: key -> minimum steps reached (clean preferred over dodge)
  const visited = new Map<string, number>();

  // Priority queue (min-heap by steps) — simple array sort for small grids
  const queue: State[] = [{ pos: origin, steps: 0, dodged: false, path: [] }];
  visited.set(originKey, 0);

  while (queue.length > 0) {
    // Pop lowest-cost state
    queue.sort((a, b) => a.steps - b.steps);
    const { pos, steps, dodged, path } = queue.shift()!;

    if (key(pos) === targetKey) {
      return path;
    }

    if (steps >= ma) continue;

    const leavingTZ = tzKeys.has(key(pos));

    for (const next of neighbours(pos)) {
      const nk = key(next);
      if (blockedKeys.has(nk)) continue;

      const newSteps = steps + 1;
      if (newSteps > ma) continue;

      const needsDodge = dodged || leavingTZ;
      const stateKey = `${nk}:${needsDodge ? 1 : 0}`;

      if (visited.has(stateKey) && visited.get(stateKey)! <= newSteps) continue;
      visited.set(stateKey, newSteps);

      const step: PathStep = { pos: next, requiresDodge: needsDodge };
      queue.push({ pos: next, steps: newSteps, dodged: needsDodge, path: [...path, step] });
    }
  }

  return null; // unreachable
}
