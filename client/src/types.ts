export type Team = 'human' | 'orc';

export interface Position {
  col: number; // 0-indexed, 0..25
  row: number; // 0-indexed, 0..14
}

export interface PlayerPiece {
  id: string;
  team: Team;
  name: string;
  position: Position;
  ma: number;
  st: number;
  ag: number;
  av: number;
  skills: string[];
  activated: boolean;
  hasBall: boolean;
}

// ── Scenario ────────────────────────────────────────────────────────────────

export interface ScenarioPieceDef {
  id: string;
  team: Team;
  name: string;
  ma: number;
  st: number;
  ag: number;
  av: number;
  skills: string[];
  position: Position;
  hasBall: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  activeTeam: Team;
  pieces: ScenarioPieceDef[];
}

// ── Game ────────────────────────────────────────────────────────────────────

export interface PendingDodge {
  pieceId: string;
  destination: Position;
  target: number;
}

export type DiceResult = {
  roll: number;
  success: boolean;
  target: number;
};

export interface DiceLogEntry {
  target: number;
  roll: number;
  success: boolean;
  cumulativeProb: number;
}

export type GamePhase =
  | 'playing'
  | 'dodge_roll'
  | 'half_over'
  | 'game_over'
  | 'touchdown'       // puzzle: all dodges passed, ball in end zone
  | 'touchdown_fail'; // puzzle: dodge failed during touchdown attempt

export type AppMode = 'home' | 'freeplay' | 'puzzle' | 'leaderboard';

export interface GameState {
  pieces: PlayerPiece[];
  activeTeam: Team;
  selectedPieceId: string | null;
  reachableSquares: Position[];
  dodgeSquares: Position[];
  originPos: Position | null;
  plannedPath: Position[];
  remainingMa: number;
  pendingDodgeStep: Position | null;
  pendingDodgeTargets: number[];
  humanTurn: number;
  orcTurn: number;
  half: 1 | 2;
  score: { human: number; orc: number };
  phase: GamePhase;
  pendingDodge: PendingDodge | null;
  lastDiceResult: DiceResult | null;
  diceLog: DiceLogEntry[];
  pendingProb: number;
  // Puzzle mode extras
  isPuzzleMode: boolean;
  scenarioId: string | null;
  isTouchdownAttempt: boolean; // End Turn was clicked with ball in end zone
}

// ── Leaderboard ─────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  id: string;
  scenarioId: string;
  name: string;
  probability: number;   // 0–1
  diceCount: number;
  date: string;          // ISO string
}
