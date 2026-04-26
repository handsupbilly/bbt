# Blood Bowl Tactical Puzzle — Spec

---

## Problem Statement

A browser-based Blood Bowl puzzle game. Each scenario presents a fixed pitch state (piece positions, ball position, opponent positions). The player plans a sequence of activations to move the ball carrier into the end zone. The game tracks the cumulative probability of the chosen sequence succeeding. On touchdown, the score (probability % + dice roll count) is submitted to a global leaderboard. Players compete to find the highest-probability route to a touchdown.

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
