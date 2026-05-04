# Blood Bowl Tactical Puzzle — Spec

---

## Handoff Action

### Overview

A ball carrier can hand off the ball to an adjacent teammate at the end of their activation. The receiver must make a Catch roll. Success transfers the ball; failure causes a turnover (no submission).

This counts as the team's **Pass action** — only one handoff per team turn.

---

### Rules

**Eligibility**
- The ball carrier must be selected and have finished (or skipped) their movement.
- The receiver must be in one of the 8 adjacent squares.
- The receiver must not already be activated.
- No handoff has been performed this turn (`passUsed` flag).

**Catch Roll**
- Target = `max(2, min(6, (6 - receiver.ag) - 1 + tzCount))`
  - `6 - receiver.ag` is the base (same as dodge base)
  - `−1` for accurate pass (handoff always counts as accurate)
  - `+1` per opposing tackle zone covering the receiver's square
- Example: AG 3, no TZs → `6 - 3 - 1 = 2+` (5/6 ≈ 83.3%)

**Success**
- Ball transfers to the receiver (`hasBall` flips from carrier to receiver).
- Receiver is **not** marked activated — they can still be selected and moved this turn.
- Carrier is marked activated.

**Failure (in this puzzle context)**
- Catch failure = turnover. No submission. Same treatment as a failed dodge.
- *(Ball bounce/scatter is not simulated — failure simply ends the attempt.)*

**Probability tracking**
- The catch roll probability is logged as an `ActionLogEntry` with `kind: 'handoff'` and multiplied into `cumulativeProb`, exactly like a dodge step.

---

### Data Model Changes

**`types.ts`**

Add `passUsed` to `GameState`:
```ts
passUsed: boolean;  // true once a handoff has been performed this turn
```

Add `kind: 'handoff'` variant to `ActionLogEntry`:
```ts
export type ActionLogEntry =
  | { kind: 'move'; ... }          // existing
  | {
      kind: 'handoff';
      pieceName: string;            // carrier name
      pieceRole: string;
      receiverName: string;
      receiverRole: string;
      from: Position;               // carrier position
      to: Position;                 // receiver position
      catchTarget: number;          // the roll needed (e.g. 2)
      actionProb: number;           // success chance of this roll alone
      cumulativeProb: number;       // running product including this roll
    };
```

Add `passUsed: boolean` to `RiskyMove` is **not** needed — handoff entries are already captured via `ActionLogEntry` and filtered into `moves` by the existing risky-move logic (any entry where `actionProb < 1`).

---

### UI Flow

1. Player selects the ball carrier → moves them (or skips movement by clicking the piece again).
2. After movement is committed (piece is at its destination), the **PieceMenu** gains a **"Hand Off"** action alongside "Move".
   - "Hand Off" is disabled if `passUsed` is true or if no eligible adjacent receiver exists.
3. Player clicks "Hand Off" → game enters `handoff_targeting` phase.
   - Adjacent eligible receivers are highlighted (reachable-style highlight, distinct colour).
   - Clicking a highlighted receiver square executes the handoff.
   - Clicking elsewhere or pressing Escape cancels back to normal.
4. Handoff resolves:
   - Catch target is computed and logged.
   - `hasBall` transfers on the piece objects.
   - `passUsed` is set to `true`.
   - Carrier is marked `activated`.
   - The receiver is **not** activated — player can now select and move them.

---

### Implementation Plan

1. **`types.ts`**: Add `passUsed: boolean` to `GameState`; add `kind: 'handoff'` to `ActionLogEntry`.
2. **`bfs.ts`**: Add `catchTargetAt(receiverPos, receiverAg, opponentPositions)` — same shape as `dodgeTargetAt` but with the `−1` accurate modifier.
3. **`useGameState.ts`**:
   - Add `passUsed: false` to `makeBlankState`.
   - Reset `passUsed` in `advanceTurn` and `clearSelection`.
   - Add `handleHandoffTarget(col, row)` action: finds receiver, computes catch target, logs entry, transfers ball, marks carrier activated, sets `passUsed`.
   - Expose `handoffTargets: Set<string>` in state (adjacent eligible receivers) when in handoff targeting mode.
