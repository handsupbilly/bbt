import type { Position } from './types';

const COLS = 15;
const ROWS = 26;

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
  gfiRemaining: number = 0,
): ReachResult {
  const blockedKeys = new Set(allPiecePositions.map(key));
  const tzKeys = tacklezoneKeys(opponentPositions);
  const originKey = key(origin);
  const totalSteps = ma + gfiRemaining;

  const cleanDist = new Map<string, number>();
  const dodgeDist = new Map<string, number>();

  type Node = { pos: Position; steps: number };
  const queue: Node[] = [{ pos: origin, steps: 0 }];
  cleanDist.set(originKey, 0);

  while (queue.length > 0) {
    const { pos, steps } = queue.shift()!;
    if (steps >= totalSteps) continue;

    const leavingTZ = tzKeys.has(key(pos));

    for (const next of neighbours(pos)) {
      const nk = key(next);
      if (blockedKeys.has(nk)) continue;

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

  for (const [k, dist] of cleanDist) {
    if (k !== originKey) { free.push(fromKey(k)); reachableKeys.add(k); }
    void dist;
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
  /** True if this step costs a GFI (Go For It) rather than regular MA */
  isGfi: boolean;
}

/**
 * Compute the dodge target for moving into `dest` given the mover's AG
 * and the full list of opponent positions.
 *
 * BB2020 rule:
 *   base = 6 - AG  (AG3 → 3+, AG4 → 2+, AG2 → 4+)
 *   +1 for each opponent whose tackle zone covers `dest`
 *   clamped to [2, 6]
 */
export function dodgeTargetAt(dest: Position, ag: number, opponentPositions: Position[]): number {
  const base = 6 - ag;
  const tzCount = opponentPositions.filter(op =>
    neighbours(op).some(n => n.col === dest.col && n.row === dest.row)
  ).length;
  return Math.min(6, Math.max(2, base + tzCount));
}

// ── Passing ───────────────────────────────────────────────────────────────────

/** Chebyshev distance (max of col/row deltas — matches BB grid movement). */
export function chebyshevDist(a: Position, b: Position): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

/** Range band for a given Chebyshev distance. Returns null if out of range (>13). */
export function rangeBandForDist(dist: number): 'quick' | 'short' | 'long' | 'bomb' | null {
  if (dist <= 3)  return 'quick';
  if (dist <= 6)  return 'short';
  if (dist <= 9)  return 'long';
  if (dist <= 13) return 'bomb';
  return null;
}

/** Pass roll modifier for a range band (+1 quick, 0 short, -1 long, -2 bomb). */
export function rangeModifier(band: 'quick' | 'short' | 'long' | 'bomb'): number {
  switch (band) {
    case 'quick': return 1;
    case 'short': return 0;
    case 'long':  return -1;
    case 'bomb':  return -2;
  }
}

/**
 * Pass target number for a passer throwing from `passerPos` to `targetPos`.
 *
 * Formula: max(2, min(6, pa - rangeModifier + tzCount))
 *   pa            = passer's passing ability stat
 *   rangeModifier = +1 quick, 0 short, -1 long, -2 bomb
 *   tzCount       = opposing tackle zones covering the passer's square
 *
 * Returns null if target is out of range (>13 squares).
 */
export function passTargetAt(
  passerPos: Position,
  passerPa: number,
  targetPos: Position,
  opponentPositions: Position[],
): number | null {
  const dist = chebyshevDist(passerPos, targetPos);
  const band = rangeBandForDist(dist);
  if (!band) return null;

  const mod = rangeModifier(band);
  const tzCount = opponentPositions.filter(op =>
    neighbours(op).some(n => n.col === passerPos.col && n.row === passerPos.row)
  ).length;

  return Math.min(6, Math.max(2, passerPa - mod + tzCount));
}

/**
 * Compute all throwable squares from `passerPos` and their range bands.
 * Returns a Map from position key → band for every square within 13 squares.
 */
export function computePassRange(passerPos: Position): Map<string, 'quick' | 'short' | 'long' | 'bomb'> {
  const result = new Map<string, 'quick' | 'short' | 'long' | 'bomb'>();
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const pos: Position = { col: c, row: r };
      const band = rangeBandForDist(chebyshevDist(passerPos, pos));
      if (band) result.set(key(pos), band);
    }
  }
  return result;
}

/**
 * Compute the catch target for a handoff received at `receiverPos`.
 *
 * BB2020 handoff rule (accurate pass):
 *   base = 6 - AG
 *   −1 for accurate pass (handoff always counts as accurate)
 *   +1 per opposing tackle zone covering the receiver's square
 *   clamped to [2, 6]
 *
 * Example: AG 3, no TZs → 6 - 3 - 1 = 2+
 */
export function catchTargetAt(receiverPos: Position, receiverAg: number, opponentPositions: Position[]): number {
  const base = 6 - receiverAg - 1;
  const tzCount = opponentPositions.filter(op =>
    neighbours(op).some(n => n.col === receiverPos.col && n.row === receiverPos.row)
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
  gfiRemaining: number = 0,
): PathStep[] | null {
  const blockedKeys = new Set(allPiecePositions.map(key));
  const tzKeys = tacklezoneKeys(opponentPositions);
  const targetKey = key(target);
  const originKey = key(origin);
  const totalSteps = ma + gfiRemaining;

  if (blockedKeys.has(targetKey)) return null;
  if (originKey === targetKey) return [];

  const dx = target.col - origin.col;
  const dy = target.row - origin.row;

  function deviation(p: Position): number {
    return Math.abs(dx * (p.row - origin.row) - dy * (p.col - origin.col));
  }

  type State = {
    pos: Position;
    steps: number;
    path: PathStep[];
    totalDeviation: number;
  };

  const visited = new Map<string, [number, number]>();

  const queue: State[] = [{
    pos: origin,
    steps: 0,
    path: [],
    totalDeviation: 0,
  }];
  visited.set(`${originKey}:0`, [0, 0]);

  function priority(s: State): number {
    return s.steps * 10000 + s.totalDeviation;
  }

  while (queue.length > 0) {
    queue.sort((a, b) => priority(a) - priority(b));
    const { pos, steps, path, totalDeviation } = queue.shift()!;

    if (key(pos) === targetKey) {
      return path;
    }

    if (steps >= totalSteps) continue;

    const leavingTZ = tzKeys.has(key(pos));
    // This step (departing from pos) costs a GFI if we've already used all normal MA
    const stepIsGfi = steps >= ma;

    for (const next of neighbours(pos)) {
      const nk = key(next);
      if (blockedKeys.has(nk)) continue;

      const newSteps = steps + 1;
      if (newSteps > totalSteps) continue;

      const needsDodge = leavingTZ;
      // State key: destination + whether this arrival required dodge + whether it cost GFI
      const stateKey = `${nk}:${needsDodge ? 1 : 0}:${stepIsGfi ? 1 : 0}`;
      const newDev = totalDeviation + deviation(next);

      const existing = visited.get(stateKey);
      if (existing) {
        const [prevSteps, prevDev] = existing;
        if (prevSteps < newSteps || (prevSteps === newSteps && prevDev <= newDev)) continue;
      }
      visited.set(stateKey, [newSteps, newDev]);

      const step: PathStep = {
        pos: next,
        requiresDodge: needsDodge,
        dodgeTarget: needsDodge ? dodgeTargetAt(next, ag, opponentPositions) : null,
        isGfi: stepIsGfi,
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
