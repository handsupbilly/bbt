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

/**
 * Returns the 8 adjacent squares of `pos` that are on the pitch.
 */
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

/**
 * Returns the set of squares adjacent to any opponent piece —
 * i.e. squares that are in at least one tackle zone.
 */
export function tacklezoneKeys(opponentPositions: Position[]): Set<string> {
  const tz = new Set<string>();
  for (const op of opponentPositions) {
    for (const n of neighbours(op)) {
      tz.add(key(n));
    }
  }
  return tz;
}

/**
 * Count how many opponent tackle zones cover `pos`.
 */
export function countTackleZones(pos: Position, opponentPositions: Position[]): number {
  let count = 0;
  for (const op of opponentPositions) {
    for (const n of neighbours(op)) {
      if (key(n) === key(pos)) { count++; break; }
    }
  }
  return count;
}

export interface ReachResult {
  /** Squares reachable with no dodge needed */
  free: Position[];
  /** Squares reachable only via a dodge roll */
  dodge: Position[];
}

/**
 * BFS from `origin` up to `ma` steps.
 *
 * Rules:
 * - Occupied squares (any piece) are impassable.
 * - Leaving a square that is in an opponent's tackle zone requires a dodge roll.
 *   For simplicity, we treat the entire path as either free or dodge:
 *   any square reachable only via a path that passes through a TZ is a "dodge square".
 * - A square is "free" if it can be reached without ever leaving a TZ-covered square.
 * - A square is "dodge" if every path to it requires leaving at least one TZ-covered square.
 *
 * We track two BFS frontiers: one that has never triggered a dodge, one that has.
 */
export function computeReachable(
  origin: Position,
  ma: number,
  allPiecePositions: Position[],   // all pieces except the moving one
  opponentPositions: Position[],
): ReachResult {
  const blockedKeys = new Set(allPiecePositions.map(key));
  const tzKeys = tacklezoneKeys(opponentPositions);
  const originKey = key(origin);

  // BFS state: for each square, track minimum steps and whether a dodge was needed
  // We use two visited sets: "reached cleanly" and "reached via dodge"
  const cleanDist = new Map<string, number>();   // reached without any dodge
  const dodgeDist = new Map<string, number>();   // reached only via dodge path

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

      // Does moving from pos to next require a dodge?
      // In BB: you must dodge when leaving a square in a tackle zone.
      const needsDodge = dodged || leavingTZ;

      if (!needsDodge) {
        if (cleanDist.has(nk)) continue;
        cleanDist.set(nk, steps + 1);
        queue.push({ pos: next, steps: steps + 1, dodged: false });
      } else {
        // Already in dodge path — only add if not already reached cleanly or via dodge
        if (cleanDist.has(nk) || dodgeDist.has(nk)) continue;
        dodgeDist.set(nk, steps + 1);
        queue.push({ pos: next, steps: steps + 1, dodged: true });
      }
    }
  }

  const free: Position[] = [];
  const dodge: Position[] = [];

  for (const [k] of cleanDist) {
    if (k !== originKey) free.push(fromKey(k));
  }
  for (const [k] of dodgeDist) {
    dodge.push(fromKey(k));
  }

  return { free, dodge };
}
