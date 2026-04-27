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

  type Node = { pos: Position; steps: number };
  const queue: Node[] = [{ pos: origin, steps: 0 }];
  cleanDist.set(originKey, 0);

  while (queue.length > 0) {
    const { pos, steps } = queue.shift()!;
    if (steps >= ma) continue;

    const leavingTZ = tzKeys.has(key(pos));

    for (const next of neighbours(pos)) {
      const nk = key(next);
      if (blockedKeys.has(nk)) continue;

      // Dodge required only for the step that leaves a tackle zone square.
      // Once clear, subsequent steps are free (unless they also leave a TZ).
      const needsDodge = leavingTZ;

      if (!needsDodge) {
        if (cleanDist.has(nk)) continue;
        cleanDist.set(nk, steps + 1);
        queue.push({ pos: next, steps: steps + 1 });
      } else {
        if (cleanDist.has(nk) || dodgeDist.has(nk)) continue;
        dodgeDist.set(nk, steps + 1);
        queue.push({ pos: next, steps: steps + 1 });
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
  /**
   * Dodge target number (2–6) if requiresDodge is true, otherwise null.
   * Computed as: base (7 - AG) + number of opponent TZs covering the destination,
   * clamped to [2, 6].
   */
  dodgeTarget: number | null;
}

/**
 * Compute the dodge target for moving into `dest` given the mover's AG
 * and the full list of opponent positions.
 *
 * BB2020 rule:
 *   base = 7 - AG  (AG3 → 4+, AG4 → 3+, AG2 → 5+)
 *   +1 for each opponent whose tackle zone covers `dest`
 *   clamped to [2, 6]
 */
export function dodgeTargetAt(dest: Position, ag: number, opponentPositions: Position[]): number {
  const base = 7 - ag;
  const tzCount = opponentPositions.filter(op =>
    neighbours(op).some(n => n.col === dest.col && n.row === dest.row)
  ).length;
  return Math.min(6, Math.max(2, base + tzCount));
}

/**
 * Find the shortest path (Chebyshev distance) from `origin` to `target`
 * within `ma` steps, avoiding blocked squares.
 *
 * Tiebreaker: among equal-length paths, prefer the one that stays closest
 * to the straight line between origin and target (minimise cross-product deviation).
 *
 * Returns the sequence of squares from origin (exclusive) to target (inclusive),
 * each annotated with whether a dodge is required to enter it.
 * Returns null if target is unreachable within ma.
 */
export function findShortestPath(
  origin: Position,
  target: Position,
  ma: number,
  allPiecePositions: Position[],
  opponentPositions: Position[],
  ag: number = 3,
): PathStep[] | null {
  const blockedKeys = new Set(allPiecePositions.map(key));
  const tzKeys = tacklezoneKeys(opponentPositions);
  const targetKey = key(target);
  const originKey = key(origin);

  if (blockedKeys.has(targetKey)) return null;
  if (originKey === targetKey) return [];

  // Direction vector from origin to target
  const dx = target.col - origin.col;
  const dy = target.row - origin.row;

  /**
   * Cross-product deviation: how far a point `p` deviates from the straight
   * line origin→target. Lower = more "on the line".
   * |cross| = |dx*(p.row-origin.row) - dy*(p.col-origin.col)|
   */
  function deviation(p: Position): number {
    return Math.abs(dx * (p.row - origin.row) - dy * (p.col - origin.col));
  }

  type State = {
    pos: Position;
    steps: number;
    path: PathStep[];
    totalDeviation: number;
  };

  // visited: stateKey -> [minSteps, minDeviation]
  const visited = new Map<string, [number, number]>();

  const queue: State[] = [{
    pos: origin,
    steps: 0,
    path: [],
    totalDeviation: 0,
  }];
  visited.set(`${originKey}:0`, [0, 0]);

  // Sort by steps first, then by deviation (straight-line preference)
  function priority(s: State): number {
    return s.steps * 10000 + s.totalDeviation;
  }

  while (queue.length > 0) {
    queue.sort((a, b) => priority(a) - priority(b));
    const { pos, steps, path, totalDeviation } = queue.shift()!;

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

      // Dodge required only when leaving a TZ square — not carried forward.
      const needsDodge = leavingTZ;
      const stateKey = `${nk}:${needsDodge ? 1 : 0}`;
      const newDev = totalDeviation + deviation(next);

      const prev = visited.get(stateKey);
      if (prev) {
        const [prevSteps, prevDev] = prev;
        // Skip if we've already found a path that's shorter, or same length but straighter
        if (prevSteps < newSteps || (prevSteps === newSteps && prevDev <= newDev)) continue;
      }
      visited.set(stateKey, [newSteps, newDev]);

      const step: PathStep = {
        pos: next,
        requiresDodge: needsDodge,
        dodgeTarget: needsDodge ? dodgeTargetAt(next, ag, opponentPositions) : null,
      };
      queue.push({
        pos: next,
        steps: newSteps,
        path: [...path, step],
        totalDeviation: newDev,
      });
    }
  }

  return null;
}
