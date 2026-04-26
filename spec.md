# Blood Bowl Prototype — Spec

## Problem Statement

Build a browser-based, two-player (hot-seat) Blood Bowl prototype. Two players share one browser and take alternating turns moving a single piece each. The scope is limited to: a pitch, one human player piece, one orc player piece, turn management, and movement with activation tracking.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript (Vite) |
| Backend | Node.js (Express) — serves the built frontend; no game logic server-side at this stage |
| Styling | Plain CSS (no UI framework) |

The backend exists to serve the app and provide a foundation for future real-time multiplayer (WebSockets). All game state lives in React for this prototype.

---

## Requirements

### Pitch
- Grid of **26 columns × 15 rows** of equal squares.
- Rendered as an HTML/CSS grid.
- Squares are visually distinct (alternating light/dark green, or a single green with grid lines).
- The pitch fills the available viewport width, squares are square (aspect ratio 1:1).

### Teams & Pieces
- **Team 1 — Human**: one piece, movement allowance (MA) = 6. Color: blue circle.
- **Team 2 — Orc**: one piece, movement allowance (MA) = 4. Color: red circle.
- Starting positions: Human at column 6, row 7 (0-indexed); Orc at column 19, row 7. (Roughly opposing thirds, centre row.)
- Pieces are rendered as filled circles centered in their square.

### Turn Structure
- Game starts on **Team 1 (Human)**'s turn.
- Each turn, the active team's piece may be activated **once**.
- After the piece has moved (or the player clicks End Turn without moving), the turn passes to the other team.
- An **"End Turn"** button is always visible. Clicking it immediately ends the current team's turn, even if their piece has not activated.
- A status bar shows: whose turn it is (e.g. "Human's Turn" / "Orc's Turn") and whether the active piece has already been activated this turn.

### Selection & Movement
- Clicking an **unactivated** piece belonging to the **active team** selects it.
- Clicking an already-activated piece, or an opponent's piece, does nothing.
- On selection, all squares reachable within the piece's MA are highlighted (flood-fill BFS/DFS, orthogonal + diagonal movement, 8-directional).
- Occupied squares (containing any piece) are **impassable** — they cannot be moved through or landed on.
- Clicking a highlighted square moves the piece there, marks it as activated, and clears the selection + highlights.
- Clicking the selected piece again (or any non-highlighted square) deselects it without moving.

### End Turn
- Clicking "End Turn":
  1. Clears selection and highlights.
  2. Resets the active team's piece activation state (ready for next turn).
  3. Switches active team to the other team.

### No Win Condition
- No ball, no scoring, no turn counter limit. The game runs indefinitely.

---

## Acceptance Criteria

1. A 26×15 green grid renders on load.
2. A blue circle (Human) and red circle (Orc) appear at their starting positions.
3. On Human's turn, clicking the blue circle highlights up to 6 reachable squares (BFS, blocked by the orc's square).
4. Clicking a highlighted square moves the piece there; highlights clear; piece is marked activated.
5. Clicking the activated piece again does nothing.
6. Clicking "End Turn" switches to Orc's turn; the orc piece is now selectable.
7. On Orc's turn, clicking the red circle highlights up to 4 reachable squares.
8. Orc moves; "End Turn" returns to Human's turn with Human piece re-activatable.
9. Neither piece can move to or through the square occupied by the other.
10. The status bar always reflects the correct active team and activation state.

---

## Implementation Steps

1. **Scaffold project** — Vite + React + TypeScript in `client/`; Express app in `server/`; root `package.json` with scripts to run both.
2. **Pitch component** — render a 26×15 CSS grid with styled squares.
3. **Game state** — define TypeScript types: `Position`, `PlayerPiece`, `Team`, `GameState`. Initialise state with both pieces at starting positions, `activeTeam: 'human'`, `activated: false`.
4. **Piece rendering** — overlay circles on the grid using absolute positioning or CSS grid placement.
5. **Selection logic** — on square click, if the clicked square contains the active team's unactivated piece, set it as selected.
6. **BFS reachability** — compute all squares reachable within MA from the selected piece's position, treating occupied squares as walls.
7. **Highlight rendering** — squares in the reachable set get a highlight style (e.g. semi-transparent yellow overlay).
8. **Move execution** — clicking a highlighted square updates piece position, sets `activated: true`, clears selection.
9. **Deselect** — clicking a non-highlighted, non-piece square clears selection.
10. **End Turn button + status bar** — wire up end-turn logic; render active team name and activation status.
11. **Express server** — serve the Vite build (or proxy to Vite dev server in development).
12. **Verify all acceptance criteria** manually.
