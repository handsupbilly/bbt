import type { PathStep } from './bfs';

export type Team = 'human' | 'orc';

export interface Position {
  col: number; // 0-indexed, 0..25
  row: number; // 0-indexed, 0..14
}

export interface PlayerPiece {
  id: string;
  team: Team;
  name: string;
  role?: string;  // e.g. 'thrower' | 'catcher' | 'lineman' | 'blocker' | 'guard' | 'tackle'
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

export type MoveLogEntry = {
  kind: 'move';
  pieceName: string;
  pieceRole: string;
  from: Position;
  to: Position;
  steps: number;
  dodgeTarget: number | null;  // null = free move
  isGfi: boolean;              // true = Go For It step (2+ roll)
  actionProb: number;          // probability of this step alone (1 if no roll needed)
  cumulativeProb: number;      // running product up to and including this step
};

export type HandoffLogEntry = {
  kind: 'handoff';
  pieceName: string;       // carrier
  pieceRole: string;
  receiverName: string;
  receiverRole: string;
  from: Position;          // carrier position
  to: Position;            // receiver position
  catchTarget: number;     // roll needed (e.g. 2)
  actionProb: number;      // success chance of this roll alone
  cumulativeProb: number;  // running product including this roll
  // These mirror MoveLogEntry fields so existing risky-move filters work unchanged
  dodgeTarget: null;
  isGfi: false;
};

export type ActionLogEntry = MoveLogEntry | HandoffLogEntry;

export type GamePhase =
  | 'playing'
  | 'half_over'
  | 'game_over'
  | 'touchdown';

export type AppMode = 'home' | 'freeplay' | 'puzzle' | 'leaderboard';

export interface GameState {
  pieces: PlayerPiece[];
  activeTeam: Team;
  selectedPieceId: string | null;
  // All squares reachable within remaining MA (for click validation)
  reachableKeys: Set<string>;
  originPos: Position | null;
  // Squares committed so far this activation (piece stays at origin until End Turn)
  committedPath: Position[];
  walkedSquares: Position[];
  // Hover preview: shortest path from path tip to hovered square
  pathPreview: PathStep[];
  remainingMa: number;
  remainingGfi: number;        // GFI steps still available (max 2, resets each activation)
  // Dodge targets queued along committed path (rolled on End Turn)
  pendingDodgeTargets: number[];
  humanTurn: number;
  orcTurn: number;
  half: 1 | 2;
  score: { human: number; orc: number };
  phase: GamePhase;
  activationLogStart: number;  // actionLog.length when current piece was selected (for cancel rollback)
  pendingProb: number;         // product of all pending dodge probabilities this turn
  actionLog: ActionLogEntry[];
  isPuzzleMode: boolean;
  scenarioId: string | null;
  // Handoff
  passUsed: boolean;           // one handoff allowed per team turn
  pendingHandoff: boolean;     // carrier declared handoff — move first, then pick receiver
  isHandoffTargeting: boolean; // carrier finished moving, now picking a receiver
  handoffTargets: Set<string>; // keys of adjacent eligible receivers
}

// ── Leaderboard ─────────────────────────────────────────────────────────────

export interface RiskyMove {
  pieceName: string;
  pieceRole: string;
  receiverName?: string;   // handoff only
  receiverRole?: string;   // handoff only
  from: Position;
  to: Position;
  dodgeTarget: number | null;
  isGfi: boolean;
  catchTarget?: number;    // handoff only
  actionProb: number;
  cumulativeProb: number;
}

export interface LeaderboardEntry {
  id: string;
  scenarioId: string;
  name: string;
  probability: number;
  diceCount: number;
  date: string;
  moves: RiskyMove[];
}