4. **`GameState`**: Add `handoffTargets: Set<string>` and `isHandoffTargeting: boolean` fields.
5. **`PieceMenu.tsx`**: "Hand Off" action key `'handoff'`; disabled when `passUsed || handoffTargets.size === 0`.
6. **`App.tsx`**: Wire `onAction('handoff')` to enter handoff targeting mode; wire `onSquareClick` to call `handleHandoffTarget` when `isHandoffTargeting`.
7. **`Pitch.tsx`**: Highlight `handoffTargets` squares with a distinct CSS class (`square--handoff-target`).
8. **`Pitch.css`**: Style `square--handoff-target` (e.g. green tint, distinct from reachable blue).
9. **`SubmitModal.tsx` / `ScoreSummary.tsx`**: Handle `kind: 'handoff'` rows — display as "Handoff" in the Type column, receiver name in Player column, catch target as the roll.
10. **`scenario-002.json`**: New scenario using the handoff play (see below).

---

## Pass Action

### Overview

A ball carrier can declare a Pass action, move up to their full MA, then throw to any teammate within range. The pass roll uses the passer's **PA** stat. Only an accurate pass counts — inaccurate and fumble are treated as turnovers (no submission). No interception is modelled.

This shares the `passUsed` flag with handoff — only one pass/handoff per team turn.

---

### PA Stat

Add `pa: number` to `PlayerPiece` and `ScenarioPieceDef`. Standard values by role:

| Role | PA |
|---|---|
| thrower | 3 |
| catcher | 5 |
| lineman | 5 |
| blocker (orc) | 6 |
| blitzer | 5 |

PA represents the target number before modifiers (lower = better, same convention as AG).

---

### Pass Roll

**Target = `max(2, min(6, pa - rangeModifier + tzCount))`**

Range modifiers (distance = Chebyshev distance from passer to target square):

| Band | Distance | Modifier |
|---|---|---|
| Quick Pass | 0–3 | +1 (subtract 1 from target) |
| Short Pass | 4–6 | 0 |
| Long Pass | 7–9 | −1 (add 1 to target) |
| Long Bomb | 10–13 | −2 (add 2 to target) |

TZ modifier: +1 per opposing tackle zone covering the **passer's** square.

Natural 1 always fails (fumble) — modelled by clamping minimum success to 2+, i.e. max target = 6.

**Success (accurate pass)**: ball travels to target square, receiver makes a catch roll.

**Failure**: turnover — same treatment as failed dodge (no submission).

---

### Catch Roll (after accurate pass)

Same formula as handoff catch, but the accurate modifier is already baked into the pass roll result — the catch roll for a pass uses:

**Catch target = `max(2, min(6, (6 - receiver.ag) - 1 + tzCount))`**

(identical to handoff catch — +1 accurate modifier, −1 per TZ on receiver)

---

### Pass Range Overlay

When the player enters pass targeting mode, the pitch shows a range overlay:

- All squares within 13 squares (Chebyshev) are coloured by band:
  - Quick (0–3): bright yellow tint
  - Short (4–6): green tint
  - Long (7–9): orange tint
  - Long Bomb (10–13): red tint
- Squares occupied by eligible receivers are highlighted with a distinct border
- Hovering a receiver square shows the pass target number and catch target in the HUD status

---

### Probability Tracking

Two rolls are logged for a pass play:

1. **Pass roll** — `kind: 'pass'` log entry, `passTarget` field
2. **Catch roll** — `kind: 'pass-catch'` log entry (or reuse `kind: 'handoff'` with a `passTarget` field)

Both multiply into `cumulativeProb`. The combined probability of a pass play = `P(accurate) × P(catch)`.

---

### Data Model Changes

**`PlayerPiece` and `ScenarioPieceDef`** — add `pa: number`.

**`ActionLogEntry`** — add two new entry types for a pass play:

```ts
// The throw itself — logged when the pass is declared
export type PassLogEntry = {
  kind: 'pass';
  pieceName: string;        // passer
  pieceRole: string;
  receiverName: string;
  receiverRole: string;
  from: Position;           // passer position
  to: Position;             // target square
  passTarget: number;       // pass roll needed (e.g. 3+)
  rangeBand: 'quick' | 'short' | 'long' | 'bomb';
  actionProb: number;       // P(accurate pass roll alone)
  cumulativeProb: number;   // running product after pass roll
  dodgeTarget: null;
  isGfi: false;
};

// The catch — logged immediately after the pass entry
export type PassCatchLogEntry = {
  kind: 'pass-catch';
  pieceName: string;        // receiver
  pieceRole: string;
  from: Position;           // target square (same as pass `to`)
  to: Position;             // same as from (catch is in place)
  catchTarget: number;      // catch roll needed
  actionProb: number;       // P(catch roll alone)
  cumulativeProb: number;   // running product after catch roll
  dodgeTarget: null;
  isGfi: false;
};
```

