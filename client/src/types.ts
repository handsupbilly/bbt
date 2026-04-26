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
  // Core Blood Bowl stats
  ma: number;   // Movement Allowance
  st: number;   // Strength
  ag: number;   // Agility
  av: number;   // Armour Value
  skills: string[];
  activated: boolean;
}

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
  target: number;       // needed on D6
  roll: number;         // what was rolled
  success: boolean;
  // cumulative probability up to and including this roll (product of all success chances so far)
  cumulativeProb: number;
}

export type GamePhase =
  | 'playing'
  | 'dodge_roll'
  | 'half_over'
  | 'game_over';

export interface GameState {
  pieces: PlayerPiece[];
  activeTeam: Team;
  selectedPieceId: string | null;
  reachableSquares: Position[];
  dodgeSquares: Position[];
  // Where the piece started this activation (piece stays here until move confirmed)
  originPos: Position | null;
  // Planned path being built (squares clicked so far, not yet committed)
  plannedPath: Position[];
  remainingMa: number;
  // Square the player has clicked once in a dodge zone (awaiting second click to confirm)
  pendingDodgeStep: Position | null;
  // Dodge targets queued along the planned path (rolled when move is confirmed)
  pendingDodgeTargets: number[];
  humanTurn: number;
  orcTurn: number;
  half: 1 | 2;
  score: { human: number; orc: number };
  phase: GamePhase;
  pendingDodge: PendingDodge | null;
  lastDiceResult: DiceResult | null;
  // Log of all dice rolls this turn
  diceLog: DiceLogEntry[];
  // Running probability product for pending dodges not yet rolled (shown as preview)
  pendingProb: number;
}
