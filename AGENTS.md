# Agent Guidelines

## Repository Layout

```
client/               React + TypeScript + Vite frontend
  src/
    scenarios/        JSON puzzle scenario definitions (add new .json files here)
    useGameState.ts   Core game logic hook
    bfs.ts            BFS pathfinding for movement
    types.ts          Shared TypeScript types
    api.ts            API client (fetchLeaderboard, submitScore)
server/               Express API — in-memory leaderboard (local dev only)
netlify/functions/    Netlify serverless leaderboard (production, uses Netlify Blobs)
```

## Setup

Each package has its own `node_modules`. Install separately:

```bash
cd client && npm install
cd server && npm install
cd netlify/functions && npm install
```

## Dev Server

Both services must run together — Vite proxies `/api/*` → `http://localhost:3001`.

```bash
# Terminal 1 — Express API (port 3001)
cd server && node index.js

# Terminal 2 — Vite frontend (port 5173)
cd client && npm run dev
```

In Gitpod, both services start automatically on container start.

## Build

```bash
# From repo root
npm run build

# Or directly
cd client && npm run build   # runs tsc -b && vite build; output → client/dist/
```

## Lint

```bash
cd client && npm run lint    # ESLint on all *.ts / *.tsx files
```

Run lint before committing. There is no separate formatter configured.

## TypeScript / JavaScript

- **Never leave unused variables or imports.** The build runs `tsc -b` with `noUnusedLocals: true` and `noUnusedParameters: true` — unused symbols are a build error.
- `tsc -b` is type-check only; Vite handles emit.

## Adding Scenarios

Drop a new `.json` file in `client/src/scenarios/`. It is picked up automatically via `import.meta.glob` — no import registration needed.

## Architecture Notes

- **Local dev** uses the Express server (`server/index.js`) with an in-memory store.
- **Production** (Netlify) uses `netlify/functions/leaderboard.js` backed by Netlify Blobs.
- No monorepo tooling (no workspaces, Turborepo, etc.) — each package is managed independently.

## Environment Variables

| Variable | Used in | Purpose |
|---|---|---|
| `PORT` | `server/index.js` | Express port (default: `3001`) |
| `NETLIFY_SITE_ID` / `SITE_ID` | `netlify/functions/leaderboard.js` | Netlify Blobs site ID |
| `NETLIFY_TOKEN` / `NETLIFY_AUTH_TOKEN` | `netlify/functions/leaderboard.js` | Netlify Blobs auth |