The two entries are always added together. In the log display, the pass row shows the throw (passer, range, pass target) and the catch row shows the receiver and catch target.

**`GameState`** — add:
```ts
pendingPass: boolean;        // carrier declared pass — move first, then pick target
isPassTargeting: boolean;    // carrier finished moving, now picking a throw target
passRangeKeys: Map<string, 'quick' | 'short' | 'long' | 'bomb'>; // all throwable squares
passReceiverKeys: Set<string>; // subset: squares with eligible receivers
```

**`RiskyMove`** — add optional `passTarget`, `rangeBand`, and `catchTarget` fields. A pass play produces two `RiskyMove` entries: one for the throw (`passTarget`, `rangeBand`) and one for the catch (`catchTarget`).

---

### UI Flow

1. Player right-clicks ball carrier → "Pass" in context menu (disabled if `passUsed`).
2. Carrier is selected for normal movement (`pendingPass: true`). HUD: "Pass declared — move up to N MA, then click piece to throw".
3. Player moves carrier (or skips), clicks carrier to end activation.
4. Game enters pass targeting: pitch shows range overlay, eligible receivers highlighted.
5. Player clicks a receiver → pass executes: pass target computed, catch target computed, both logged, ball transfers, carrier activated.
6. Receiver is **not** activated — can still move this turn.

---

### `bfs.ts` additions

```ts
/** Chebyshev distance between two positions */
export function chebyshevDist(a: Position, b: Position): number

/** Range band for a given distance */
export function rangeBand(dist: number): 'quick' | 'short' | 'long' | 'bomb' | null  // null = out of range (>13)

/** Range modifier for pass roll (+1 quick, 0 short, -1 long, -2 bomb) */
export function rangeModifier(band: 'quick' | 'short' | 'long' | 'bomb'): number

/** Pass target number for passer at passerPos throwing to targetPos */
export function passTargetAt(passerPos: Position, passerPa: number, targetPos: Position, opponentPositions: Position[]): number | null  // null = out of range

/** Compute all throwable squares and their range bands from passerPos */
export function computePassRange(passerPos: Position): Map<string, 'quick' | 'short' | 'long' | 'bomb'>
```

---

### Implementation Plan

1. **`types.ts`**: Add `pa` to `PlayerPiece` and `ScenarioPieceDef`; add `PassLogEntry`; add `pendingPass`, `isPassTargeting`, `passRangeKeys`, `passReceiverKeys` to `GameState`; add `passTarget`/`rangeBand` to `RiskyMove`.
2. **`bfs.ts`**: Add `chebyshevDist`, `rangeBand`, `rangeModifier`, `passTargetAt`, `computePassRange`.
3. **`useGameState.ts`**: Add `handlePassAction(pieceId)` (same pattern as `handleHandoffAction`); add `handlePassTarget(col, row)`; intercept end-activation when `pendingPass` to open pass targeting; reset `pendingPass`/`isPassTargeting` in `clearSelection`/`advanceTurn`.
4. **`PieceMenu.tsx`**: Add "Pass" action (disabled when `passUsed` or piece has no `pa`).
5. **`App.tsx`**: Wire "Pass" menu action; route square clicks through `handlePassTarget` when `isPassTargeting`; update HUD status text.
6. **`Pitch.tsx`**: Render range overlay squares (`square--range-quick`, `square--range-short`, `square--range-long`, `square--range-bomb`); highlight receiver squares (`square--pass-receiver`).
7. **`Pitch.css`**: Style range band overlays and receiver highlight.
8. **`SubmitModal.tsx` / `ScoreSummary.tsx` / `DiceLog.tsx`**: Handle `kind: 'pass'` entries — show passer → receiver, range band, pass target, catch target, combined probability.
9. **`scenario-001.json` / `scenario-002.json`**: Add `pa` to all pieces.
10. **`App.tsx` `handleSubmit`**: Include `kind: 'pass'` in risky moves extraction; map `passTarget`/`rangeBand` into `RiskyMove`.

### Acceptance Criteria

1. "Pass" appears in the context menu for ball carriers; disabled if `passUsed`.
2. Declaring a pass selects the carrier for movement with `pendingPass: true`.
3. Clicking the carrier to end activation opens pass targeting: range overlay visible, eligible receivers highlighted.
4. Clicking a receiver executes the pass: pass target and catch target computed and logged, ball transfers, carrier activated.
5. Receiver can still be activated (moved) after catching.
6. Pass probability (pass roll × catch roll) multiplies into cumulative probability.
7. Pass entries appear in Action Log, submit modal, and score summary with range band and both roll targets.
8. `passUsed` prevents a second pass or handoff in the same turn.

---

## Scenario 002 — The Handoff Play

### Concept

The thrower has the ball but cannot reach the end zone alone. A catcher is positioned ahead, within handoff range after the thrower moves. Five orcs block the path. The optimal play is: thrower moves to the catcher's vicinity, hands off, catcher dodges through the remaining orcs and scores.

### Piece Layout (portrait coordinates: col 0–14, row 0–25; end zone = row 0 for humans)

| ID | Team | Role | Name | MA | AG | Position | Ball |
|---|---|---|---|---|---|---|---|
| `thrower` | human | thrower | Aldric Swiftfoot | 6 | 3 | col 7, row 14 | ✅ |
| `catcher` | human | catcher | Sera Quickhand | 8 | 4 | col 7, row 8 | ❌ |
| `orc1` | orc | blocker | Grukk Ironjaw | 4 | 3 | col 6, row 12 | ❌ |
| `orc2` | orc | blocker | Muzgash Skullkrak | 4 | 3 | col 8, row 12 | ❌ |
| `orc3` | orc | blitzer | Vrak Bonecruncher | 6 | 3 | col 6, row 9 | ❌ |
| `orc4` | orc | blitzer | Skrag Headsmash | 6 | 3 | col 8, row 9 | ❌ |
| `orc5` | orc | blocker | Dorg Gutripper | 4 | 3 | col 7, row 5 | ❌ |

### Intended Play

1. **Thrower** (MA 6) moves from row 14 toward row 9, dodging past orc1/orc2 (TZ coverage), ending adjacent to the catcher at row 8. Hands off.
2. **Catcher** (MA 8, AG 4) catches (2+ base with accurate modifier), then moves from row 8 toward row 0, dodging past orc3/orc4 and orc5, scoring a touchdown.

### Scenario JSON

```json
{
  "id": "scenario-002",
  "name": "The Handoff Play",
  "description": "The thrower can't reach the end zone alone. Hand off to the catcher and dodge through the orc line.",
  "activeTeam": "human",
  "pieces": [
    {
      "id": "thrower", "team": "human", "role": "thrower",
      "name": "Aldric Swiftfoot",
      "ma": 6, "st": 3, "ag": 3, "av": 8,
      "skills": ["Block"],
      "position": { "col": 7, "row": 14 },
      "hasBall": true
    },
    {
      "id": "catcher", "team": "human", "role": "catcher",
      "name": "Sera Quickhand",
      "ma": 8, "st": 2, "ag": 4, "av": 7,
      "skills": ["Catch", "Dodge"],
      "position": { "col": 7, "row": 8 },
      "hasBall": false
    },
    {
      "id": "orc1", "team": "orc", "role": "blocker",
      "name": "Grukk Ironjaw",
      "ma": 4, "st": 3, "ag": 3, "av": 9,
      "skills": ["Animosity"],
      "position": { "col": 6, "row": 12 },
      "hasBall": false
    },
    {
      "id": "orc2", "team": "orc", "role": "blocker",
      "name": "Muzgash Skullkrak",
      "ma": 4, "st": 3, "ag": 3, "av": 9,
      "skills": ["Animosity"],
      "position": { "col": 8, "row": 12 },
      "hasBall": false
    },
    {
      "id": "orc3", "team": "orc", "role": "blitzer",
      "name": "Vrak Bonecruncher",
      "ma": 6, "st": 3, "ag": 3, "av": 9,
      "skills": ["Block"],
      "position": { "col": 6, "row": 9 },
      "hasBall": false
    },
    {
      "id": "orc4", "team": "orc", "role": "blitzer",
      "name": "Skrag Headsmash",
      "ma": 6, "st": 3, "ag": 3, "av": 9,
      "skills": ["Block"],
      "position": { "col": 8, "row": 9 },
      "hasBall": false
    },
    {
      "id": "orc5", "team": "orc", "role": "blocker",
      "name": "Dorg Gutripper",
      "ma": 4, "st": 3, "ag": 3, "av": 9,
      "skills": ["Animosity"],
      "position": { "col": 7, "row": 5 },
      "hasBall": false
    }
  ]
}
```

### Acceptance Criteria

1. Thrower can move up to MA 6, then the PieceMenu shows "Hand Off" if the catcher is adjacent.
2. Clicking "Hand Off" highlights the catcher's square.
3. Clicking the catcher executes the handoff: catch target computed, logged, ball transfers.
4. Catcher (not yet activated) can then be selected and moved to the end zone.
5. Touchdown triggers the submission flow with cumulative probability including the catch roll.
6. Scenario appears in the scenario select screen alongside scenario-001.

---

---

## Problem Statement

A browser-based Blood Bowl puzzle game.

---

## Leaderboard — Move Summary on Row Click

### Problem Statement

Clicking a leaderboard row should show the risky moves (dodge/GFI steps) that produced that score, in the same format as the post-touchdown submit modal. Currently the `actionLog` is not persisted — only `probability` and `diceCount` are stored.

### Data Model Changes

Add `moves` to `LeaderboardEntry` — an array of risky-move-only entries (steps where `isGfi === true` or `dodgeTarget !== null`).

**Updated `LeaderboardEntry`:**
```ts
interface LeaderboardEntry {
  id: string;
  scenarioId: string;
  name: string;
  probability: number;
  diceCount: number;
  date: string;
  moves: RiskyMove[];
}

interface RiskyMove {
  pieceName: string;
  pieceRole: string;
  from: Position;
  to: Position;
  dodgeTarget: number | null;
  isGfi: boolean;
  actionProb: number;
  cumulativeProb: number;
}
```

### Storage

`moves` is stored inside the existing Blob entry alongside the other fields. No new Blob keys needed.

### Requirements

1. **`types.ts`**: Add `RiskyMove` type and `moves: RiskyMove[]` to `LeaderboardEntry`.
2. **`api.ts`**: Update `submitScore` to accept and send `moves` in the POST body.
3. **`netlify/functions/leaderboard.js`**: Accept `moves` in POST body, store and return it.
4. **`App.tsx`**: Build `moves` from `state.actionLog` (filter to risky steps) and pass to `submitScore`.
5. **`Leaderboard.tsx`**: Row click navigates to a `ScoreSummary` panel, passing the selected entry.
6. **`ScoreSummary.tsx`** (new): Displays the risky-moves table (Player · Type · Move · Action · Chance) and cumulative probability. Has a back button returning to the leaderboard.

### Acceptance Criteria

- Submitting a score stores risky moves in the Blob entry.
- Clicking a leaderboard row shows the move summary panel.
- Summary shows: Player, Type, Move, Action, Chance, cumulative probability.
- Back button returns to the leaderboard.
- Old entries without `moves` show "No move data available" gracefully.

### Implementation Steps

1. Add `RiskyMove` type and update `LeaderboardEntry` in `types.ts`.
2. Update `submitScore` in `api.ts` to include `moves` in the POST body.
3. Update `netlify/functions/leaderboard.js` to persist and return `moves`.
4. Update `App.tsx` `handleSubmit` to extract risky moves from `actionLog` and pass to `submitScore`.
5. Create `ScoreSummary.tsx` reusing the risky-moves table markup from `SubmitModal`.
6. Update `Leaderboard.tsx` to accept `onRowClick` prop and call it on row click.
7. Wire up navigation in `App.tsx` to show `ScoreSummary` when a row is clicked.

---

## Leaderboard — Netlify Deployment

### Problem Statement

The current Express server uses in-memory storage (lost on restart) and cannot run on Netlify. The goal is to deploy the full app on Netlify: the React frontend as a static site, and the leaderboard API as Netlify Functions backed by Netlify Blobs for persistence.

### Architecture

```
Netlify CDN
├── / (static)          → client/dist  (Vite build)
└── /.netlify/functions → netlify/functions/leaderboard.js
                          reads/writes Netlify Blobs (one blob per scenarioId)
```

The existing Express server (`server/`) is retained for local development only. In production, Netlify Functions replace it.

### Storage Model

One Netlify Blob per scenario, keyed by `scenarioId`. Each blob contains a JSON array of `LeaderboardEntry` objects. On every write the full array is read, upserted, sorted, trimmed to top 10, and written back.

```json
[
  { "id": "uuid", "scenarioId": "scenario-001", "name": "Alice",
    "probability": 0.694, "diceCount": 3, "date": "2026-05-02T..." },
  ...
]
```

### Requirements

1. **Netlify Function** at `netlify/functions/leaderboard.js` handles both GET and POST for `/api/leaderboard/:scenarioId`.
2. **GET**: Read blob for `scenarioId`, return top 10 sorted `probability DESC`, `diceCount ASC`. Return `[]` if blob doesn't exist yet.
3. **POST**: Read blob, upsert entry by `name` (replace existing entry for same name with latest submission), sort, trim to top 10, write blob back. Return the upserted entry.
4. **Routing**: `netlify.toml` rewrites `/api/*` to the function, and `/*` to `index.html` for SPA routing.
5. **Client `api.ts`**: No changes needed — `/api/leaderboard/:scenarioId` continues to work identically.
6. **Local dev**: Vite proxy (`/api` → `localhost:3001`) continues to route to the Express server. `netlify dev` can also be used as an alternative local runner.
7. **Build config**: `netlify.toml` sets `base = "client"`, `publish = "dist"`, `command = "npm run build"`.

### netlify.toml

```toml
[build]
  base    = "client"
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/api/*"
  to   = "/.netlify/functions/leaderboard"
  status = 200

[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200
```

### Acceptance Criteria

- `netlify build` succeeds and produces `client/dist`.
- GET `/api/leaderboard/scenario-001` returns `[]` on first call.
- POST then GET returns the submitted entry ranked correctly.
- Submitting the same name replaces the previous entry.
- Scores persist across function cold starts (stored in Blobs, not memory).
- Local dev with Express + Vite proxy continues to work unchanged.

### Implementation Steps

1. Create `netlify/functions/leaderboard.js`:
   - Import `@netlify/blobs` (`getStore`).
   - Parse `scenarioId` from the request path.
   - GET: read blob → parse JSON → return top 10.
   - POST: read blob → upsert by name → sort → trim → write blob → return entry.
2. Add `@netlify/blobs` to a new `netlify/package.json` (or root `package.json`).
3. Create `netlify.toml` at repo root with build config and redirects above.
4. Update `client/vite.config.ts`: keep the `/api` proxy for local dev; no other changes.
5. Add `netlify/node_modules` and `.netlify` to `.gitignore`.
6. Test locally with `netlify dev` or the existing Vite + Express setup. Each scenario presents a fixed pitch state (piece positions, ball position, opponent positions). The player plans a sequence of activations to move the ball carrier into the end zone. The game tracks the cumulative probability of the chosen sequence succeeding. On touchdown, the score (probability % + dice roll count) is submitted to a global leaderboard. Players compete to find the highest-probability route to a touchdown.

The current prototype (hot-seat two-player free play) remains as a sandbox/dev mode. The puzzle mode is the primary product.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript (Vite) |
| Backend | Node.js (Express) — serves frontend, hosts leaderboard API |
| Database | Stubbed in-memory for now; interface designed for Supabase/Postgres later |
| Styling | Plain CSS |

---

## Mode 1 — Free Play (existing, keep as-is)

Hot-seat two-player sandbox. No scenarios, no leaderboard. Used for development and casual play.

---

## Mode 2 — Puzzle Mode (new)

### Scenario Definition

Scenarios are JSON files loaded at startup from `client/src/scenarios/`.

```jsonc
{
  "id": "scenario-001",
  "name": "The Simple Run",
  "description": "One blocker in the way. Find the safest path.",
  "activeTeam": "human",
  "pieces": [
    { "id": "carrier", "team": "human", "name": "Blitzer", "ma": 7, "st": 3, "ag": 3, "av": 8, "skills": ["Block", "Dodge"], "position": { "col": 10, "row": 7 }, "hasBall": true },
    { "id": "support", "team": "human", "name": "Lineman", "ma": 6, "st": 3, "ag": 3, "av": 8, "skills": [], "position": { "col": 9, "row": 6 }, "hasBall": false },
    { "id": "opp1",    "team": "orc",   "name": "Orc Blitzer", "ma": 6, "st": 3, "ag": 3, "av": 9, "skills": ["Block"], "position": { "col": 14, "row": 7 }, "hasBall": false }
  ]
}
```

Fields:
- `id` — unique string, used as leaderboard key
- `activeTeam` — which team the player controls
- `pieces` — full roster; opponent pieces are static (no AI, no activation)
- `hasBall` — exactly one piece starts with the ball

### Ball

- The ball is displayed on the pitch as a distinct marker on its carrier's square.
- Ball carrier is visually distinguished (e.g. star or ring on the piece).
- Ball mechanics beyond carrying (pickup, passing) are **deferred** — implemented in a later iteration.

### Touchdown Condition

- When the ball carrier's planned path ends in the opponent's end zone (col 25 for human team, col 0 for orc team) and the player clicks **End Turn**, the move is treated as a touchdown attempt.
- All queued dodge rolls are resolved. If all succeed, touchdown is scored and the submission flow triggers.
- If any dodge fails, the attempt fails (no submission).

### Probability Tracking

- Every dice roll required along the sequence contributes to a running cumulative probability (product of individual success chances).
- Displayed live as the player plans: e.g. "Success chance: 67%".
- On touchdown, the final probability and dice roll count are locked in.

### Submission Flow

1. Touchdown confirmed → modal shows final probability % and dice count.
2. Player enters a display name.
3. Score submitted to leaderboard API: `POST /api/leaderboard/:scenarioId` with `{ name, probability, diceCount, sequence }`.
4. Leaderboard shown immediately after submission.

### Leaderboard

- Per scenario, ranked by **probability % descending**, tiebroken by **dice count ascending** (fewer rolls = cleaner play).
- Shows: rank, name, probability %, dice count, date.
- Accessible from the scenario select screen at any time.
- API: `GET /api/leaderboard/:scenarioId` returns top 20 entries.

### Leaderboard API (stubbed)

The Express server exposes:

```
GET  /api/leaderboard/:scenarioId   → top 20 entries (in-memory for now)
POST /api/leaderboard/:scenarioId   → submit a score
```

In-memory store is replaced with a real database (Supabase/Postgres) in a later iteration without changing the API contract.

---

## Acceptance Criteria

### Scenario loading
1. Scenarios are read from JSON files in `client/src/scenarios/` at build time.
2. A scenario select screen lists all available scenarios with name and description.
3. Selecting a scenario loads the pitch with the defined piece positions and ball.

### Puzzle play
4. Only the `activeTeam` pieces are selectable; opponent pieces are static.
5. The ball marker is visible on the carrier's square.
6. Cumulative probability updates live as the player adds dodge steps to their path.
7. Clicking End Turn with the ball carrier's path ending in the end zone triggers touchdown resolution.
8. A failed dodge during touchdown resolution shows a failure modal (no submission).

### Submission & leaderboard
9. A successful touchdown shows a modal with probability % and dice count, and a name input.
10. Submitting posts to `POST /api/leaderboard/:scenarioId`.
11. The leaderboard screen shows entries ranked by probability desc, dice count asc.
12. The leaderboard is accessible without playing (from scenario select).

---

## Implementation Steps

1. **Scenario type + loader** — define `Scenario` TypeScript type; load JSON files via Vite's `import.meta.glob`; add `hasBall` to `PlayerPiece`.
2. **Scenario select screen** — new route/view listing scenarios with name, description, leaderboard button.
3. **Puzzle game mode** — fork game state initialisation to load from a `Scenario`; lock opponent pieces (no selection, no activation).
4. **Ball rendering** — display ball marker on carrier square; visually distinguish carrier piece.
5. **Touchdown detection** — in `handleEndTurn`, check if ball carrier's planned path tip is in the end zone; trigger resolution flow.
6. **Submission modal** — name input + probability/dice summary; calls leaderboard API on confirm.
7. **Leaderboard API** — Express routes `GET/POST /api/leaderboard/:scenarioId`; in-memory store with the correct sort order.
8. **Leaderboard view** — table component showing rank, name, probability %, dice count, date.
9. **First scenario JSON** — author one playable scenario to validate the full flow end-to-end.
10. **Wire routing** — home → scenario select → puzzle play → submission → leaderboard.
